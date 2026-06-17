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
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.pathname.split('/').pop();

    if (!id) {
        return res.status(400).json({ error: 'Folder ID is required' });
    }

    try {
        const activeBranch = await getProjectActiveBranch(db, user.projectId);

        if (req.method === 'GET') {
            await checkFolderAccess(context, id, 'read');
            const folders = await db.query('SELECT * FROM folders WHERE id = ? AND branch = ? AND project_id = ?', [id, activeBranch, user.projectId]) as any[];
            if (folders.length === 0) return res.status(404).json({ error: 'Folder not found' });

            const f = folders[0];
            let effectiveRole = user.role;
            if (Array.isArray(user.allowedFolders)) {
                if (user.allowedFolders.some(item => item === '*')) {
                    effectiveRole = user.role;
                } else if (typeof user.allowedFolders[0] === 'object' && user.allowedFolders[0] !== null) {
                    const perm = (user.allowedFolders as any[]).find((p: any) => p.folderId === f.id);
                    if (perm) effectiveRole = perm.role;
                } else if (user.allowedFolders.includes(f.id)) {
                    effectiveRole = user.role;
                }
            } else if (user.allowedFolders && typeof user.allowedFolders === 'object') {
                effectiveRole = (user.allowedFolders as any)[f.id] || (user.allowedFolders as any)[f.name] || user.role;
            }

            return res.status(200).json({ ...f, role: effectiveRole });
        }

        if (req.method === 'PUT') {
            await checkFolderAccess(context, id, 'write');
            const { name, description, order_index } = req.body;

            await db.execute(
                'UPDATE folders SET name = ?, description = ?, order_index = ?, sync_status = ?, version = version + 1 WHERE id = ? AND branch = ? AND project_id = ?',
                [name, description, order_index, 'synced', id, activeBranch, user.projectId]
            );

            await db.execute(
                `INSERT INTO sync_queue (id, project_id, local_id, branch, table_name, operation, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), user.projectId, id, activeBranch, 'folders', 'update', JSON.stringify(req.body), 'pending']
            );

            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required to delete folders' });

            // Soft delete child APIs
            await db.execute(
                'UPDATE api_collections SET is_deleted = 1, deleted_at = NOW(), version = version + 1, sync_status = ? WHERE folder_id = ? AND branch = ?',
                ['synced', id, activeBranch]
            );
            // Soft delete folder
            await db.execute(
                'UPDATE folders SET is_deleted = 1, deleted_at = NOW(), version = version + 1, sync_status = ? WHERE id = ? AND branch = ? AND project_id = ?',
                ['synced', id, activeBranch, user.projectId]
            );

            await db.execute(
                `INSERT INTO sync_queue (id, project_id, local_id, branch, table_name, operation, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), user.projectId, id, activeBranch, 'folders', 'delete', JSON.stringify({ id }), 'pending']
            );

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}

