import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import path, { join } from 'path'
import { is } from '@electron-toolkit/utils'
import fs from 'fs'
import os from 'os'
import mysql from 'mysql2/promise'
import pg from 'pg'
import { spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'
import MarkdownIt from 'markdown-it'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        frame: false,
        backgroundColor: '#0f0f17',
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[Main Window] Failed to load URL: ${validatedURL}`)
        console.error(`Error Code: ${errorCode} (${errorDescription})`)
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// Window controls IPC
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
    } else {
        mainWindow?.maximize()
    }
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized())

// File system IPC handlers
ipcMain.handle('save-file', async (_event, filePath: string, data: string) => {
    try {
        const dir = join(filePath, '..')
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(filePath, data, 'utf-8')
        return { success: true }
    } catch (error) {
        return { success: false, error: String(error) }
    }
})

ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
        const data = fs.readFileSync(filePath, 'utf-8')
        return { success: true, data }
    } catch (error) {
        return { success: false, error: String(error) }
    }
})

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? null : result.filePaths
})

ipcMain.handle('get-app-path', () => app.getPath('userData'))
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle("export-pdf", async (_, html, fileName) => {
    const win = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200
    })
    const tempHtmlPath = path.join(os.tmpdir(), `api-doc-export-${Date.now()}.html`)
    fs.writeFileSync(tempHtmlPath, html)

    try {
        await win.loadFile(tempHtmlPath)
    } catch (e) {
        console.error("Failed to load temp HTML file for PDF generation", e)
    }

    const pdf = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: {
            marginType: 'none'
        }
    })

    try {
        if (fs.existsSync(tempHtmlPath)) {
            fs.unlinkSync(tempHtmlPath)
        }
    } catch (e) {
        console.error("Failed to cleanup temp HTML file", e)
    }

    const { filePath } = await dialog.showSaveDialog({
        defaultPath: fileName
    })

    if (filePath) {
        fs.writeFileSync(filePath, pdf)
    }

    win.close()
})

// Helper for PDF generation — uses Electron's built-in Chromium (no external Chrome needed)
async function generatePdfBuffer(markdownContent: string): Promise<Buffer> {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true
    })

    const htmlContent = md.render(markdownContent)
    const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {
                size: A4;
                margin: 25mm;
            }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #111827;
                background-color: #ffffff;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }
            .container {
                width: 100%;
                max-width: 800px;
                margin: 0 auto;
            }
            
            /* --- Typography --- */
            h1 {
                font-size: 3.5rem;
                font-weight: 900;
                color: #111827;
                margin-top: 0;
                margin-bottom: 32px;
                letter-spacing: -0.04em;
                line-height: 1.1;
                text-align: center;
            }
            h2 {
                font-size: 2.2rem;
                font-weight: 800;
                color: #111827;
                margin-top: 64px;
                margin-bottom: 24px;
                letter-spacing: -0.02em;
                border-bottom: 2px solid #F3F4F6;
                padding-bottom: 12px;
            }
            h3 {
                font-size: 1.6rem;
                font-weight: 700;
                color: #1F2937;
                margin-top: 40px;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            h4 {
                font-size: 1.1rem;
                font-weight: 700;
                color: #6B7280;
                margin-top: 28px;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            p {
                margin: 16px 0;
                color: #374151;
                font-size: 1.05rem;
            }

            /* --- API Method Badges --- */
            .method {
                display: inline-block;
                padding: 4px 10px;
                border-radius: 6px;
                font-family: monospace;
                font-weight: 800;
                font-size: 0.85em;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-right: 8px;
            }
            .method-GET { background: #ECFDF5; color: #065F46; border: 1px solid #D1FAE5; }
            .method-POST { background: #EFF6FF; color: #1E40AF; border: 1px solid #DBEAFE; }
            .method-PUT { background: #FFFBEB; color: #92400E; border: 1px solid #FEF3C7; }
            .method-DELETE { background: #FEF2F2; color: #991B1B; border: 1px solid #FEE2E2; }
            .method-PATCH { background: #F5F3FF; color: #5B21B6; border: 1px solid #EDE9FE; }

            .status-code {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: 700;
                font-size: 0.9em;
                margin-left: 8px;
            }
            .status-2xx { background: #DCFCE7; color: #166534; }
            .status-3xx { background: #E0F2FE; color: #075985; }
            .status-4xx { background: #FFEDD5; color: #9A3412; }
            .status-5xx { background: #FEE2E2; color: #991B1B; }

            /* --- Table of Contents (Premium Modern) --- */
            .toc-container { margin: 80px 0; }
            .toc-title-bar { border-bottom: 3px solid #3B82F6; margin-bottom: 48px; padding-bottom: 24px; }
            .toc-title-bar h2 { margin: 0 !important; font-size: 3rem !important; border-bottom: none !important; color: #111827 !important; }
            .toc-list { display: flex; flex-direction: column; gap: 32px; }
            .toc-folder-group { position: relative; }
            .toc-folder-item { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
            .toc-folder-number { background: #F3F4F6; color: #3B82F6; font-weight: 800; padding: 2px 8px; border-radius: 6px; font-size: 0.9em; min-width: 32px; text-align: center; font-family: monospace; }
            .toc-folder-link { color: #111827; text-decoration: none; font-size: 1.4rem; font-weight: 800; }
            .toc-endpoints-container { border-left: 2px solid #F3F4F6; margin-left: 15px; padding-left: 32px; display: flex; flex-direction: column; gap: 12px; }
            .toc-endpoint-item { display: flex; align-items: center; gap: 12px; position: relative; }
            .toc-endpoint-item::before { content: ""; position: absolute; left: -33px; top: 50%; width: 12px; height: 2px; background: #F3F4F6; }
            .toc-endpoint-bullet { display: none; }
            .toc-endpoint-link { color: #4B5563; text-decoration: none; font-size: 1.1rem; font-weight: 500; }

            /* --- Code & Pre --- */
            pre { background-color: #f8fafc; color: #1e293b; padding: 24px; border-radius: 12px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.9rem; line-height: 1.7; overflow-x: auto; margin: 24px 0; border: 1px solid #e2e8f0; }
            code { font-family: inherit; background-color: #f1f5f9; color: #475569; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
            pre code { background-color: transparent; color: inherit; padding: 0; }

            /* --- Tables --- */
            table { width: 100%; border-collapse: collapse; margin: 32px 0; }
            table th, table td { padding: 14px 16px; border: 1px solid #E5E7EB; text-align: left; vertical-align: top; }
            table th { background-color: #F9FAFB; font-weight: 700; color: #374151; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }

            /* --- Helpers --- */
            .page-break { page-break-after: always; }
            blockquote { border-left: 4px solid #3B82F6; padding: 8px 16px; margin: 24px 0; background: #F9FAFB; color: #4B5563; font-style: italic; border-radius: 0 8px 8px 0; }
            img { max-width: 100%; border-radius: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            ${htmlContent}
        </div>
    </body>
    </html>
    `

    // Write HTML to a temp file so BrowserWindow can load it as a local file
    const tempHtmlPath = path.join(os.tmpdir(), `api-doc-pdf-${Date.now()}.html`)
    fs.writeFileSync(tempHtmlPath, fullHtml, 'utf-8')

    const win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 1600,
        webPreferences: { javascript: false }
    })

    try {
        await win.loadFile(tempHtmlPath)
        // Wait for fonts/images to settle
        await new Promise(resolve => setTimeout(resolve, 500))

        const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            preferCSSPageSize: true,
            margins: { marginType: 'none' }
        })

        return Buffer.from(pdfBuffer)
    } finally {
        win.close()
        try { fs.unlinkSync(tempHtmlPath) } catch (_) { /* ignore cleanup errors */ }
    }
}

