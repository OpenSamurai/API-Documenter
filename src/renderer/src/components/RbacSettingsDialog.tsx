import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProject } from '@/hooks/useProjects'
import { useFolders } from '@/hooks/useFolders'
import { useEnvironments } from '@/hooks/useEnvironments'
import { v4 as uuid } from 'uuid'

interface RbacMember {
    id: string
    email: string
    token: string
    allowed_folders: string | any[] | Record<string, 'viewer' | 'editor'>
    allowed_environments: string | any[] | Record<string, 'viewer' | 'editor'>
    role: 'viewer' | 'editor' | 'admin'
}

export function RbacSettingsDialog() {
    const { currentProjectId, setShowRbacSettings } = useAppStore()
    const { data: project, isLoading: projectLoading } = useProject(currentProjectId)
    const { data: folders } = useFolders(currentProjectId)
    const { data: environments } = useEnvironments(currentProjectId)

    const [members, setMembers] = useState<RbacMember[]>([])
    const [loading, setLoading] = useState(false)
    const [membersFetched, setMembersFetched] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [editingMember, setEditingMember] = useState<string | null>(null)

    const [newUser, setNewUser] = useState({
        email: '',
        role: 'viewer' as 'viewer' | 'editor' | 'admin',
        folders: [] as string[],
        folderRoles: {} as Record<string, 'viewer' | 'editor'>,
        environments: [] as string[],
        environmentRoles: {} as Record<string, 'viewer' | 'editor'>
    })

    useEffect(() => {
        if (environments && environments.length > 0 && !editingMember) {
            const globalEnv = environments.find(e => e.isGlobal || e.name.toLowerCase() === 'global')
            if (globalEnv && !newUser.environments.includes(globalEnv.id)) {
                setNewUser(prev => ({
                    ...prev,
                    environments: [...prev.environments, globalEnv.id],
                    environmentRoles: { ...prev.environmentRoles, [globalEnv.id]: 'viewer' }
                }))
            }
        }
    }, [environments, editingMember])

    const [successData, setSuccessData] = useState<{ id: string, email: string, token: string, role: string, folders: string, environments: string } | null>(null)

    const fetchMembers = async () => {
        if (!project?.databaseUrl || !currentProjectId) return
        setLoading(true)
        setFetchError(null)
        try {
            const res = await window.electronAPI.getRbacUsers(project.databaseUrl, currentProjectId)
            if (res.success) {
                setMembers(res.users || [])
                setMembersFetched(true)
                setFetchError(null)
            } else {
                // Surface the real DB error — usually caused by VPN blocking the port,
                // a wrong DB URL, or a firewall rule.
                const errMsg = res.error || 'Unknown database error'
                console.error('[RBAC] getRbacUsers failed:', errMsg)
                setFetchError(errMsg)
            }
        } catch (err: any) {
            const errMsg = err?.message || String(err)
            console.error('[RBAC] Failed to fetch members:', errMsg)
            setFetchError(errMsg)
        } finally {
            setLoading(false)
        }
    }

    // Re-run whenever the project object itself resolves (not just the URL string),
    // which fixes the race condition where project starts as undefined.
    useEffect(() => {
        if (project?.databaseUrl && currentProjectId) {
            fetchMembers()
        }
    }, [project, currentProjectId])

    const handleAddUser = async () => {
        if (!newUser.email || newUser.folders.length === 0) return alert('Email and at least one folder required')
        if (!project?.databaseUrl) return alert('Database connection required to provision users.')

        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

        const allowedFolders = newUser.folders.includes('*')
            ? ['*']
            : newUser.folders.map(id => ({
                folderId: id,
                role: newUser.folderRoles[id] || (newUser.role === 'admin' ? 'editor' : newUser.role)
            }))

        const allowedEnvironments = newUser.environments.map(id => ({
            envId: id,
            role: newUser.environmentRoles[id] || 'viewer'
        }))

        const userId = uuid()
        const res = await window.electronAPI.createRbacUser(project.databaseUrl, {
            id: userId,
            email: newUser.email,
            token,
            allowedFolders: allowedFolders as any,
            allowedEnvironments: allowedEnvironments as any,
            projectId: currentProjectId!,
            role: newUser.role
        })

        if (res.success) {
            setSuccessData({
                id: userId,
                email: newUser.email,
                token,
                role: newUser.role,
                folders: formatFolders(allowedFolders),
                environments: formatEnvironments(allowedEnvironments)
            })
            setNewUser({ email: '', role: 'viewer', folders: [], folderRoles: {}, environments: [], environmentRoles: {} })
            fetchMembers()
        } else {
            alert('Failed to add user: ' + res.error)
        }
    }

    const handleDeleteUser = async (userId: string) => {
        if (!project?.databaseUrl || !confirm('Are you sure you want to remove this user?')) return
        const res = await window.electronAPI.deleteRbacUser(project.databaseUrl, userId)
        if (res.success) {
            setMembers(members.filter(m => m.id !== userId))
        } else {
            alert('Failed to delete user: ' + res.error)
        }
    }

    const handleEditMember = (member: RbacMember) => {
        setEditingMember(member.id)
        const foldersData = typeof member.allowed_folders === 'string' ? JSON.parse(member.allowed_folders) : member.allowed_folders

        let selectedFolders: string[] = []
        let roles: Record<string, 'viewer' | 'editor'> = {}

        if (Array.isArray(foldersData)) {
            if (foldersData[0] === '*') {
                selectedFolders = ['*']
            } else if (typeof foldersData[0] === 'object' && foldersData[0] !== null) {
                selectedFolders = foldersData.map(f => f.folderId)
                roles = Object.fromEntries(foldersData.map(f => [f.folderId, f.role]))
            } else {
                selectedFolders = foldersData.map(name => {
                    const f = folders?.find(x => x.name === name)
                    return f?.id || name
                })
                roles = Object.fromEntries(foldersData.map(name => {
                    const f = folders?.find(x => x.name === name)
                    return [f?.id || name, member.role as any]
                }))
            }
        } else if (foldersData && typeof foldersData === 'object') {
            selectedFolders = Object.keys(foldersData).map(name => {
                const f = folders?.find(x => x.name === name)
                return f?.id || name
            })
            roles = Object.fromEntries(
                Object.entries(foldersData).map(([name, role]) => {
                    const f = folders?.find(x => x.name === name)
                    return [f?.id || name, role as 'viewer' | 'editor']
                })
            )
        }

        const envsData = typeof member.allowed_environments === 'string' ? JSON.parse(member.allowed_environments) : member.allowed_environments

        let selectedEnvs: string[] = []
        let envRoles: Record<string, 'viewer' | 'editor'> = {}

        if (Array.isArray(envsData)) {
            selectedEnvs = envsData.map(e => e.envId)
            envRoles = Object.fromEntries(envsData.map(e => [e.envId, e.role]))
        } else if (envsData && typeof envsData === 'object') {
            selectedEnvs = Object.keys(envsData)
            envRoles = envsData
        }

        setNewUser({
            email: member.email,
            role: member.role,
            folders: selectedFolders,
            folderRoles: roles,
            environments: selectedEnvs,
            environmentRoles: envRoles
        })
    }

    const handleSaveUpdate = async () => {
        if (!editingMember || !project?.databaseUrl) return

        const allowedFolders = newUser.folders.includes('*')
            ? ['*']
            : newUser.folders.map(id => ({
                folderId: id,
                role: newUser.folderRoles[id] || (newUser.role === 'admin' ? 'editor' : newUser.role)
            }))

        const allowedEnvironments = newUser.environments.map(id => ({
            envId: id,
            role: newUser.environmentRoles[id] || 'viewer'
        }))

        const res = await window.electronAPI.updateRbacUser(project.databaseUrl, {
            id: editingMember,
            email: newUser.email,
            allowedFolders: allowedFolders as any,
            allowedEnvironments: allowedEnvironments as any,
            role: newUser.role
        })

        if (res.success) {
            setMembers(members.map(m => m.id === editingMember ? {
                ...m,
                email: newUser.email,
                role: newUser.role,
                allowed_folders: JSON.stringify(allowedFolders),
                allowed_environments: JSON.stringify(allowedEnvironments)
            } : m))
            setEditingMember(null)
            setNewUser({ email: '', role: 'viewer', folders: [], folderRoles: {}, environments: [], environmentRoles: {} })
            fetchMembers()
        } else {
            alert('Failed to update user: ' + res.error)
        }
    }

    const renderPermissionTags = (type: 'folder' | 'env', dataRaw: any) => {
        if (!dataRaw) return <span style={{ color: '#52525B', fontSize: '13px' }}>None</span>
        const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw

        // Map and deduplicate by ID
        const resolvedMap = new Map<string, { label: string, role: string }>()

        if (type === 'folder') {
            if (Array.isArray(data)) {
                if (data[0] === '*') {
                    resolvedMap.set('*', { label: 'All Folders', role: 'admin' })
                } else {
                    data.forEach((f: any) => {
                        const rawId = typeof f === 'string' ? f : (f.folderId || f.id || '')
                        const role = typeof f === 'object' ? (f.role || 'editor') : 'editor'
                        const id = String(rawId).trim()
                        const folder = folders?.find(x =>
                            String(x.id).trim().toLowerCase() === id.toLowerCase() ||
                            String(x.name).trim().toLowerCase() === id.toLowerCase()
                        )
                        resolvedMap.set(id, { label: folder?.name || id, role })
                    })
                }
            } else if (typeof data === 'object' && data !== null) {
                Object.entries(data).forEach(([key, role]) => {
                    const id = String(key).trim()
                    const folder = folders?.find(x =>
                        String(x.id).trim().toLowerCase() === id.toLowerCase() ||
                        String(x.name).trim().toLowerCase() === id.toLowerCase()
                    )
                    resolvedMap.set(id, { label: folder?.name || id, role: role as any })
                })
            }
        } else {
            if (Array.isArray(data)) {
                data.forEach((e: any) => {
                    const rawId = typeof e === 'string' ? e : (e.envId || e.id || '')
                    const role = typeof e === 'object' ? (e.role || 'viewer') : 'viewer'
                    const id = String(rawId).trim()
                    const env = environments?.find(x =>
                        String(x.id).trim().toLowerCase() === id.toLowerCase() ||
                        String(x.name).trim().toLowerCase() === id.toLowerCase()
                    )
                    resolvedMap.set(id, { label: env?.name || id, role })
                })
            } else if (typeof data === 'object' && data !== null) {
                Object.entries(data).forEach(([key, role]) => {
                    const id = String(key).trim()
                    const env = environments?.find(x =>
                        String(x.id).trim().toLowerCase() === id.toLowerCase() ||
                        String(x.name).trim().toLowerCase() === id.toLowerCase()
                    )
                    resolvedMap.set(id, { label: env?.name || id, role: role as any })
                })
            }
        }

        const tags = Array.from(resolvedMap.entries()).map(([id, info], i) => (
            <Tag
                key={id + i}
                label={info.label}
                role={info.role}
                icon={id === '*' ? 'star' : (type === 'folder' ? 'folder' : 'Zap')}
            />
        ))

        if (tags.length === 0) return <span style={{ color: '#52525B', fontSize: '12px' }}>None</span>

        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tags}
            </div>
        )
    }

    const formatEnvironments = (envsDataRaw: any) => {
        if (!envsDataRaw) return 'None'
        const data = typeof envsDataRaw === 'string' ? JSON.parse(envsDataRaw) : envsDataRaw
        if (Array.isArray(data)) {
            return data.map((e: any) => {
                const env = environments?.find(x => x.id === e.envId)
                return `${env?.name || e.envId} (${e.role})`
            }).join(', ')
        }
        return 'None'
    }

    const formatFolders = (foldersDataRaw: any) => {
        if (!foldersDataRaw) return 'None'
        const data = typeof foldersDataRaw === 'string' ? JSON.parse(foldersDataRaw) : foldersDataRaw
        if (Array.isArray(data)) {
            if (data[0] === '*') return 'All Folders (*)'
            if (typeof data[0] === 'object' && data[0] !== null) {
                return data.map((f: any) => {
                    const folder = folders?.find(x => x.id === f.folderId)
                    return `${folder?.name || f.folderId} (${f.role})`
                }).join(', ')
            }
        }
        return 'None'
    }

    const isDeployed = !!project?.proxyUrl;
    const isValidInvite = isDeployed && newUser.email.includes('@') && newUser.folders.length > 0;

    return (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div
                className="w-full bg-[#0D0D0D] rounded-[16px] shadow-2xl scale-in"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: 'min(1000px, 94vw)',
                    maxHeight: 'min(800px, 90vh)',
                    border: '1px solid #1F1F1F',
                    overflow: 'hidden'
                }}
            >
                {/* Header Section */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #1A1A1A' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="rounded-xl bg-white/5 border border-white/10" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                            </div>
                            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', margin: 0 }}>Team & Permissions</h2>
                        </div>
                        <p style={{ fontSize: '14px', color: '#9CA3AF', margin: 0, paddingLeft: '48px' }}>Configure role-based access control and member provisioning</p>
                    </div>
                    <button onClick={() => setShowRbacSettings(false)} className="text-neutral-500 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200" style={{ padding: '8px', cursor: 'pointer', border: 'none', background: 'transparent' }}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="15" y1="5" x2="5" y2="15" /><line x1="5" y1="5" x2="15" y2="15" /></svg>
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>

                    {/* Deployment Warning Overlay */}
                    {!isDeployed && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,13,13,0.6)', backdropFilter: 'blur(2px)', padding: '40px', textAlign: 'center' }}>
                            <div style={{ maxWidth: '360px', width: '100%', padding: '32px', background: '#151515', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                                <div style={{ width: '64px', height: '64px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', margin: '0 auto 24px auto' }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                                </div>
                                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px', marginTop: 0 }}>Deployment Required</h3>
                                <p style={{ fontSize: '14px', color: '#A1A1AA', marginBottom: '24px', lineHeight: 1.6, marginTop: 0 }}>
                                    Team collaboration features require an active proxy server. Please deploy this project to Vercel first.
                                </p>
                                <button
                                    onClick={() => setShowRbacSettings(false)}
                                    style={{ width: '100%', padding: '12px', background: '#FFFFFF', color: '#000000', fontSize: '14px', fontWeight: 700, borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'all 150ms ease' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#E5E5E5'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', width: '100%', opacity: !isDeployed ? 0.2 : 1, filter: !isDeployed ? 'grayscale(100%)' : 'none', pointerEvents: !isDeployed ? 'none' : 'auto' }}>

                        {/* LEFT: Provision Section */}
                        <div style={{ width: 'min(400px, 40%)', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1A1A1A' }}>
                            {/* Left Top */}
                            <div style={{ padding: '32px 32px 0 32px', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                                    <div className={`rounded-full ${editingMember ? 'bg-white' : 'bg-neutral-600'}`} style={{ width: '4px', height: '16px' }} />
                                    <h3 style={{ fontSize: 'calc(11px * var(--font-scale))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#D4D4D8', margin: 0 }}>
                                        {editingMember ? 'Edit Access' : 'New Member'}
                                    </h3>
                                </div>
                            </div>

                            {/* Left Scrollable Inputs */}
                            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 32px 24px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Email Field */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 500, color: '#A1A1AA', margin: 0 }}>Email Address</label>
                                    <input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                        placeholder="teammate@example.com"
                                        className="bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-white/40 focus:bg-white/[0.07] transition-all"
                                        style={{ width: '100%', boxSizing: 'border-box', height: '44px', padding: '0 16px', fontSize: 'calc(14px * var(--font-scale))' }}
                                    />
                                </div>

                                {/* Role Field */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 500, color: '#A1A1AA', margin: 0 }}>Access Role</label>
                                    <div style={{ position: 'relative' }}>
                                        <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as any })}
                                            className="bg-white/5 border border-white/10 rounded-xl text-white outline-none cursor-pointer hover:border-white/20 transition-all appearance-none"
                                            style={{ width: '100%', boxSizing: 'border-box', height: '44px', padding: '0 16px', fontSize: 'calc(14px * var(--font-scale))', backgroundColor: '#0D0D0D' }}
                                        >
                                            <option value="viewer">Viewer (Read Only)</option>
                                            <option value="editor">Editor (Modify APIs)</option>
                                            <option value="admin">Admin (Full Control)</option>
                                        </select>
                                        <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#71717A' }}>
                                            <svg width="12" height="8" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Folders Field */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 500, color: '#A1A1AA', margin: 0 }}>Allowed Folders</label>
                                    <div className="bg-white/5 border border-white/10 rounded-xl custom-scrollbar" style={{ overflow: 'hidden', overflowY: 'auto', maxHeight: '180px' }}>

                                        <label className="hover:bg-white/5 transition-colors cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <input type="checkbox" checked={newUser.folders.includes('*')}
                                                className="border-white/20 bg-transparent text-white focus:ring-0 focus:ring-offset-0 transition-all checked:bg-white cursor-pointer"
                                                style={{ width: '18px', height: '18px', borderRadius: '6px' }}
                                                onChange={e => {
                                                    if (e.target.checked) setNewUser({ ...newUser, folders: ['*'], folderRoles: {} })
                                                    else setNewUser({ ...newUser, folders: [] })
                                                }} />
                                            <span style={{ fontSize: '14px', fontWeight: 500, color: '#D4D4D8' }}>All Folders (*)</span>
                                        </label>

                                        {folders?.map(f => {
                                            const isSelected = newUser.folders.includes(f.id);
                                            return (
                                                <div key={f.id} className="group hover:bg-white/5 transition-all" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                                                        <input type="checkbox" checked={isSelected}
                                                            className="border-white/20 bg-transparent text-white focus:ring-0 focus:ring-offset-0 transition-all checked:bg-white cursor-pointer"
                                                            style={{ width: '18px', height: '18px', borderRadius: '6px', flexShrink: 0 }}
                                                            onChange={e => {
                                                                const next = e.target.checked
                                                                    ? [...newUser.folders.filter(x => x !== '*'), f.id]
                                                                    : newUser.folders.filter(x => x !== f.id)
                                                                const nextRoles = { ...newUser.folderRoles };
                                                                if (e.target.checked && !nextRoles[f.id]) nextRoles[f.id] = (newUser.role === 'admin' ? 'editor' : newUser.role) as any;
                                                                setNewUser({ ...newUser, folders: next, folderRoles: nextRoles })
                                                            }} />
                                                        <span className="group-hover:text-white transition-colors truncate" style={{ fontSize: '14px', color: '#A1A1AA' }}>{f.name}</span>
                                                    </label>

                                                    {isSelected && (
                                                        <select
                                                            value={newUser.folderRoles[f.id] || (newUser.role === 'admin' ? 'editor' : newUser.role)}
                                                            onChange={e => setNewUser({
                                                                ...newUser,
                                                                folderRoles: { ...newUser.folderRoles, [f.id]: e.target.value as any }
                                                            })}
                                                            className="bg-transparent hover:text-white transition-colors cursor-pointer"
                                                            style={{ fontSize: '12px', fontWeight: 600, color: '#71717A', outline: 'none', border: 'none', marginLeft: '12px' }}
                                                        >
                                                            <option value="viewer" style={{ background: '#151515' }}>Viewer</option>
                                                            <option value="editor" style={{ background: '#151515' }}>Editor</option>
                                                        </select>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Environments Field */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 500, color: '#A1A1AA', margin: 0 }}>Allowed Environments</label>
                                    <div className="bg-white/5 border border-white/10 rounded-xl custom-scrollbar" style={{ overflow: 'hidden', overflowY: 'auto', maxHeight: '180px' }}>
                                        {environments?.map(e => {
                                            const isSelected = newUser.environments.includes(e.id);
                                            const isGlobal = e.isGlobal || e.name.toLowerCase() === 'global';
                                            return (
                                                <div key={e.id} className="group hover:bg-white/5 transition-all" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: isGlobal ? 'default' : 'pointer', flex: 1, minWidth: 0 }}>
                                                        <input type="checkbox" checked={isSelected} disabled={isGlobal}
                                                            className={`border-white/20 bg-transparent text-white focus:ring-0 focus:ring-offset-0 transition-all checked:bg-white ${isGlobal ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
                                                            style={{ width: '18px', height: '18px', borderRadius: '6px', flexShrink: 0 }}
                                                            onChange={val => {
                                                                if (isGlobal) return;
                                                                const next = val.target.checked
                                                                    ? [...newUser.environments, e.id]
                                                                    : newUser.environments.filter(x => x !== e.id)
                                                                const nextRoles = { ...newUser.environmentRoles };
                                                                if (val.target.checked && !nextRoles[e.id]) nextRoles[e.id] = 'viewer';
                                                                setNewUser({ ...newUser, environments: next, environmentRoles: nextRoles })
                                                            }} />
                                                        <span className={`${isGlobal ? 'text-white' : 'group-hover:text-white'} transition-colors truncate`} style={{ fontSize: '14px', color: isGlobal ? '#FFFFFF' : '#A1A1AA' }}>
                                                            {e.name} {isGlobal && <span style={{ fontSize: '10px', color: '#71717A', marginLeft: '4px' }}>(Always Assigned)</span>}
                                                        </span>
                                                    </label>

                                                    {isSelected && (
                                                        <select
                                                            value={newUser.environmentRoles[e.id] || 'viewer'}
                                                            onChange={val => setNewUser({
                                                                ...newUser,
                                                                environmentRoles: { ...newUser.environmentRoles, [e.id]: val.target.value as any }
                                                            })}
                                                            className="bg-transparent hover:text-white transition-colors cursor-pointer"
                                                            style={{ fontSize: '12px', fontWeight: 600, color: '#71717A', outline: 'none', border: 'none', marginLeft: '12px' }}
                                                        >
                                                            <option value="viewer" style={{ background: '#151515' }}>Viewer</option>
                                                            <option value="editor" style={{ background: '#151515' }}>Editor</option>
                                                        </select>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Anchored Buttons */}
                            <div style={{ flexShrink: 0, padding: '0 32px 32px 32px', display: 'flex', gap: '16px' }}>
                                {editingMember && (
                                    <button onClick={() => { setEditingMember(null); setNewUser({ email: '', role: 'viewer', folders: [], folderRoles: {}, environments: [], environmentRoles: {} }) }}
                                        className="border border-white/10 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
                                        style={{ flex: 1, height: '48px', fontSize: '14px', fontWeight: 600, color: '#A1A1AA', borderRadius: '12px', background: 'transparent' }}>
                                        Cancel
                                    </button>
                                )}
                                <button
                                    onClick={editingMember ? handleSaveUpdate : handleAddUser}
                                    disabled={!isValidInvite}
                                    className={`transition-all transform active:scale-[0.98] ${!isValidInvite ? 'opacity-30 cursor-not-allowed' : 'hover:bg-neutral-200 cursor-pointer'}`}
                                    style={{ flex: 1.5, height: '48px', fontSize: '14px', fontWeight: 700, color: '#000000', background: '#FFFFFF', borderRadius: '12px', border: 'none' }}>
                                    {editingMember ? 'Update Access' : 'Send Invitation'}
                                </button>
                            </div>
                        </div>

                        {/* RIGHT: Active Members Section */}
                        <div className="bg-white/[0.02]" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div style={{ padding: '32px 32px 0 32px', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className="bg-neutral-600 rounded-full" style={{ width: '4px', height: '16px' }} />
                                        <h3 style={{ fontSize: 'calc(11px * var(--font-scale))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#D4D4D8', margin: 0 }}>
                                            Team Directory
                                        </h3>
                                    </div>
                                    <button
                                        onClick={fetchMembers}
                                        disabled={loading || !project?.databaseUrl}
                                        title="Refresh members"
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: loading ? '#52525B' : '#71717A', cursor: loading || !project?.databaseUrl ? 'not-allowed' : 'pointer', fontSize: '11px', fontWeight: 600, transition: 'all 150ms ease' }}
                                        onMouseEnter={e => { if (!loading && project?.databaseUrl) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#D4D4D8' } }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#71717A' }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                                            <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                        </svg>
                                        Refresh
                                    </button>
                                </div>
                            </div>

                            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px 32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {(loading || (projectLoading && !membersFetched)) ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 0', color: '#71717A' }}>
                                        <div className="animate-spin border-t-white" style={{ borderRadius: '50%', height: '20px', width: '20px', border: '2px solid rgba(255,255,255,0.2)', marginRight: '16px' }} />
                                        <span style={{ fontSize: '14px' }}>{projectLoading && !membersFetched ? 'Connecting...' : 'Fetching members...'}</span>
                                    </div>
                                ) : fetchError ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '60px 32px', gap: '20px' }}>
                                        <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', flexShrink: 0 }}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                            </svg>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '340px' }}>
                                            <h4 style={{ color: '#FFFFFF', fontWeight: 600, margin: 0, fontSize: '15px' }}>Database connection failed</h4>
                                            <p style={{ color: '#71717A', fontSize: '13px', margin: 0, lineHeight: 1.6 }}>
                                                Could not reach the remote database. This is usually caused by a <span style={{ color: '#fbbf24', fontWeight: 600 }}>VPN or firewall</span> blocking the connection.
                                            </p>
                                        </div>
                                        <div style={{ width: '100%', maxWidth: '360px', padding: '12px 16px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px', textAlign: 'left' }}>
                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Error</p>
                                            <p style={{ margin: 0, fontSize: '12px', color: '#f87171', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>{fetchError}</p>
                                        </div>
                                        <button
                                            onClick={fetchMembers}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#D4D4D8', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 150ms ease' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                            </svg>
                                            Retry Connection
                                        </button>
                                    </div>
                                ) : members.length === 0 ? (
                                    <div className="border-white/5 rounded-3xl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 40px', border: '2px dashed' }}>
                                        <div className="bg-white/5 rounded-2xl" style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525B', marginBottom: '16px' }}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                                        </div>
                                        <h4 style={{ color: '#FFFFFF', fontWeight: 500, margin: '0 0 4px 0', fontSize: '16px' }}>No members found</h4>
                                        <p style={{ color: '#71717A', fontSize: '13px', margin: 0 }}>Invite your teammates to start collaborating on this project.</p>
                                    </div>
                                ) : members.map(member => (
                                    <div key={member.id}
                                        className={`group rounded-2xl transition-all shadow-sm ${editingMember === member.id ? 'border-white/30 bg-white/[0.06]' : 'border-white/5 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.05]'}`}
                                        style={{ padding: '24px', borderStyle: 'solid', borderWidth: '1px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span style={{ fontSize: 'calc(14px * var(--font-scale))', fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</span>
                                                    <span className="bg-white/5 border-white/10" style={{ padding: '2px 10px', borderRadius: '9999px', borderStyle: 'solid', borderWidth: '1px', fontSize: 'calc(10px * var(--font-scale))', fontWeight: 700, color: '#A1A1AA', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                                        {member.role}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#52525B' }}>Folders Access</span>
                                                        {renderPermissionTags('folder', member.allowed_folders)}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#52525B' }}>Environments</span>
                                                        {renderPermissionTags('env', member.allowed_environments)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '24px' }}>
                                                <button
                                                    onClick={() => handleEditMember(member)}
                                                    className="hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                                                    style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', borderRadius: '12px', background: 'transparent', border: 'none' }}
                                                    title="Edit Permissions"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(member.id)}
                                                    className="hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer"
                                                    style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', borderRadius: '12px', background: 'transparent', border: 'none' }}
                                                    title="Revoke Access"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* System Footer Bar */}
                <div className="bg-[#0A0A0A] border-t border-[#1F1F1F]" style={{ padding: '20px 40px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#71717A' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ fontWeight: 600, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>Project Environment</span>
                            <span className="bg-white/5 border border-white/5" style={{ fontFamily: 'monospace', color: '#A1A1AA', padding: '4px 12px', borderRadius: '8px' }}>{currentProjectId}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="bg-neutral-600 animate-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%' }} />
                            <span>System active. Role inheritance enabled.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Success Dialog */}
            {successData && (
                <div
                    className="animate-in fade-in duration-200"
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', padding: '16px'
                    }}
                >
                    <div
                        className="scale-in"
                        style={{
                            width: '100%', maxWidth: '500px', background: '#0F0F0F',
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden'
                        }}
                    >
                        {/* Header */}
                        <div style={{ padding: '32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '16px', flexShrink: 0,
                                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e'
                            }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>Member Provisioned</h3>
                                <p style={{ fontSize: '14px', color: '#A3A3A3', margin: '4px 0 0 0' }}>Share these credentials with the user</p>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717A' }}>Complete Invitation Package</span>
                                    <button
                                        onClick={() => {
                                            const text = `Proxy URL: ${project?.proxyUrl}\nProject ID: ${currentProjectId}\nAccess Token: ${successData.token}`;
                                            navigator.clipboard.writeText(text);
                                            alert('Copied all credentials to clipboard!');
                                        }}
                                        style={{
                                            padding: '6px 12px', background: '#22c55e', color: 'white', fontSize: '11px', fontWeight: 700,
                                            borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                        Copy All
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                                        <span style={{ color: '#52525B', fontWeight: 600 }}>Proxy URL:</span>
                                        <span style={{ color: '#A1A1AA', wordBreak: 'break-all' }}>{project?.proxyUrl}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                                        <span style={{ color: '#52525B', fontWeight: 600 }}>Project ID:</span>
                                        <span style={{ color: '#A1A1AA' }}>{currentProjectId}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                                        <span style={{ color: '#52525B', fontWeight: 600 }}>Token:</span>
                                        <span style={{ color: '#FDE68A', fontFamily: 'monospace' }}>{successData.token}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                                <SuccessField label="User ID" value={successData.id} />
                                <SuccessField label="Email" value={successData.email} />
                                <SuccessField label="Environment Access" value={successData.environments} />
                            </div>

                            <div style={{ padding: '16px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.1)', borderRadius: '12px' }}>
                                <p style={{ fontSize: '12px', color: 'rgba(245,158,11,0.8)', lineHeight: 1.6, margin: 0 }}>
                                    <span style={{ fontWeight: 700 }}>Note:</span> This information is only shown once. Ensure the user saves it securely.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSuccessData(null)}
                                style={{
                                    padding: '12px 32px', background: '#FFFFFF', color: '#000000',
                                    fontSize: '14px', fontWeight: 700, borderRadius: '12px', border: 'none',
                                    cursor: 'pointer', transition: 'all 150ms ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#E5E5E5'}
                                onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function SuccessField({ label, value, isSecret, isBadge }: { label: string, value: string, isSecret?: boolean, isBadge?: boolean }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717A', margin: 0 }}>
                {label}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    flex: 1, padding: '0 16px', height: '44px', display: 'flex', alignItems: 'center',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', overflow: 'hidden', minWidth: 0
                }}>
                    {isBadge ? (
                        <span style={{
                            padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '9999px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#A1A1AA'
                        }}>
                            {value}
                        </span>
                    ) : (
                        <span style={{
                            fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            fontFamily: isSecret ? 'monospace' : 'inherit',
                            color: isSecret ? 'rgba(253,230,138,0.9)' : '#D4D4D8'
                        }}>
                            {value}
                        </span>
                    )}
                </div>
                <CopyButton text={value} />
            </div>
        </div>
    )
}

function Tag({ label, role, icon }: { label: string, role: string, icon: 'folder' | 'Zap' | 'star' }) {
    return (
        <div
            className="group/tag bg-white/[0.03] border border-white/10 rounded-lg hover:border-white/20 transition-all"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px',
                height: '28px'
            }}
        >
            <div style={{ color: '#71717A', display: 'flex', alignItems: 'center' }}>
                {icon === 'folder' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>}
                {icon === 'Zap' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>}
                {icon === 'star' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
            </div>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#D4D4D8', whiteSpace: 'nowrap' }}>{label}</span>
            <span
                style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    color: role === 'editor' ? '#A78BFA' : role === 'admin' ? '#FDE68A' : '#71717A',
                    padding: '1px 4px',
                    borderRadius: '4px',
                    background: role === 'editor' ? 'rgba(167,139,250,0.1)' : role === 'admin' ? 'rgba(253,230,138,0.1)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid currentColor',
                    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.2)'
                }}
            >
                {role}
            </span>
        </div>
    )
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    const [isHovered, setIsHovered] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <button
            onClick={handleCopy}
            title="Copy to clipboard"
            style={{
                width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                color: isHovered ? '#FFFFFF' : '#A1A1AA',
                cursor: 'pointer', transition: 'all 150ms ease'
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {copied ? (
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e' }}>Copied!</span>
            ) : (
                <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isHovered ? 'scale(1.1)' : 'scale(1)', transition: 'transform 150ms ease' }}
                >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
            )}
        </button>
    )
}