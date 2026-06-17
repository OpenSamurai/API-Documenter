import { ipcMain } from 'electron'
import { BaseController } from './BaseController'
import mysql from 'mysql2/promise'
import pg from 'pg'

export class DatabaseController extends BaseController {
    registerHandlers(): void {
        ipcMain.handle('test-db-connection', this.testConnection.bind(this))
        ipcMain.handle('create-remote-tables', this.createRemoteTables.bind(this))
        ipcMain.handle('create-rbac-user', this.createRbacUser.bind(this))
        ipcMain.handle('get-rbac-users', this.getRbacUsers.bind(this))
        ipcMain.handle('update-rbac-user', this.updateRbacUser.bind(this))
        ipcMain.handle('delete-rbac-user', this.deleteRbacUser.bind(this))
    }

    async testConnection(_event: any, url: string) {
        if (url.startsWith('mysql://')) {
            try {
                const conn = await mysql.createConnection({ uri: url, connectTimeout: 30000, timezone: 'Z' })
                await conn.ping()
                await conn.end()
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
            try {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                await client.end()
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
        return { success: false, error: 'Unsupported protocol (mysql:// or postgres://)' }
    }

    async createRemoteTables(_event: any, url: string) {
        const schema = `
            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(50) PRIMARY KEY, 
                name VARCHAR(100) NOT NULL, 
                database_url VARCHAR(500), 
                proxy_url VARCHAR(500), 
                last_deployed_at TIMESTAMP NULL, 
                synced_branches TEXT,
                version INT DEFAULT 1,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS folders (
                id VARCHAR(50), 
                project_id VARCHAR(50), 
                branch VARCHAR(100) DEFAULT 'main',
                name VARCHAR(100) NOT NULL, 
                description TEXT, 
                order_index INT DEFAULT 0, 
                last_sync TIMESTAMP NULL, 
                sync_status VARCHAR(20) DEFAULT 'synced', 
                version INT DEFAULT 1,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id, branch)
            );
            CREATE TABLE IF NOT EXISTS api_collections (
                id VARCHAR(50), 
                project_id VARCHAR(50), 
                folder_id VARCHAR(50), 
                branch VARCHAR(100) DEFAULT 'main',
                name VARCHAR(100) NOT NULL, 
                description TEXT, 
                method VARCHAR(10) NOT NULL, 
                path TEXT NOT NULL, 
                url_params MEDIUMTEXT, 
                headers MEDIUMTEXT,   
                body_type VARCHAR(20) DEFAULT 'none', 
                raw_type VARCHAR(20) DEFAULT 'json',
                form_data MEDIUMTEXT,
                urlencoded MEDIUMTEXT,
                request_body MEDIUMTEXT, 
                response_examples MEDIUMTEXT, 
                version INT DEFAULT 1, 
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP NULL,
                last_sync TIMESTAMP NULL, 
                sync_status VARCHAR(20) DEFAULT 'synced', 
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id, branch)
            );
            CREATE TABLE IF NOT EXISTS rbac_users (
                id VARCHAR(50) PRIMARY KEY, 
                email VARCHAR(100), 
                token VARCHAR(100) UNIQUE NOT NULL, 
                allowed_folders TEXT NOT NULL, 
                project_id VARCHAR(50), 
                role VARCHAR(20) DEFAULT 'viewer', 
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS environments (
                id VARCHAR(50), 
                project_id VARCHAR(50), 
                folder_id VARCHAR(50), 
                branch VARCHAR(100) DEFAULT 'main',
                name VARCHAR(100) NOT NULL, 
                base_url MEDIUMTEXT, 
                is_global BOOLEAN DEFAULT FALSE, 
                variables MEDIUMTEXT, 
                version INT DEFAULT 1,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id, branch)
            );
            CREATE TABLE IF NOT EXISTS sync_queue (
                id VARCHAR(50) PRIMARY KEY, 
                project_id VARCHAR(50),
                local_id VARCHAR(50), 
                branch VARCHAR(100) DEFAULT 'main',
                table_name VARCHAR(50), 
                operation VARCHAR(20), 
                data MEDIUMTEXT NOT NULL, 
                status VARCHAR(20) DEFAULT 'pending', 
                retries INT DEFAULT 0, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `
        const migrations = [
            `ALTER TABLE projects ADD COLUMN version INT DEFAULT 1;`,
            `ALTER TABLE projects ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;`,
            `ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMP NULL;`,
            `ALTER TABLE folders ADD COLUMN version INT DEFAULT 1;`,
            `ALTER TABLE folders ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;`,
            `ALTER TABLE folders ADD COLUMN deleted_at TIMESTAMP NULL;`,
            `ALTER TABLE api_collections ADD COLUMN version INT DEFAULT 1;`,
            `ALTER TABLE api_collections ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;`,
            `ALTER TABLE api_collections ADD COLUMN deleted_at TIMESTAMP NULL;`,
            `ALTER TABLE environments ADD COLUMN version INT DEFAULT 1;`,
            `ALTER TABLE environments ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;`,
            `ALTER TABLE environments ADD COLUMN deleted_at TIMESTAMP NULL;`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS synced_branches TEXT;`,
            `ALTER TABLE folders ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'main';`,
            `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'main';`,
            `ALTER TABLE environments ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'main';`,
            `ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS branch VARCHAR(100) DEFAULT 'main';`,
            `ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS project_id VARCHAR(50);`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_deployed_at TIMESTAMP NULL;`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS proxy_url VARCHAR(500);`,
            `ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS allowed_environments TEXT;`,
            `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS raw_type VARCHAR(20) DEFAULT 'json';`,
            `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS form_data MEDIUMTEXT;`,
            `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS urlencoded MEDIUMTEXT;`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;`,
            `ALTER TABLE folders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;`,
            `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;`,
            `ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;`,
            `ALTER TABLE environments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;`,
            `ALTER TABLE api_collections MODIFY COLUMN request_body MEDIUMTEXT;`,
            `ALTER TABLE api_collections MODIFY COLUMN response_examples MEDIUMTEXT;`,
            `ALTER TABLE api_collections MODIFY COLUMN url_params MEDIUMTEXT;`,
            `ALTER TABLE api_collections MODIFY COLUMN headers MEDIUMTEXT;`,
            `ALTER TABLE sync_queue MODIFY COLUMN data MEDIUMTEXT;`,
            `ALTER TABLE environments MODIFY COLUMN variables MEDIUMTEXT;`,
            `ALTER TABLE environments MODIFY COLUMN base_url MEDIUMTEXT;`,
            `ALTER TABLE folders DROP PRIMARY KEY, ADD PRIMARY KEY (id, branch);`,
            `ALTER TABLE api_collections DROP PRIMARY KEY, ADD PRIMARY KEY (id, branch);`,
            `ALTER TABLE environments DROP PRIMARY KEY, ADD PRIMARY KEY (id, branch);`,
            `ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_pkey;`,
            `ALTER TABLE folders ADD PRIMARY KEY (id, branch);`,
            `ALTER TABLE api_collections DROP CONSTRAINT IF EXISTS api_collections_pkey;`,
            `ALTER TABLE api_collections ADD PRIMARY KEY (id, branch);`,
            `ALTER TABLE environments DROP CONSTRAINT IF EXISTS environments_pkey;`,
            `ALTER TABLE environments ADD PRIMARY KEY (id, branch);`
        ]
        const statements = schema.trim().split(';').map(s => s.trim()).filter(Boolean)

        if (url.startsWith('mysql://')) {
            try {
                const conn = await mysql.createConnection({ uri: url, multipleStatements: true, connectTimeout: 30000, timezone: 'Z' })
                for (const s of statements) await conn.execute(s)
                for (const m of migrations) {
                    try {
                        await conn.execute(m.replace('IF NOT EXISTS', ''))
                    } catch (e) { /* ignore */ }
                }
                await conn.end()
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
            try {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                for (const s of statements) await client.query(s)
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
    }

    async createRbacUser(_event: any, url: string, user: any) {
        if (url.startsWith('mysql://')) {
            try {
                const conn = await mysql.createConnection({ uri: url, connectTimeout: 30000 })
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
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
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
    }

    async getRbacUsers(_event: any, url: string, projectId: string) {
        if (url.startsWith('mysql://')) {
            try {
                const conn = await mysql.createConnection({ uri: url, connectTimeout: 30000 })
                const [rows]: any = await conn.execute('SELECT * FROM rbac_users WHERE project_id = ?', [projectId])
                await conn.end()
                return { success: true, users: rows }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
            try {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                const res = await client.query('SELECT * FROM rbac_users WHERE project_id = $1', [projectId])
                await client.end()
                return { success: true, users: res.rows }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
        return { success: false, error: 'Unsupported protocol' }
    }

    async updateRbacUser(_event: any, url: string, user: any) {
        if (url.startsWith('mysql://')) {
            try {
                const conn = await mysql.createConnection({ uri: url, connectTimeout: 30000 })
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
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
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
    }

    async deleteRbacUser(_event: any, url: string, userId: string) {
        if (url.startsWith('mysql://')) {
            try {
                const conn = await mysql.createConnection({ uri: url, connectTimeout: 30000 })
                await conn.execute('DELETE FROM rbac_users WHERE id = ?', [userId])
                await conn.end()
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
            try {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query('DELETE FROM rbac_users WHERE id = $1', [userId])
                await client.end()
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
        return { success: false, error: 'Unsupported protocol' }
    }
}
