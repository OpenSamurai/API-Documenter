import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// ─── Filename Utilities ─────────────────────────────────────────

/**
 * Convert an entity name to a safe, filesystem-friendly filename.
 * e.g. "Get All Users!" → "get-all-users"
 */
export function sanitizeFilename(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        || 'untitled'
}

/**
 * Ensure a filename is unique within a directory by appending a short suffix.
 */
function ensureUniqueFilename(dirPath: string, baseName: string, ext: string): string {
    let candidate = `${baseName}${ext}`
    let counter = 1
    while (fs.existsSync(path.join(dirPath, candidate))) {
        candidate = `${baseName}-${counter}${ext}`
        counter++
    }
    return candidate
}

// ─── Directory Scaffolding ──────────────────────────────────────

/**
 * Initialize a project directory with the full scaffold:
 *   project.apidoc, project.secrets.json, .gitignore, environments/, folders/
 */
export function initProjectDirectory(
    dirPath: string,
    project: { id: string; name: string; databaseUrl?: string; proxyUrl?: string; lastDeployedAt?: number; createdAt: number }
): { success: boolean; error?: string } {
    try {
        // Create root dir if needed
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }

        // project.apidoc — public metadata (git-tracked)
        const projectMeta = {
            version: 1,
            id: project.id,
            name: project.name,
            createdAt: project.createdAt
        }
        fs.writeFileSync(
            path.join(dirPath, 'project.apidoc'),
            JSON.stringify(projectMeta, null, 2),
            'utf-8'
        )

        // project.secrets.json — credentials (git-ignored)
        const secrets = {
            databaseUrl: project.databaseUrl || '',
            proxyUrl: project.proxyUrl || '',
            lastDeployedAt: project.lastDeployedAt || null,
            teamConnections: []
        }
        fs.writeFileSync(
            path.join(dirPath, 'project.secrets.json'),
            JSON.stringify(secrets, null, 2),
            'utf-8'
        )

        // .gitignore
        const gitignoreContent = [
            'project.secrets.json',
            ''
        ].join('\n')
        fs.writeFileSync(path.join(dirPath, '.gitignore'), gitignoreContent, 'utf-8')

        // Create subdirectories
        const envsDir = path.join(dirPath, 'environments')
        const foldersDir = path.join(dirPath, 'folders')
        if (!fs.existsSync(envsDir)) fs.mkdirSync(envsDir, { recursive: true })
        if (!fs.existsSync(foldersDir)) fs.mkdirSync(foldersDir, { recursive: true })

        // Initialize Git repo
        try {
            if (!fs.existsSync(path.join(dirPath, '.git'))) {
                execSync('git init', { cwd: dirPath, stdio: 'ignore' })
                execSync('git add project.apidoc .gitignore', { cwd: dirPath, stdio: 'ignore' })
                execSync('git commit -m "Initial commit from API Documenter"', { cwd: dirPath, stdio: 'ignore' })
            }
        } catch (gitErr) {
            console.warn('[FileSystemManager] Failed to init git:', gitErr)
            // We do not fail the project creation if git is simply not installed
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ─── Project Read/Write ─────────────────────────────────────────

/**
 * Update project.apidoc metadata file.
 */
export function writeProjectMeta(
    dirPath: string,
    project: { id: string; name: string; createdAt: number }
): { success: boolean; error?: string } {
    try {
        const projectMeta = {
            version: 1,
            id: project.id,
            name: project.name,
            createdAt: project.createdAt
        }
        fs.writeFileSync(
            path.join(dirPath, 'project.apidoc'),
            JSON.stringify(projectMeta, null, 2),
            'utf-8'
        )
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Update project.secrets.json.
 */
export function writeProjectSecrets(
    dirPath: string,
    secrets: { databaseUrl?: string; proxyUrl?: string; lastDeployedAt?: number | null; teamConnections?: any[] }
): { success: boolean; error?: string } {
    try {
        // Read existing secrets to preserve fields we don't want to overwrite
        let existing: any = {}
        const secretsPath = path.join(dirPath, 'project.secrets.json')
        if (fs.existsSync(secretsPath)) {
            try {
                existing = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
            } catch { /* ignore parse errors */ }
        }

        const merged = {
            ...existing,
            ...secrets
        }
        fs.writeFileSync(secretsPath, JSON.stringify(merged, null, 2), 'utf-8')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ─── Folder Operations ──────────────────────────────────────────

/**
 * Create a folder directory and write folder.json metadata.
 * Returns the sanitized folder directory name used on disk.
 */
export function writeFolderMeta(
    dirPath: string,
    folder: { id: string; name: string; description: string; orderIndex: number; createdAt: number }
): { success: boolean; folderDirName?: string; error?: string } {
    try {
        const foldersRoot = path.join(dirPath, 'folders')
        if (!fs.existsSync(foldersRoot)) fs.mkdirSync(foldersRoot, { recursive: true })

        // Determine folder directory name
        const folderDirName = findFolderDirById(dirPath, folder.id) || sanitizeFilename(folder.name)
        const folderDir = path.join(foldersRoot, folderDirName)

        if (!fs.existsSync(folderDir)) {
            fs.mkdirSync(folderDir, { recursive: true })
        }

        const meta = {
            id: folder.id,
            name: folder.name,
            description: folder.description,
            orderIndex: folder.orderIndex,
            createdAt: folder.createdAt
        }
        fs.writeFileSync(
            path.join(folderDir, 'folder.json'),
            JSON.stringify(meta, null, 2),
            'utf-8'
        )

        return { success: true, folderDirName }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Rename a folder directory (when folder name changes).
 */
export function renameFolderDir(
    dirPath: string,
    folderId: string,
    newName: string
): { success: boolean; newDirName?: string; error?: string } {
    try {
        const foldersRoot = path.join(dirPath, 'folders')
        const currentDirName = findFolderDirById(dirPath, folderId)
        if (!currentDirName) {
            return { success: false, error: 'Folder directory not found' }
        }

        const newDirName = sanitizeFilename(newName)
        if (currentDirName === newDirName) {
            return { success: true, newDirName: currentDirName }
        }

        const oldPath = path.join(foldersRoot, currentDirName)
        const newPath = path.join(foldersRoot, newDirName)

        if (fs.existsSync(newPath)) {
            // Name collision — keep current dir name
            return { success: true, newDirName: currentDirName }
        }

        fs.renameSync(oldPath, newPath)
        return { success: true, newDirName }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Delete a folder directory and all its contents.
 */
export function deleteFolderDir(
    dirPath: string,
    folderId: string
): { success: boolean; error?: string } {
    try {
        const foldersRoot = path.join(dirPath, 'folders')
        const folderDirName = findFolderDirById(dirPath, folderId)
        if (!folderDirName) return { success: true } // Already gone

        const folderDir = path.join(foldersRoot, folderDirName)
        if (fs.existsSync(folderDir)) {
            fs.rmSync(folderDir, { recursive: true, force: true })
        }
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Find which directory name belongs to a folder ID by reading folder.json files.
 */
export function findFolderDirById(dirPath: string, folderId: string): string | null {
    const foldersRoot = path.join(dirPath, 'folders')
    if (!fs.existsSync(foldersRoot)) return null

    const entries = fs.readdirSync(foldersRoot, { withFileTypes: true })
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const metaPath = path.join(foldersRoot, entry.name, 'folder.json')
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                if (meta.id === folderId) return entry.name
            } catch { /* skip corrupt files */ }
        }
    }
    return null
}

// ─── API File Operations ────────────────────────────────────────

/**
 * Write an API request to an .apidoc file inside the correct folder directory.
 */
export function writeApiFile(
    dirPath: string,
    folderId: string,
    api: {
        id: string; name: string; description: string; method: string; path: string;
        urlParams: any[]; headers: any[]; bodyType: string; rawType?: string;
        formData?: any[]; urlencoded?: any[]; requestBody: string;
        responseExamples: any[]; version: number; createdAt: number;
    }
): { success: boolean; fileName?: string; error?: string } {
    try {
        const folderDirName = findFolderDirById(dirPath, folderId)
        if (!folderDirName) {
            return { success: false, error: `Folder directory not found for ID: ${folderId}` }
        }

        const folderDir = path.join(dirPath, 'folders', folderDirName)

        // Find existing file for this API ID, or create new filename
        const existingFile = findApiFileById(dirPath, folderId, api.id)
        let fileName: string

        if (existingFile) {
            fileName = existingFile
        } else {
            const baseName = sanitizeFilename(api.name)
            fileName = ensureUniqueFilename(folderDir, baseName, '.apidoc')
        }

        const apiData = {
            id: api.id,
            name: api.name,
            description: api.description,
            method: api.method,
            path: api.path,
            urlParams: api.urlParams || [],
            headers: api.headers || [],
            bodyType: api.bodyType || 'none',
            rawType: api.rawType || 'json',
            formData: api.formData || [],
            urlencoded: api.urlencoded || [],
            requestBody: api.requestBody || '',
            responseExamples: api.responseExamples || [],
            version: api.version || 1,
            createdAt: api.createdAt
        }

        fs.writeFileSync(
            path.join(folderDir, fileName),
            JSON.stringify(apiData, null, 2),
            'utf-8'
        )

        return { success: true, fileName }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Delete an API file from a folder directory.
 */
export function deleteApiFile(
    dirPath: string,
    folderId: string,
    apiId: string
): { success: boolean; error?: string } {
    try {
        const fileName = findApiFileById(dirPath, folderId, apiId)
        if (!fileName) return { success: true } // Already gone

        const folderDirName = findFolderDirById(dirPath, folderId)
        if (!folderDirName) return { success: true }

        const filePath = path.join(dirPath, 'folders', folderDirName, fileName)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Find which .apidoc filename belongs to an API ID by reading files in a folder.
 */
export function findApiFileById(dirPath: string, folderId: string, apiId: string): string | null {
    const folderDirName = findFolderDirById(dirPath, folderId)
    if (!folderDirName) return null

    const folderDir = path.join(dirPath, 'folders', folderDirName)
    if (!fs.existsSync(folderDir)) return null

    const entries = fs.readdirSync(folderDir)
    for (const entry of entries) {
        if (!entry.endsWith('.apidoc')) continue
        const filePath = path.join(folderDir, entry)
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            if (data.id === apiId) return entry
        } catch { /* skip corrupt files */ }
    }
    return null
}

// ─── Environment Operations ─────────────────────────────────────

/**
 * Write an environment file to the environments/ directory.
 */
export function writeEnvironmentFile(
    dirPath: string,
    env: {
        id: string; name: string; baseUrl: string; isGlobal: boolean;
        folderId?: string | null; variables: string | Record<string, string>;
        createdAt: number;
    }
): { success: boolean; fileName?: string; error?: string } {
    try {
        const envsDir = path.join(dirPath, 'environments')
        if (!fs.existsSync(envsDir)) fs.mkdirSync(envsDir, { recursive: true })

        // Find existing file for this env ID, or create new filename
        const existingFile = findEnvironmentFileById(dirPath, env.id)
        let fileName: string

        if (existingFile) {
            fileName = existingFile
        } else {
            const baseName = env.isGlobal ? 'global' : sanitizeFilename(env.name)
            fileName = ensureUniqueFilename(envsDir, baseName, '.env.json')
        }

        // Parse variables if they're a JSON string
        let variables = env.variables
        if (typeof variables === 'string') {
            try {
                variables = JSON.parse(variables)
            } catch {
                variables = {}
            }
        }

        const envData = {
            id: env.id,
            name: env.name,
            baseUrl: env.baseUrl,
            isGlobal: env.isGlobal,
            folderId: env.folderId || null,
            variables,
            createdAt: env.createdAt
        }

        fs.writeFileSync(
            path.join(envsDir, fileName),
            JSON.stringify(envData, null, 2),
            'utf-8'
        )

        return { success: true, fileName }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Delete an environment file.
 */
export function deleteEnvironmentFile(
    dirPath: string,
    envId: string
): { success: boolean; error?: string } {
    try {
        const fileName = findEnvironmentFileById(dirPath, envId)
        if (!fileName) return { success: true }

        const filePath = path.join(dirPath, 'environments', fileName)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Find which env filename belongs to an environment ID.
 */
export function findEnvironmentFileById(dirPath: string, envId: string): string | null {
    const envsDir = path.join(dirPath, 'environments')
    if (!fs.existsSync(envsDir)) return null

    const entries = fs.readdirSync(envsDir)
    for (const entry of entries) {
        if (!entry.endsWith('.env.json')) continue
        const filePath = path.join(envsDir, entry)
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            if (data.id === envId) return entry
        } catch { /* skip corrupt files */ }
    }
    return null
}

// ─── Full Project Read (Cold Start) ─────────────────────────────

/**
 * Read an entire project from disk: project metadata, folders, APIs, environments.
 * Used for cold-start loading and file-watcher reconciliation.
 */
export function readProjectFromDisk(dirPath: string): {
    success: boolean;
    project?: any;
    secrets?: any;
    folders?: any[];
    apis?: any[];
    environments?: any[];
    error?: string;
} {
    try {
        // Read project.apidoc
        const projectPath = path.join(dirPath, 'project.apidoc')
        if (!fs.existsSync(projectPath)) {
            return { success: false, error: 'No project.apidoc found in directory' }
        }
        const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8'))

        // Read project.secrets.json (optional)
        let secrets: any = {}
        const secretsPath = path.join(dirPath, 'project.secrets.json')
        if (fs.existsSync(secretsPath)) {
            try {
                secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
            } catch { /* ignore */ }
        }

        // Read folders
        const folders: any[] = []
        const apis: any[] = []
        const foldersRoot = path.join(dirPath, 'folders')

        if (fs.existsSync(foldersRoot)) {
            const folderDirs = fs.readdirSync(foldersRoot, { withFileTypes: true })
                .filter(d => d.isDirectory())

            for (const folderDir of folderDirs) {
                const folderPath = path.join(foldersRoot, folderDir.name)

                // Read folder.json
                const metaPath = path.join(folderPath, 'folder.json')
                if (fs.existsSync(metaPath)) {
                    try {
                        const folderMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                        folderMeta.projectId = project.id
                        folders.push(folderMeta)

                        // Read all .apidoc files in this folder
                        const apiFiles = fs.readdirSync(folderPath)
                            .filter(f => f.endsWith('.apidoc'))

                        for (const apiFile of apiFiles) {
                            try {
                                const apiData = JSON.parse(
                                    fs.readFileSync(path.join(folderPath, apiFile), 'utf-8')
                                )
                                apiData.projectId = project.id
                                apiData.folderId = folderMeta.id
                                apis.push(apiData)
                            } catch {
                                console.warn(`[FileSystemManager] Skipping corrupt API file: ${apiFile}`)
                            }
                        }
                    } catch {
                        console.warn(`[FileSystemManager] Skipping corrupt folder: ${folderDir.name}`)
                    }
                }
            }
        }

        // Read environments
        const environments: any[] = []
        const envsDir = path.join(dirPath, 'environments')
        if (fs.existsSync(envsDir)) {
            const envFiles = fs.readdirSync(envsDir)
                .filter(f => f.endsWith('.env.json'))

            for (const envFile of envFiles) {
                try {
                    const envData = JSON.parse(
                        fs.readFileSync(path.join(envsDir, envFile), 'utf-8')
                    )
                    envData.projectId = project.id
                    // Re-stringify variables if they're an object (IndexedDB expects string)
                    if (typeof envData.variables === 'object' && envData.variables !== null) {
                        envData.variables = JSON.stringify(envData.variables)
                    }
                    environments.push(envData)
                } catch {
                    console.warn(`[FileSystemManager] Skipping corrupt env file: ${envFile}`)
                }
            }
        }

        return { success: true, project, secrets, folders, apis, environments }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Write an entire project to disk (for initial export / full flush).
 */
export function writeFullProjectToDisk(
    dirPath: string,
    data: {
        project: any;
        folders: any[];
        apis: any[];
        environments: any[];
    }
): { success: boolean; error?: string } {
    try {
        // Init the directory scaffold
        const initResult = initProjectDirectory(dirPath, data.project)
        if (!initResult.success) return initResult

        // Write folders and their APIs
        for (const folder of data.folders) {
            writeFolderMeta(dirPath, folder)

            const folderApis = data.apis.filter(a => a.folderId === folder.id)
            for (const api of folderApis) {
                writeApiFile(dirPath, folder.id, api)
            }
        }

        // Write environments
        for (const env of data.environments) {
            writeEnvironmentFile(dirPath, env)
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
