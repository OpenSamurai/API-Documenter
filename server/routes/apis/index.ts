import { authenticate } from '../../src/middleware/auth.js';
import crypto from 'crypto';
import { checkFolderAccess, checkProjectAccess } from '../../src/middleware/rbac.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import { getProjectActiveBranch } from '../../src/db/proxyDb.js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    let context;
    try {
        context = await authenticate(req);
        const token = req.headers.authorization?.replace('Bearer ', '') || new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
        if (token) rateLimit(token);
    } catch (err: any) {
        return res.status(401).json({ error: err.message });
    }

    const { db, user } = context;

    try {
        const activeBranch = await getProjectActiveBranch(db, user.projectId);

        if (req.method === 'GET') {
            const folderId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('folderId');

            let apis: any[] = [];
            if (folderId) {
                await checkFolderAccess(context, folderId, 'read');
                apis = await db.query('SELECT * FROM api_collections WHERE folder_id = ? AND branch = ?', [folderId, activeBranch]);
            } else {
                // Return all APIs user has access to
                const isWildcard = Array.isArray(user.allowedFolders)
                    ? user.allowedFolders.includes('*')
                    : !!(user.allowedFolders as Record<string, any>)['*'];

                if (user.role === 'admin' || isWildcard) {
                    apis = await db.query('SELECT * FROM api_collections WHERE project_id = ? AND branch = ?', [user.projectId, activeBranch]);
                } else {
                    // Resolve actual folder IDs by checking both ID and name in permissions
                    const allFolders = await db.query('SELECT id, name FROM folders WHERE project_id = ? AND branch = ?', [user.projectId, activeBranch]);
                    const allowedFolderIds = allFolders.filter((f: any) => {
                        return (user.allowedFolders as any[]).some((p: any) => {
                            const idOrName = typeof p === 'string' ? p : p.folderId;
                            return idOrName === f.id || idOrName === f.name;
                        });
                    }).map((f: any) => f.id);

                    if (allowedFolderIds.length === 0) {
                        apis = [];
                    } else {
                        const placeholders = allowedFolderIds.map(() => '?').join(',');
                        apis = await db.query(
                            `SELECT * FROM api_collections WHERE project_id = ? AND branch = ? AND folder_id IN (${placeholders})`,
                            [user.projectId, activeBranch, ...allowedFolderIds]
                        );
                    }
                }
            }
            return res.status(200).json(apis);
        }

        if (req.method === 'POST') {
            const {
                id, folder_id, name, description, method, path,
                url_params, headers, body_type, raw_type, form_data, urlencoded,
                request_body, response_examples
            } = req.body;

            if (!id || !folder_id || !name || !method) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            await checkProjectAccess(context, user.projectId);
            await checkFolderAccess(context, folder_id, 'write');

            await db.execute(
                `INSERT INTO api_collections (
          id, project_id, folder_id, branch, name, description, method, path, 
          url_params, headers, body_type, raw_type, form_data, urlencoded, 
          request_body, response_examples, version, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, user.projectId, folder_id, activeBranch, name, description || '', method, path,
                    JSON.stringify(url_params || []), JSON.stringify(headers || []),
                    body_type || 'none', raw_type || 'json',
                    JSON.stringify(form_data || []), JSON.stringify(urlencoded || []),
                    request_body || '',
                    JSON.stringify(response_examples || []), 1, 'synced'
                ]
            );

            await db.execute(
                `INSERT INTO sync_queue (id, project_id, local_id, branch, table_name, operation, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), user.projectId, id, activeBranch, 'apiCollections', 'create', JSON.stringify(req.body), 'pending']
            );

            return res.status(201).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
