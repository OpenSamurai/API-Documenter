import { useState, useEffect, useRef } from 'react'
import { db } from '@/db'
import { useAppStore } from '@/stores/appStore'
import { getProjectLocalPath, fireAndForgetFileWrite } from '@/utils/fileSync'
import type { ConflictDetail, SyncTableName } from '@/types'
import { DiffEditor } from '@monaco-editor/react'

type ResolutionChoice = 'local' | 'remote' | 'merge' | null

interface ConflictResolutionDialogProps {
    conflicts: ConflictDetail[]
    projectId: string
    onResolved: () => void
    onClose: () => void
}

export function ConflictResolutionDialog({ conflicts, projectId, onResolved, onClose }: ConflictResolutionDialogProps) {
    const [resolutions, setResolutions] = useState<Record<string, ResolutionChoice>>(
        Object.fromEntries(conflicts.map(c => [c.localId, null]))
    )
    const [mergeData, setMergeData] = useState<Record<string, string>>({})
    const [isResolving, setIsResolving] = useState(false)
    const [selectedConflict, setSelectedConflict] = useState<string | null>(null)
    const [remoteDataCache, setRemoteDataCache] = useState<Record<string, any>>({})
    const [loadingRemote, setLoadingRemote] = useState<Record<string, boolean>>({})
    const [editingConflictId, setEditingConflictId] = useState<string | null>(null)
    const editingIdRef = useRef(editingConflictId)
    useEffect(() => { editingIdRef.current = editingConflictId }, [editingConflictId])

    const allResolved = Object.values(resolutions).every(v => v !== null)

    // Fetch remote data for conflicts that don't have it yet
    useEffect(() => {
        const fetchMissing = async () => {
            const { databaseUrl, activeBranch, proxyConnection } = useAppStore.getState()
            if (!databaseUrl && !proxyConnection?.connected) return

            for (const conflict of conflicts) {
                if (conflict.remoteData || remoteDataCache[conflict.localId]) continue
                if (conflict.conflictType === 'delete-update') continue // Remote is deleted, no data to fetch

                setLoadingRemote(prev => ({ ...prev, [conflict.localId]: true }))
                try {
                    let res;
                    if (databaseUrl) {
                        res = await (window as any).electronAPI.fetchRemoteEntity(
                            databaseUrl, conflict.tableName, conflict.localId, activeBranch || 'main'
                        )
                    } else if (proxyConnection) {
                        const proxyRes = await (window as any).electronAPI.sendHttpRequest({
                            url: `${proxyConnection.proxyUrl}/api/entity?tableName=${conflict.tableName}&entityId=${conflict.localId}&branch=${activeBranch || 'main'}`,
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${proxyConnection.token}` }
                        })
                        if (proxyRes.success) {
                            res = { success: true, data: JSON.parse(proxyRes.body) }
                        }
                    }

                    if (res?.success && res.data) {
                        setRemoteDataCache(prev => ({ ...prev, [conflict.localId]: res.data }))
                    }
                } catch (err) {
                    console.error(`[ConflictResolution] Failed to fetch remote entity ${conflict.localId}:`, err)
                } finally {
                    setLoadingRemote(prev => ({ ...prev, [conflict.localId]: false }))
                }
            }
        }
        fetchMissing()
    }, [conflicts])

    const setResolution = (localId: string, choice: ResolutionChoice) => {
        setResolutions(prev => ({ ...prev, [localId]: choice }))
        if (choice === 'merge') {
            setSelectedConflict(localId)
            setEditingConflictId(localId)
            // Initialize merge data with local data
            const conflict = conflicts.find(c => c.localId === localId)
            if (conflict?.localData && !mergeData[localId]) {
                setMergeData(prev => ({ ...prev, [localId]: formatEntityJson(conflict.localData) }))
            }
        }
    }

    const handleResolve = async () => {
        setIsResolving(true)
        try {
            const { activeBranch, databaseUrl } = useAppStore.getState()
            const localPath = await getProjectLocalPath(projectId)

            for (const conflict of conflicts) {
                const choice = resolutions[conflict.localId]
                if (!choice) continue

                const remoteEntity = conflict.remoteData || remoteDataCache[conflict.localId]

                if (choice === 'local' || choice === 'merge') {
                    // ─── KEEP LOCAL / MERGE: Push local content to DB ───
                    let entityData = conflict.localData
                    if (choice === 'merge' && mergeData[conflict.localId]) {
                        try {
                            entityData = JSON.parse(mergeData[conflict.localId])
                        } catch {
                            // If merge data is invalid JSON, fall back to local
                        }
                    }

                    if (entityData) {
                        const newVersion = Math.max(conflict.localVersion, conflict.remoteVersion) + 1
                        entityData.version = newVersion

                        // Update local sync_queue: conflict → pending with baseVersion = remote to bypass conflict check
                        const queueItems = await db.syncQueue
                            .where('[projectId+localId]')
                            .equals([projectId, conflict.localId])
                            .toArray()

                        for (const item of queueItems) {
                            if (item.status === 'conflict') {
                                const payload = typeof item.data === 'string' ? JSON.parse(item.data) : item.data
                                payload.baseVersion = conflict.remoteVersion
                                payload.version = newVersion
                                Object.assign(payload, entityData)
                                await db.syncQueue.update(item.id, {
                                    status: 'pending',
                                    data: JSON.stringify(payload)
                                })
                            }
                        }

                        // If no queue item exists (e.g., update-delete conflict), create one
                        if (queueItems.length === 0) {
                            const { v4: uuid } = await import('uuid')
                            await db.syncQueue.add({
                                id: uuid(),
                                localId: conflict.localId,
                                projectId,
                                branch: activeBranch || 'main',
                                tableName: conflict.tableName,
                                operation: conflict.conflictType === 'update-delete' ? 'create' : 'update',
                                data: JSON.stringify({ ...entityData, baseVersion: conflict.remoteVersion }),
                                status: 'pending',
                                retries: 0,
                                createdAt: new Date().toISOString()
                            })
                        }

                        // Update local IndexedDB
                        const dbTable = getDbTable(conflict.tableName)
                        if (dbTable) {
                            await dbTable.update(conflict.localId, {
                                ...entityData,
                                version: newVersion,
                                syncStatus: 'pending'
                            })
                        }

                        // Update local file
                        if (localPath) {
                            try {
                                await writeEntityFile(localPath, conflict.tableName, { ...entityData, version: newVersion })
                            } catch (err) {
                                console.warn(`[ConflictResolution] Failed to write file for ${conflict.localId}:`, err)
                            }
                        }
                    }
                } else if (choice === 'remote') {
                    if (conflict.conflictType === 'delete-update') {
                        // ─── Remote deleted, user accepts deletion ───
                        // Delete local entity and file
                        const dbTable = getDbTable(conflict.tableName)
                        if (dbTable) await dbTable.delete(conflict.localId)
                        if (localPath && conflict.localData) {
                            try {
                                await deleteEntityFile(localPath, conflict.tableName, conflict.localData)
                            } catch (err) {
                                console.warn(`[ConflictResolution] Failed to delete file for ${conflict.localId}:`, err)
                            }
                        }
                        // Remove queue entries
                        const queueItems = await db.syncQueue
                            .where('[projectId+localId]')
                            .equals([projectId, conflict.localId])
                            .toArray()
                        for (const item of queueItems) await db.syncQueue.delete(item.id)
                    } else if (conflict.conflictType === 'update-delete') {
                        // ─── Local deleted, accept remote update: Restore entity ───
                        if (remoteEntity) {
                            const dbTable = getDbTable(conflict.tableName)
                            const mapped = mapRemoteEntity(conflict.tableName, remoteEntity)
                            if (dbTable && mapped) {
                                await dbTable.put({
                                    ...mapped,
                                    projectId,
                                    syncStatus: 'synced',
                                    version: conflict.remoteVersion
                                })
                            }
                            if (localPath) {
                                try {
                                    await writeEntityFile(localPath, conflict.tableName, {
                                        ...mapped, projectId, version: conflict.remoteVersion
                                    })
                                } catch (err) {
                                    console.warn(`[ConflictResolution] Failed to write restored file for ${conflict.localId}:`, err)
                                }
                            }
                        }
                        // Remove queue entries
                        const queueItems = await db.syncQueue
                            .where('[projectId+localId]')
                            .equals([projectId, conflict.localId])
                            .toArray()
                        for (const item of queueItems) await db.syncQueue.delete(item.id)
                    } else {
                        // ─── UPDATE-UPDATE: Accept remote version ───
                        if (remoteEntity) {
                            const dbTable = getDbTable(conflict.tableName)
                            const mapped = mapRemoteEntity(conflict.tableName, remoteEntity)
                            if (dbTable && mapped) {
                                await dbTable.put({
                                    ...mapped,
                                    projectId,
                                    syncStatus: 'synced',
                                    version: conflict.remoteVersion
                                })
                            }
                            if (localPath) {
                                try {
                                    await writeEntityFile(localPath, conflict.tableName, {
                                        ...mapped, projectId, version: conflict.remoteVersion
                                    })
                                } catch (err) {
                                    console.warn(`[ConflictResolution] Failed to write remote file for ${conflict.localId}:`, err)
                                }
                            }
                        }
                        // Remove queue entries
                        const queueItems = await db.syncQueue
                            .where('[projectId+localId]')
                            .equals([projectId, conflict.localId])
                            .toArray()
                        for (const item of queueItems) await db.syncQueue.delete(item.id)
                    }
                }

                // Update syncMeta
                if (localPath) {
                    const syncMetaRes = await (window as any).electronAPI.readSyncMeta(localPath)
                    if (syncMetaRes?.data) {
                        const syncMeta = syncMetaRes.data
                        const entities = syncMeta.entities || {}
                        if (choice === 'remote') {
                            if (conflict.conflictType === 'delete-update') {
                                delete entities[conflict.localId]
                            } else {
                                entities[conflict.localId] = {
                                    baseVersion: conflict.remoteVersion,
                                    lastCommit: syncMeta.lastSyncedCommit || '',
                                    tableName: conflict.tableName
                                }
                            }
                        } else {
                            // local or merge
                            const newVersion = Math.max(conflict.localVersion, conflict.remoteVersion) + 1
                            entities[conflict.localId] = {
                                baseVersion: newVersion,
                                lastCommit: syncMeta.lastSyncedCommit || '',
                                tableName: conflict.tableName
                            }
                        }
                        syncMeta.entities = entities
                        fireAndForgetFileWrite('writeSyncMeta', () =>
                            (window as any).electronAPI.writeSyncMeta(localPath, syncMeta)
                        )
                    }
                }
            }

            onResolved()
        } catch (err) {
            console.error('[ConflictResolution] Error:', err)
        } finally {
            setIsResolving(false)
        }
    }

    const getEntityTypeName = (tableName: string) => {
        if (tableName === 'apiCollections') return 'API'
        if (tableName === 'folders') return 'Folder'
        if (tableName === 'environments') return 'Environment'
        return tableName
    }

    const getConflictDescription = (conflict: ConflictDetail) => {
        if (conflict.conflictType === 'update-update') return 'Modified both locally and remotely'
        if (conflict.conflictType === 'delete-update') return 'Deleted remotely, but modified locally'
        if (conflict.conflictType === 'update-delete') return 'Deleted locally, but modified remotely'
        return 'Version conflict'
    }

    const activeConflict = selectedConflict ? conflicts.find(c => c.localId === selectedConflict) : null

    return (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose} style={{ padding: '24px' }}>
            <div
                className="w-full bg-[#0a0a0a] rounded-[16px] shadow-2xl flex flex-col overflow-hidden"
                style={{ maxWidth: activeConflict && resolutions[activeConflict.localId] === 'merge' ? '900px' : '620px', border: '1px solid #222', maxHeight: '85vh', transition: 'max-width 0.3s ease' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '24px', borderBottom: '1px solid #222' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-500" style={{ width: '36px', height: '36px' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white" style={{ margin: 0 }}>Sync Conflicts Detected</h2>
                            <p className="text-xs text-neutral-500" style={{ margin: '4px 0 0 0' }}>
                                {conflicts.length} item{conflicts.length > 1 ? 's' : ''} need resolution before sync can continue
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                    {/* Left: Conflict List */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }} className="scrollbar-thin">
                        {conflicts.map((conflict, index) => {
                            const remoteEntity = conflict.remoteData || remoteDataCache[conflict.localId]
                            const isSelected = selectedConflict === conflict.localId
                            const resolution = resolutions[conflict.localId]

                            return (
                                <div
                                    key={conflict.localId}
                                    onClick={() => setSelectedConflict(conflict.localId)}
                                    style={{
                                        padding: '16px',
                                        borderRadius: '12px',
                                        border: isSelected ? '1px solid #333' : '1px solid #1a1a1a',
                                        marginBottom: '12px',
                                        background: isSelected ? '#111' : resolution ? '#0d0d0d' : '#0a0a0a',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {/* Entity Info */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="text-[10px] font-bold text-amber-500 px-1.5 py-0.5 rounded bg-amber-500/10" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {getEntityTypeName(conflict.tableName)}
                                            </span>
                                            <span className="text-sm text-neutral-200 font-medium truncate" style={{ maxWidth: '180px' }}>
                                                {conflict.entityName}
                                            </span>
                                        </div>
                                        {resolution && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                resolution === 'local' ? 'bg-blue-500/10 text-blue-400' :
                                                resolution === 'remote' ? 'bg-green-500/10 text-green-400' :
                                                'bg-purple-500/10 text-purple-400'
                                            }`}>
                                                {resolution === 'local' ? '⬆ LOCAL' : resolution === 'remote' ? '⬇ REMOTE' : '✏ MERGE'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Conflict Description */}
                                    <p className="text-[11px] text-neutral-500 mb-3" style={{ margin: '0 0 12px 0' }}>
                                        {getConflictDescription(conflict)}
                                    </p>

                                    {/* Version badges */}
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '12px' }}>
                                        <span className="text-[10px] text-neutral-600 bg-neutral-800/50 px-1.5 py-0.5 rounded font-mono">
                                            base v{conflict.baseVersion}
                                        </span>
                                        {conflict.localData && (
                                            <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-mono">
                                                local v{conflict.localVersion}
                                            </span>
                                        )}
                                        {conflict.conflictType !== 'delete-update' && (
                                            <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-mono">
                                                remote v{conflict.remoteVersion}
                                            </span>
                                        )}
                                        {conflict.conflictType === 'delete-update' && (
                                            <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-mono">
                                                🗑 deleted
                                            </span>
                                        )}
                                    </div>

                                    {/* Resolution Buttons */}
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {conflict.conflictType === 'delete-update' ? (
                                            <>
                                                <ResolutionButton
                                                    active={resolution === 'local'}
                                                    onClick={() => setResolution(conflict.localId, 'local')}
                                                    color="blue"
                                                    label="⬆ Keep My Changes"
                                                />
                                                <ResolutionButton
                                                    active={resolution === 'remote'}
                                                    onClick={() => setResolution(conflict.localId, 'remote')}
                                                    color="red"
                                                    label="🗑 Accept Deletion"
                                                />
                                            </>
                                        ) : conflict.conflictType === 'update-delete' ? (
                                            <>
                                                <ResolutionButton
                                                    active={resolution === 'remote'}
                                                    onClick={() => setResolution(conflict.localId, 'remote')}
                                                    color="green"
                                                    label="⬇ Restore Remote"
                                                />
                                                <ResolutionButton
                                                    active={resolution === 'local'}
                                                    onClick={() => setResolution(conflict.localId, 'local')}
                                                    color="red"
                                                    label="🗑 Confirm Delete"
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <ResolutionButton
                                                    active={resolution === 'local'}
                                                    onClick={() => setResolution(conflict.localId, 'local')}
                                                    color="blue"
                                                    label={`⬆ Keep Local`}
                                                />
                                                <ResolutionButton
                                                    active={resolution === 'remote'}
                                                    onClick={() => setResolution(conflict.localId, 'remote')}
                                                    color="green"
                                                    label={`⬇ Keep Remote`}
                                                />
                                                <ResolutionButton
                                                    active={resolution === 'merge'}
                                                    onClick={() => setResolution(conflict.localId, 'merge')}
                                                    color="purple"
                                                    label="✏ Manual Merge"
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                        onClick={onClose}
                        className="text-sm font-bold text-neutral-500 hover:text-white transition-all"
                        style={{ padding: '0 16px', height: '44px', cursor: 'pointer', background: 'none', border: 'none' }}
                    >
                        Dismiss
                    </button>
                    <button
                        onClick={handleResolve}
                        disabled={!allResolved || isResolving}
                        className="text-sm font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
                        style={{
                            padding: '0 24px',
                            height: '44px',
                            background: allResolved ? '#3b82f6' : '#333',
                            color: allResolved ? '#fff' : '#666',
                            border: 'none',
                            cursor: allResolved ? 'pointer' : 'not-allowed',
                            opacity: isResolving ? 0.5 : 1
                        }}
                    >
                        {isResolving ? 'Resolving...' : `Resolve ${conflicts.length} Conflict${conflicts.length > 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>

            {/* Full Screen Merge Overlay (Hidden via CSS when not active to prevent Monaco unmount crash) */}
            <div 
                className="fixed inset-0 bg-[#0A0A0A] z-[1000] flex flex-col transition-opacity duration-200"
                style={{ 
                    opacity: editingConflictId ? 1 : 0, 
                    pointerEvents: editingConflictId ? 'auto' : 'none',
                    visibility: editingConflictId ? 'visible' : 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#222]">
                    <div className="flex items-center gap-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        <div>
                            <h2 className="text-lg font-bold text-white">Manual Merge Editor</h2>
                            <p className="text-xs text-neutral-400 mt-0.5">Resolve the JSON differences below.</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                if (editingConflictId) {
                                    setResolutions(prev => ({ ...prev, [editingConflictId]: null }))
                                }
                                setEditingConflictId(null)
                            }}
                            className="px-5 py-2 rounded-lg text-sm font-bold text-neutral-400 hover:text-white hover:bg-[#222] transition-colors"
                        >
                            Cancel Merge
                        </button>
                        <button
                            onClick={() => setEditingConflictId(null)}
                            className="px-5 py-2 rounded-lg text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20 transition-all"
                        >
                            Save & Continue
                        </button>
                    </div>
                </div>
                <div className="flex-1 relative flex">
                    <DiffEditor
                        language="json"
                        original={formatEntityJson(conflicts.find(c => c.localId === (editingConflictId || editingIdRef.current))?.remoteData || remoteDataCache[editingConflictId || editingIdRef.current || ''])}
                        modified={mergeData[editingConflictId || editingIdRef.current || ''] || formatEntityJson(conflicts.find(c => c.localId === (editingConflictId || editingIdRef.current))?.localData)}
                        theme="vs-dark"
                        keepCurrentOriginalModel={true}
                        keepCurrentModifiedModel={true}
                        options={{
                            renderSideBySide: true,
                            readOnly: false,
                            originalEditable: false,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            fontSize: 13
                        }}
                        onMount={(editor) => {
                            const modifiedEditor = editor.getModifiedEditor();
                            modifiedEditor.onDidChangeModelContent(() => {
                                const val = modifiedEditor.getValue();
                                const currentId = editingIdRef.current;
                                if (currentId) {
                                    setMergeData(prev => ({ ...prev, [currentId]: val || '' }));
                                }
                            });
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

// ─── Sub-Components ──────────────────────────────────────────────

function ResolutionButton({ active, onClick, color, label }: {
    active: boolean
    onClick: () => void
    color: 'blue' | 'green' | 'red' | 'purple'
    label: string
}) {
    const colors = {
        blue: { border: '#3b82f6', bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
        green: { border: '#22c55e', bg: 'rgba(34,197,94,0.1)', text: '#22c55e' },
        red: { border: '#ef4444', bg: 'rgba(239,68,68,0.1)', text: '#ef4444' },
        purple: { border: '#a855f7', bg: 'rgba(168,85,247,0.1)', text: '#a855f7' }
    }
    const c = colors[color]

    return (
        <button
            onClick={e => { e.stopPropagation(); onClick() }}
            className="text-[11px] font-bold transition-all"
            style={{
                flex: 1,
                minWidth: '80px',
                padding: '8px 10px',
                borderRadius: '8px',
                border: active ? `2px solid ${c.border}` : '1px solid #333',
                background: active ? c.bg : 'transparent',
                color: active ? c.text : '#666',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
            }}
        >
            {label}
        </button>
    )
}

// ─── Utility Functions ───────────────────────────────────────────

function formatEntityJson(data: any): string {
    if (!data) return '(no data)'
    try {
        // Strip internal fields for cleaner display
        const { syncStatus, lastSync, createdAt, updatedAt, ...clean } = data
        return JSON.stringify(clean, null, 2)
    } catch {
        return String(data)
    }
}

function getDbTable(tableName: string) {
    if (tableName === 'folders') return db.folders
    if (tableName === 'apiCollections') return db.apiCollections
    if (tableName === 'environments') return db.environments
    return null
}

async function writeEntityFile(localPath: string, tableName: string, entityData: any) {
    if (tableName === 'apiCollections') {
        await (window as any).electronAPI.writeApiFile(localPath, entityData.folderId, entityData)
    } else if (tableName === 'folders') {
        await (window as any).electronAPI.writeFolderMeta(localPath, entityData)
    } else if (tableName === 'environments') {
        await (window as any).electronAPI.writeEnvironmentFile(localPath, entityData)
    }
}

async function deleteEntityFile(localPath: string, tableName: string, entityData: any) {
    if (tableName === 'apiCollections') {
        await (window as any).electronAPI.deleteApiFile(localPath, entityData.folderId, entityData.id)
    } else if (tableName === 'folders') {
        await (window as any).electronAPI.deleteFolderDir(localPath, entityData.id)
    } else if (tableName === 'environments') {
        await (window as any).electronAPI.deleteEnvironmentFile(localPath, entityData.id)
    }
}

function mapRemoteEntity(tableName: string, raw: any): any {
    if (!raw) return null
    // Simple camelCase mapping for DB rows
    if (tableName === 'folders') {
        return {
            id: raw.id,
            projectId: raw.project_id || raw.projectId,
            name: raw.name,
            description: raw.description,
            orderIndex: raw.order_index ?? raw.orderIndex ?? 0,
            version: raw.version || 1,
            syncStatus: 'synced'
        }
    }
    if (tableName === 'apiCollections') {
        const parse = (v: any) => { try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return v } }
        return {
            id: raw.id,
            projectId: raw.project_id || raw.projectId,
            folderId: raw.folder_id || raw.folderId,
            name: raw.name,
            description: raw.description,
            method: raw.method,
            path: raw.path,
            urlParams: parse(raw.url_params || raw.urlParams || []),
            headers: parse(raw.headers || []),
            bodyType: raw.body_type || raw.bodyType || 'none',
            rawType: raw.raw_type || raw.rawType || 'json',
            formData: parse(raw.form_data || raw.formData || []),
            urlencoded: parse(raw.urlencoded || []),
            requestBody: raw.request_body || raw.requestBody || '',
            responseExamples: parse(raw.response_examples || raw.responseExamples || []),
            version: raw.version || 1,
            syncStatus: 'synced'
        }
    }
    if (tableName === 'environments') {
        return {
            id: raw.id,
            projectId: raw.project_id || raw.projectId,
            folderId: raw.folder_id || raw.folderId || null,
            name: raw.name,
            baseUrl: raw.base_url || raw.baseUrl || '',
            isGlobal: [1, true, 'true', '1'].includes(raw.is_global ?? raw.isGlobal),
            variables: raw.variables || '{}',
            version: raw.version || 1,
            syncStatus: 'synced'
        }
    }
    return raw
}
