// ─── HTTP Method Types ───────────────────────────────────────────
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export type BodyType = 'none' | 'form-data' | 'urlencoded' | 'raw'
export type RawType = 'json' | 'text' | 'html' | 'xml'

export type SyncStatus = 'synced' | 'pending' | 'uncommitted' | 'conflict' | 'offline'

export type UserRole = 'viewer' | 'editor' | 'admin'

// ─── Key-Value Pairs (Headers, Params) ──────────────────────────
export interface KeyValuePair {
    id: string
    key: string
    value: string
    enabled: boolean
    type?: 'text' | 'file'
}

// ─── Response Example Metadata ──────────────────────────────────
export interface ResponseExampleMetadata {
    contentType: string
    isDefault: boolean
    deprecated: boolean
    version?: string
    tags?: string[]
    responseTime?: number
    responseSize?: number
    notes?: string
}

// ─── Response Examples ──────────────────────────────────────────
export interface ResponseExample {
    id: string
    statusCode: number
    title: string
    description: string
    body: string
    headers?: KeyValuePair[]
    metadata: ResponseExampleMetadata
    createdAt: string
    updatedAt: string
}

// ─── Core Data Models ───────────────────────────────────────────
export interface Project {
    id: string
    name: string
    localPath: string
    databaseUrl?: string
    proxyUrl?: string
    lastDeployedAt?: string
    syncedBranches?: string[] // Track which branches have been pushed to remote
    version?: number
    isDeleted?: boolean
    deletedAt?: string | null
    createdAt: string
    updatedAt: string
}

export interface Folder {
    id: string
    projectId: string
    name: string
    description: string
    orderIndex: number
    role?: UserRole
    lastSync: string | null
    syncStatus: SyncStatus
    version?: number
    isDeleted?: boolean
    deletedAt?: string | null
    createdAt: string
    updatedAt: string
}

// ─── Environment ───────────────────────────────────────────────
export interface Environment {
    id: string
    projectId: string
    folderId?: string | null
    name: string
    baseUrl: string
    isGlobal: boolean
    variables: string // JSON Record<string, string>
    role?: UserRole
    lastSync: string | null
    syncStatus: SyncStatus
    version?: number
    isDeleted?: boolean
    deletedAt?: string | null
    createdAt: string
    updatedAt: string
}

export interface ApiCollection {
    id: string
    projectId: string
    folderId: string
    name: string
    description: string
    method: HttpMethod
    path: string
    urlParams: KeyValuePair[]
    headers: KeyValuePair[]
    bodyType: BodyType
    rawType?: RawType
    formData?: KeyValuePair[]
    urlencoded?: KeyValuePair[]
    requestBody: string
    responseExamples: ResponseExample[]
    version: number
    lastSync: string | null
    syncStatus: SyncStatus
    isDeleted?: boolean
    deletedAt?: string | null
    createdAt: string
    updatedAt: string
}

// ─── Sync Queue ─────────────────────────────────────────────────
export type SyncTableName = 'projects' | 'folders' | 'apiCollections' | 'environments'
export type SyncOperation = 'create' | 'update' | 'delete'

export interface SyncQueueItem {
    id: string
    localId: string
    projectId: string
    branch?: string // The branch context when this change was made
    tableName: SyncTableName
    operation: SyncOperation
    data: string // Latest entity snapshot at queue time
    version?: number // Entity version at queue time
    status: 'uncommitted' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed'
    retries: number
    createdAt: string
}

// ─── Conflict Types ─────────────────────────────────────────────
export type ConflictType = 'update-update' | 'delete-update' | 'update-delete'

export interface ConflictDetail {
    localId: string
    tableName: SyncTableName
    conflictType: ConflictType
    baseVersion: number
    localVersion: number
    remoteVersion: number
    localData: any | null   // Full JSON of local entity (null if locally deleted)
    remoteData: any | null  // Full JSON of remote entity (null if remotely deleted)
    entityName: string      // Human-readable name (API name, folder name, etc.)
    remoteQueueId?: string  // ID of the remote sync_queue row for marking processed
}

export interface FolderPermission {
    folderId: string
    role: UserRole
}

// ─── RBAC User ──────────────────────────────────────────────────
export interface RbacUser {
    id: string
    email: string
    token: string
    allowedFolders: string[] | FolderPermission[]
    allowedEnvironments: string[]
    projectId: string
    role: UserRole
    createdAt: string
    updatedAt: string
}

// ─── Proxy Connection ───────────────────────────────────────────
export interface ProxyConnection {
    proxyUrl: string
    token: string
    connected: boolean
    userRole?: UserRole
    allowedFolders?: string[] | FolderPermission[]
    allowedEnvironments?: string[]
}

export interface GitStatusResult {
    not_added: string[]
    conflicted: string[]
    created: string[]
    deleted: string[]
    modified: string[]
    renamed: any[]
    files: any[]
    staged: string[]
    ahead: number
    behind: number
    current: string
    tracking: string | null
}

export interface SavedTeamConnection {
    id: string
    name: string
    url: string
    token: string
    projectId: string
    lastUsedAt: string
}

// ─── UI State Types ─────────────────────────────────────────────
export type EditorTab = 'params' | 'headers' | 'body' | 'responses'

// ─── Method Colors (using raw CSS values for style prop) ────────
export interface MethodColorStyle {
    bg: string
    text: string
    border: string
}

export const METHOD_COLORS: Record<HttpMethod, MethodColorStyle> = {
    GET: { bg: 'rgba(74, 222, 128, 0.1)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.2)' },
    POST: { bg: 'rgba(250, 204, 21, 0.1)', text: '#facc15', border: 'rgba(250, 204, 21, 0.2)' },
    PUT: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.2)' },
    DELETE: { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171', border: 'rgba(248, 113, 113, 0.2)' },
    PATCH: { bg: 'rgba(167, 139, 250, 0.1)', text: '#a78bfa', border: 'rgba(167, 139, 250, 0.2)' },
    HEAD: { bg: 'rgba(148, 163, 184, 0.1)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.2)' },
    OPTIONS: { bg: 'rgba(148, 163, 184, 0.1)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.2)' }
}

export const SYNC_ICONS: Record<SyncStatus | 'syncing', { icon: string; label: string }> = {
    synced: { icon: '✓', label: 'Synced' },
    pending: { icon: '↻', label: 'Pending sync' },
    syncing: { icon: '⟳', label: 'Syncing...' },
    uncommitted: { icon: '●', label: 'Uncommitted' },
    conflict: { icon: '⚠', label: 'Conflict' },
    offline: { icon: '◉', label: 'Local only' }
}
