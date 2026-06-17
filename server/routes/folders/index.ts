import { authenticate } from '../../src/middleware/auth.js';
import crypto from 'crypto';
import { checkFolderAccess } from '../../src/middleware/rbac.js';
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
            let folders;
            const isWildcard = Array.isArray(user.allowedFolders)
                ? (user.allowedFolders as string[]).some(f => f === '*')
                : !!(user.allowedFolders as Record<string, any>)['*'];

            if (user.role === 'admin' || isWildcard) {
                folders = await db.query(
                    'SELECT * FROM folders WHERE project_id = ? AND branch = ? AND (is_deleted = 0 OR is_deleted = false OR is_deleted IS NULL) ORDER BY order_index ASC',
                    [user.projectId, activeBranch]
                );
            } else {
                // To support both ID and Name based permissions during transition, 
                // we fetch all folders for the project and filter in JS.
                const allFolders = await db.query(
                    'SELECT * FROM folders WHERE project_id = ? AND branch = ? AND (is_deleted = 0 OR is_deleted = false OR is_deleted IS NULL) ORDER BY order_index ASC',
                    [user.projectId, activeBranch]
                );
                folders = allFolders.filter((f: any) => {
                    return (user.allowedFolders as any[]).some((p: any) => {
                        const idOrName = typeof p === 'string' ? p : p.folderId;
                        return idOrName === f.id || idOrName === f.name;
                    });
                });
            }

            // Inject role into each folder
            const enrichedFolders = folders.map((f: any) => {
                let effectiveRole = user.role;
                const allowed = user.allowedFolders;

                if (Array.isArray(allowed)) {
                    if (allowed.some(item => item === '*')) {
                        effectiveRole = user.role;
                    } else {
                        // Find permission object by folderId (could be UUID or Name)
                        const perm = (allowed as any[]).find((p: any) => {
                            const idOrName = typeof p === 'string' ? p : p.folderId;
                            return idOrName === f.id || idOrName === f.name;
                        });

                        if (perm && typeof perm === 'object' && perm.role) {
                            effectiveRole = perm.role;
                        } else if (perm && typeof perm === 'string') {
                            // Legacy string format
                            effectiveRole = user.role;
                        }
                    }
                } else if (allowed && typeof allowed === 'object') {
                    // Legacy Record format
                    effectiveRole = (allowed as any)[f.id] || (allowed as any)[f.name] || user.role;
                }
                return { ...f, role: effectiveRole };
            });

            return res.status(200).json(enrichedFolders);
        }

        if (req.method === 'POST') {
            if (user.role === 'viewer') return res.status(403).json({ error: 'Viewer role cannot create folders' });

            const { id, name, description, order_index } = req.body;
            if (!id || !name) return res.status(400).json({ error: 'ID and Name are required' });

            await db.execute(
                'INSERT INTO folders (id, project_id, branch, name, description, order_index, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, user.projectId, activeBranch, name, description || '', order_index || 0, 'synced']
            );

            await db.execute(
                `INSERT INTO sync_queue (id, project_id, local_id, branch, table_name, operation, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), user.projectId, id, activeBranch, 'folders', 'create', JSON.stringify(req.body), 'pending']
            );

            // If editor, automatically grant permission to the folder they created (implementation detail: requires updating rbac_users in some setups, but here we assume allowed_folders includes it or is handled by admin)

            return res.status(201).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