ipcMain.handle('preview-doc-pdf', async (_event, markdownContent: string) => {
    try {
        const buffer = await generatePdfBuffer(markdownContent)
        return { success: true, data: buffer }
    } catch (error: any) {
        console.error('Error during PDF preview generation:', error)
        return { success: false, error: error.message }
    }
})

ipcMain.handle('generate-doc-pdf', async (_event, markdownContent: string, fileName: string) => {
    try {
        const { filePath } = await dialog.showSaveDialog({
            defaultPath: fileName,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        })

        if (!filePath) return { success: false, error: 'Cancelled' }

        const buffer = await generatePdfBuffer(markdownContent)
        fs.writeFileSync(filePath, buffer)

        return { success: true }
    } catch (error: any) {

        console.error('Error during PDF conversion:', error)
        return { success: false, error: error.message }
    }
})

// ─── HTTP Request Handler (Postman-like API testing) ─────────────
ipcMain.handle('send-http-request', async (_event, opts: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    formFields?: { key: string, value: string, type: 'text' | 'file' }[]
}) => {
    const start = performance.now()
    try {
        const fetchOpts: RequestInit = {
            method: opts.method,
            headers: { ...opts.headers }
        }

        if (opts.formFields && opts.formFields.length > 0 && !['GET', 'HEAD'].includes(opts.method.toUpperCase())) {
            const formData = new FormData()
            for (const field of opts.formFields) {
                if (field.type === 'file') {
                    let filePaths: string[] = []
                    try {
                        const parsed = JSON.parse(field.value)
                        filePaths = Array.isArray(parsed) ? parsed : [field.value]
                    } catch (e) {
                        filePaths = field.value ? [field.value] : []
                    }

                    for (const fp of filePaths) {
                        if (fp && fs.existsSync(fp)) {
                            const content = fs.readFileSync(fp)
                            const blob = new Blob([content])
                            formData.append(field.key, blob, path.basename(fp))
                        }
                    }
                } else {
                    formData.append(field.key, field.value)
                }
            }
            fetchOpts.body = formData as any

            // Remove manual Content-Type if it was set to multipart/form-data, 
            // fetch will set it with the correct boundary
            const ct = (fetchOpts.headers as any)['Content-Type'] || (fetchOpts.headers as any)['content-type']
            if (ct && ct.toLowerCase().includes('multipart/form-data')) {
                delete (fetchOpts.headers as any)['Content-Type']
                delete (fetchOpts.headers as any)['content-type']
            }
        } else if (opts.body && !['GET', 'HEAD'].includes(opts.method.toUpperCase())) {
            fetchOpts.body = opts.body
        }

        const res = await fetch(opts.url, fetchOpts)
        const bodyText = await res.text()
        const elapsed = Math.round(performance.now() - start)

        // Convert headers to plain object
        const resHeaders: Record<string, string> = {}
        res.headers.forEach((v, k) => { resHeaders[k] = v })

        return {
            success: true,
            status: res.status,
            statusText: res.statusText,
            headers: resHeaders,
            body: bodyText,
            time: elapsed,
            size: new TextEncoder().encode(bodyText).length
        }
    } catch (error: any) {
        const elapsed = Math.round(performance.now() - start)
        return {
            success: false,
            error: error.message || String(error),
            time: elapsed
        }
    }
})

