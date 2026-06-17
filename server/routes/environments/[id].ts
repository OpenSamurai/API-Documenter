import { authenticate } from '../../src/middleware/auth.js';
import crypto from 'crypto';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import { checkEnvironmentAccess } from '../../src/middleware/rbac.js';
import { getProjectActiveBranch } from '../../src/db/proxyDb.js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Environment ID is required' });

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

        if (req.method === 'PUT') {
            const { name, baseUrl, isGlobal, folderId, variables } = req.body;

            // Check if environment belongs to this project
            const existing = await db.query('SELECT * FROM environments WHERE id = ? AND branch = ? AND project_id = ?', [id, activeBranch, user.projectId]) as any[];
            if (!existing.length) return res.status(404).json({ error: 'Environment not found' });

            // Enforce RBAC
            await checkEnvironmentAccess(context, id, 'write', Number(existing[0].is_global) === 1);

            await db.execute(
                'UPDATE environments SET name = ?, base_url = ?, is_global = ?, folder_id = ?, variables = ?, version = version + 1 WHERE id = ? AND branch = ? AND project_id = ?',
                [name, baseUrl || '', isGlobal ? 1 : 0, folderId || null, variables, id, activeBranch, user.projectId]
            );

            await db.execute(
                `INSERT INTO sync_queue (id, project_id, local_id, branch, table_name, operation, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), user.projectId, id, activeBranch, 'environments', 'update', JSON.stringify(req.body), 'pending']
            );

            return res.status(200).json({ success: true });
        }

        if (req.method === 'DELETE') {
            const existing = await db.query('SELECT * FROM environments WHERE id = ? AND branch = ? AND project_id = ?', [id, activeBranch, user.projectId]) as any[];
            if (!existing.length) return res.status(404).json({ error: 'Environment not found' });

            // Enforce RBAC
            await checkEnvironmentAccess(context, id, 'delete', Number(existing[0].is_global) === 1);

            // Soft delete
            await db.execute(
                'UPDATE environments SET is_deleted = 1, deleted_at = NOW(), version = version + 1 WHERE id = ? AND branch = ? AND project_id = ?',
                [id, activeBranch, user.projectId]
            );

            await db.execute(
                `INSERT INTO sync_queue (id, project_id, local_id, branch, table_name, operation, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), user.projectId, id, activeBranch, 'environments', 'delete', JSON.stringify({ id }), 'pending']
            );

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}