// ─── Remote DB Management IPC ───────────────────────────────────

ipcMain.handle('test-db-connection', async (_event, url: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.ping()
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol (mysql:// or postgres://)' }
})

ipcMain.handle('create-remote-tables', async (_event, url: string) => {
    const schema = `
        CREATE TABLE IF NOT EXISTS projects (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL, database_url VARCHAR(500), proxy_url VARCHAR(500), last_deployed_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS folders (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50), name VARCHAR(100) NOT NULL, description TEXT, order_index INT DEFAULT 0, last_sync TIMESTAMP NULL, sync_status VARCHAR(20) DEFAULT 'synced', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS api_collections (
            id VARCHAR(50) PRIMARY KEY, 
            project_id VARCHAR(50), 
            folder_id VARCHAR(50), 
            name VARCHAR(100) NOT NULL, 
            description TEXT, 
            method VARCHAR(10) NOT NULL, 
            path TEXT NOT NULL, 
            url_params TEXT, 
            headers TEXT,   
            body_type VARCHAR(20) DEFAULT 'none', 
            raw_type VARCHAR(20) DEFAULT 'json',
            form_data TEXT,
            urlencoded TEXT,
            request_body TEXT, 
            response_examples TEXT, 
            version INT DEFAULT 1, 
            last_sync TIMESTAMP NULL, 
            sync_status VARCHAR(20) DEFAULT 'synced', 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS rbac_users (id VARCHAR(50) PRIMARY KEY, email VARCHAR(100), token VARCHAR(100) UNIQUE NOT NULL, allowed_folders TEXT NOT NULL, project_id VARCHAR(50), role VARCHAR(20) DEFAULT 'viewer', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS environments (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50), folder_id VARCHAR(50), name VARCHAR(100) NOT NULL, base_url TEXT, is_global BOOLEAN DEFAULT FALSE, variables TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS sync_queue (id VARCHAR(50) PRIMARY KEY, local_id VARCHAR(50), table_name VARCHAR(50), operation VARCHAR(20), data TEXT NOT NULL, status VARCHAR(20) DEFAULT 'pending', retries INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `
    const migrations = [
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_deployed_at TIMESTAMP NULL;`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS proxy_url VARCHAR(500);`,
        `ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS allowed_environments TEXT;`,
        `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS raw_type VARCHAR(20) DEFAULT 'json';`,
        `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS form_data TEXT;`,
        `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS urlencoded TEXT;`
    ]
    const statements = schema.trim().split(';').map(s => s.trim()).filter(Boolean)

    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, multipleStatements: true, connectTimeout: 10000 })
            for (const s of statements) await conn.execute(s)
            // Run migrations (ignoring errors if columns exist but ADD COLUMN IF NOT EXISTS isn't supported)
            for (const m of migrations) {
                try {
                    await conn.execute(m.replace('IF NOT EXISTS', '')) // MySQL 8.0.19+ doesn't support IF NOT EXISTS in ALTER TABLE well in all envs, so we catch
                } catch (e) { /* ignore */ }
            }
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            for (const s of statements) await client.query(s)
            // Run migrations
            for (const m of migrations) {
                try {
                    await client.query(m)
                } catch (e) { /* ignore */ }
            }
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('create-rbac-user', async (_event, url: string, user: { id: string, email: string, token: string, allowedFolders: any, allowedEnvironments: any, projectId: string, role: string }) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute(
                'INSERT INTO rbac_users (id, email, token, allowed_folders, allowed_environments, project_id, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user.id, user.email, user.token, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.projectId, user.role]
            )
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query(
                'INSERT INTO rbac_users (id, email, token, allowed_folders, allowed_environments, project_id, role) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [user.id, user.email, user.token, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.projectId, user.role]
            )
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('get-rbac-users', async (_event, url: string, projectId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            const [rows]: any = await conn.execute('SELECT * FROM rbac_users WHERE project_id = ?', [projectId])
            await conn.end()
            return { success: true, users: rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            const res = await client.query('SELECT * FROM rbac_users WHERE project_id = $1', [projectId])
            await client.end()
            return { success: true, users: res.rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('update-rbac-user', async (_event, url: string, user: { id: string, email: string, allowedFolders: any, allowedEnvironments: any, role: string }) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute(
                'UPDATE rbac_users SET email = ?, allowed_folders = ?, allowed_environments = ?, role = ? WHERE id = ?',
                [user.email, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.role, user.id]
            )
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query(
                'UPDATE rbac_users SET email = $1, allowed_folders = $2, allowed_environments = $3, role = $4 WHERE id = $5',
                [user.email, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.role, user.id]
            )
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('delete-rbac-user', async (_event, url: string, userId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute('DELETE FROM rbac_users WHERE id = ?', [userId])
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query('DELETE FROM rbac_users WHERE id = $1', [userId])
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('sync-direct', async (_event, url: string, entries: any[]) => {
    const results: any[] = []

    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, multipleStatements: true, connectTimeout: 10000 })
            for (const entry of entries) {
                const { tableName, operation, data } = entry
                const payload = typeof data === 'string' ? JSON.parse(data) : data
                try {
                    if (tableName === 'projects') {
                        if (operation === 'update' || operation === 'create') {
                            await conn.execute(
                                'INSERT INTO projects (id, name, database_url, proxy_url, last_deployed_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, database_url = ?, proxy_url = ?, last_deployed_at = ?',
                                [
                                    payload.id, payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null,
                                    payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null
                                ]
                            )
                        }
                    } else if (tableName === 'folders') {
                        if (operation === 'create' || operation === 'update') {
                            await conn.execute(
                                'INSERT INTO folders (id, project_id, name, description, order_index, sync_status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, description = ?, order_index = ?, sync_status = ?',
                                [payload.id, payload.projectId, payload.name, payload.description || '', payload.orderIndex || 0, 'synced', payload.name, payload.description || '', payload.orderIndex || 0, 'synced']
                            )
                        } else if (operation === 'delete') {
                            await conn.execute('DELETE FROM api_collections WHERE folder_id = ?', [payload.id])
                            await conn.execute('DELETE FROM folders WHERE id = ?', [payload.id])
                        }
                    } else if (tableName === 'apiCollections') {
                        if (operation === 'create' || operation === 'update') {
                            await conn.execute(
                                `INSERT INTO api_collections (
                                    id, project_id, folder_id, name, description, method, path, 
                                    url_params, headers, body_type, raw_type, form_data, urlencoded,
                                    request_body, response_examples, version, sync_status
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                                ON DUPLICATE KEY UPDATE 
                                    name=?, description=?, method=?, path=?, url_params=?, headers=?, 
                                    body_type=?, raw_type=?, form_data=?, urlencoded=?,
                                    request_body=?, response_examples=?, version=?, sync_status=?`,
                                [
                                    payload.id, payload.projectId, payload.folderId, payload.name, payload.description || '', payload.method, payload.path,
                                    JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                    payload.bodyType || 'none', payload.rawType || 'json',
                                    JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                    payload.requestBody || '',
                                    JSON.stringify(payload.responseExamples || []), payload.version || 1, 'synced',
                                    payload.name, payload.description || '', payload.method, payload.path,
                                    JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                    payload.bodyType || 'none', payload.rawType || 'json',
                                    JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                    payload.requestBody || '',
                                    JSON.stringify(payload.responseExamples || []), payload.version || 1, 'synced'
                                ]
                            )
                        } else if (operation === 'delete') {
                            await conn.execute('DELETE FROM api_collections WHERE id = ?', [payload.id])
                        }
                    } else if (tableName === 'environments') {
                        if (operation === 'create' || operation === 'update') {
                            await conn.execute(
                                'INSERT INTO environments (id, project_id, folder_id, name, base_url, is_global, variables) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE project_id=?, folder_id=?, name=?, base_url=?, is_global=?, variables=?',
                                [payload.id, payload.projectId, payload.folderId || null, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables, payload.projectId, payload.folderId || null, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables]
                            )
                        } else if (operation === 'delete') {
                            await conn.execute('DELETE FROM environments WHERE id = ?', [payload.id])
                        }
                    }
                    results.push({ id: entry.id, status: 'synced' })
                } catch (err: any) {
                    results.push({ id: entry.id, status: 'failed', error: err.message })
                }
            }
            await conn.end()
            return { success: true, results }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            for (const entry of entries) {
                const { tableName, operation, data } = entry
                const payload = typeof data === 'string' ? JSON.parse(data) : data
                const table = tableName === 'apiCollections' ? 'api_collections' : tableName
                try {
                    if (tableName === 'projects') {
                        await client.query(
                            'INSERT INTO projects (id, name, database_url, proxy_url, last_deployed_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = $2, database_url = $3, proxy_url = $4, last_deployed_at = $5',
                            [payload.id, payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null]
                        )
                    } else if (tableName === 'folders') {
                        if (operation === 'create' || operation === 'update') {
                            await client.query(
                                'INSERT INTO folders (id, project_id, name, description, order_index, sync_status) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name=$3, description=$4, order_index=$5, sync_status=$6',
                                [payload.id, payload.projectId, payload.name, payload.description || '', payload.orderIndex || 0, 'synced']
                            )
                        } else if (operation === 'delete') {
                            await client.query('DELETE FROM api_collections WHERE folder_id = $1', [payload.id])
                            await client.query('DELETE FROM folders WHERE id = $1', [payload.id])
                        }
                    } else if (tableName === 'apiCollections') {
                        if (operation === 'create' || operation === 'update') {
                            await client.query(
                                `INSERT INTO api_collections (
                                    id, project_id, folder_id, name, description, method, path, 
                                    url_params, headers, body_type, raw_type, form_data, urlencoded,
                                    request_body, response_examples, version, sync_status
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
                                ON CONFLICT (id) DO UPDATE SET 
                                    name=$4, description=$5, method=$6, path=$7, url_params=$8, headers=$9, 
                                    body_type=$10, raw_type=$11, form_data=$12, urlencoded=$13,
                                    request_body=$14, response_examples=$15, version=$16, sync_status=$17`,
                                [
                                    payload.id, payload.projectId, payload.folderId, payload.name, payload.description || '', payload.method, payload.path,
                                    JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                    payload.bodyType || 'none', payload.rawType || 'json',
                                    JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                    payload.requestBody || '',
                                    JSON.stringify(payload.responseExamples || []), payload.version || 1, 'synced'
                                ]
                            )
                        } else if (operation === 'delete') {
                            await client.query('DELETE FROM api_collections WHERE id = $1', [payload.id])
                        }
                    } else if (tableName === 'environments') {
                        if (operation === 'create' || operation === 'update') {
                            await client.query(
                                'INSERT INTO environments (id, project_id, folder_id, name, base_url, is_global, variables) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET project_id=$2, folder_id=$3, name=$4, base_url=$5, is_global=$6, variables=$7',
                                [payload.id, payload.projectId, payload.folderId || null, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables]
                            )
                        } else if (operation === 'delete') {
                            await client.query('DELETE FROM environments WHERE id = $1', [payload.id])
                        }
                    }
                    results.push({ id: entry.id, status: 'synced' })
                } catch (err: any) {
                    results.push({ id: entry.id, status: 'failed', error: err.message })
                }
            }
            await client.end()
            return { success: true, results }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('fetch-remote-data', async (_event, url: string, projectId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            const [folders]: any = await conn.execute('SELECT * FROM folders WHERE project_id = ?', [projectId])
            const [apis]: any = await conn.execute('SELECT * FROM api_collections WHERE project_id = ?', [projectId])
            const [environments]: any = await conn.execute('SELECT * FROM environments WHERE project_id = ?', [projectId])
            await conn.end()
            return { success: true, folders, apis, environments }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            const foldersRes = await client.query('SELECT * FROM folders WHERE project_id = $1', [projectId])
            const apisRes = await client.query('SELECT * FROM api_collections WHERE project_id = $1', [projectId])
            const environmentsRes = await client.query('SELECT * FROM environments WHERE project_id = $1', [projectId])
            await client.end()
            return { success: true, folders: foldersRes.rows, apis: apisRes.rows, environments: environmentsRes.rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('get-remote-projects', async (_event, url: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            const [rows]: any = await conn.execute('SELECT id, name, created_at FROM projects ORDER BY created_at DESC')
            await conn.end()
            return { success: true, projects: rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            const res = await client.query('SELECT id, name, created_at FROM projects ORDER BY created_at DESC')
            await client.end()
            return { success: true, projects: res.rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('delete-remote-project', async (_event, url: string, projectId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute('DELETE FROM api_collections WHERE project_id = ?', [projectId])
            await conn.execute('DELETE FROM folders WHERE project_id = ?', [projectId])
            await conn.execute('DELETE FROM rbac_users WHERE project_id = ?', [projectId])
            await conn.execute('DELETE FROM projects WHERE id = ?', [projectId])
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query('DELETE FROM api_collections WHERE project_id = $1', [projectId])
            await client.query('DELETE FROM folders WHERE project_id = $1', [projectId])
            await client.query('DELETE FROM rbac_users WHERE project_id = $1', [projectId])
            await client.query('DELETE FROM projects WHERE id = $1', [projectId])
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('deploy-to-vercel', async (_event, params: { databaseUrl: string, adminToken?: string, projectId: string, projectName: string }) => {
    const projectRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const serverPath = join(projectRoot, 'server')

    if (!fs.existsSync(serverPath)) {
        console.error('[Deploy] Server path not found:', serverPath)
        return {
            success: false,
            error: `Deployment folder not found. If you are using the packaged app, please ensure the 'server' folder exists in the resources directory.`
        }
    }

    // Sanitize project name for Vercel (lowercase, alphanumeric and hyphens only)
    const sanitizedName = params.projectName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    // Create a unique project name: api-doc-[name]-[short-id]
    const shortId = params.projectId.split('-')[0]
    const vercelProjectName = `api-doc-${sanitizedName || 'project'}-${shortId}`

    const runVercelCommand = (command: string, stdinValue?: string) => {
        return new Promise<{ success: boolean; error?: string; output?: string }>((resolve) => {
            mainWindow?.webContents.send('deploy-output', `\n> Executing: ${command}\n`)

            const shell = process.platform === 'win32' ? 'cmd' : 'sh'
            const args = process.platform === 'win32' ? ['/c', command] : ['-c', command]

            const child = spawn(shell, args, { cwd: serverPath })
            let fullOutput = ''

            if (stdinValue) {
                child.stdin.write(stdinValue + '\n')
                child.stdin.end()
            }

            child.stdout.on('data', (data) => {
                const s = data.toString()
                fullOutput += s
                mainWindow?.webContents.send('deploy-output', s)
            })

            child.stderr.on('data', (data) => {
                const s = data.toString()
                fullOutput += s
                mainWindow?.webContents.send('deploy-output', s)
            })

            child.on('close', (code) => {
                if (code === 0) resolve({ success: true, output: fullOutput })
                else resolve({ success: false, error: `Exited with code ${code}`, output: fullOutput })
            })

            child.on('error', (err: any) => {
                let errorMessage = err.message
                if (err.code === 'ENOENT') {
                    errorMessage = `Deployment failed: System command not found. Please ensure Node.js and NPX are installed on this computer.`
                }
                resolve({ success: false, error: errorMessage, output: fullOutput })
            })
        })
    }

    try {
        // 0. Ensure linked to a UNIQUE project name
        // This creates/links the Vercel project with a name unique to THIS local project
        await runVercelCommand(`npx vercel@latest link --project ${vercelProjectName} --yes`)

        // 1. Set DATABASE_URL
        const resDb = await runVercelCommand(`npx vercel@latest env add DATABASE_URL production`, params.databaseUrl)
        if (!resDb.success) {
            mainWindow?.webContents.send('deploy-output', `Note: Proceeding even if env var exists or failed to set.\n`)
        }

        // 2. Set ADMIN_TOKEN if provided
        if (params.adminToken) {
            const resAdmin = await runVercelCommand(`npx vercel@latest env add ADMIN_TOKEN production`, params.adminToken)
            if (!resAdmin.success) {
                mainWindow?.webContents.send('deploy-output', `Note: Proceeding even if env var exists or failed to set.\n`)
            }
        }

        // 3. Final Production Deployment
        const resDeploy = await runVercelCommand(`npx vercel@latest --prod --yes`)

        if (resDeploy.success && resDeploy.output) {
            const lines = resDeploy.output.split('\n')
            let url = ''

            for (const line of lines) {
                // Look for Aliased URL (preferred clean domain)
                const aliasMatch = line.match(/Aliased:\s*(https:\/\/\S+)/i)
                if (aliasMatch) {
                    url = aliasMatch[1]
                    continue
                }

                // Look for Production URL (backup if alias not found yet)
                const prodMatch = line.match(/Production:\s*(https:\/\/\S+)/i)
                if (prodMatch && !url) {
                    url = prodMatch[1]
                }
            }

            if (url) {
                return { success: true, url }
            }
        }

        return resDeploy
    } catch (err: any) {
        return { success: false, error: err.message }
    }
})

ipcMain.handle('delete-vercel-project', async (_event, params: { projectId: string, projectName: string }) => {
    const projectRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const serverPath = join(projectRoot, 'server')

    const sanitizedName = params.projectName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    const shortId = params.projectId.split('-')[0]
    const vercelProjectName = `api-doc-${sanitizedName || 'project'}-${shortId}`

    return new Promise((resolve) => {
        const shell = process.platform === 'win32' ? 'cmd' : 'sh'
        const command = `npx vercel@latest project rm ${vercelProjectName}`
        const args = process.platform === 'win32' ? ['/c', command] : ['-c', command]

        const child = spawn(shell, args, { cwd: serverPath })
        let output = ''

        // Send 'y' to confirm the deletion if prompted
        child.stdin.write('y\n')
        child.stdin.end()

        child.stdout.on('data', (data) => { output += data.toString() })
        child.stderr.on('data', (data) => { output += data.toString() })

        child.on('close', (code) => {
            if (code === 0) resolve({ success: true, output })
            else resolve({ success: false, error: `Exited with code ${code}`, output })
        })

        child.on('error', (err) => resolve({ success: false, error: err.message, output }))
    })
})

// Auto-Updater Configuration
autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', 'checking')
})

autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version)
    mainWindow?.webContents.send('update-status', 'available', info.version)
})

autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-status', 'up-to-date')
})

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-progress', Math.round(progressObj.percent))
})

autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version)
    mainWindow?.webContents.send('update-status', 'downloaded', info.version)
})

autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err)
    mainWindow?.webContents.send('update-status', 'error', err.message)
})

ipcMain.handle('restart-app', () => {
    autoUpdater.quitAndInstall()
})

app.whenReady().then(() => {
    // Check for updates on startup
    if (!is.dev) {
        autoUpdater.checkForUpdatesAndNotify()
    }

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
