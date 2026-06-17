import { authenticate } from '../../src/middleware/auth.js';
import { checkProjectAccess } from '../../src/middleware/rbac.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';
import { getProjectActiveBranch } from '../../src/db/proxyDb.js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
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
        if (req.method === 'GET') {
            const projectId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('projectId');
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            
            // Only admin can pull the queue
            if (user.role !== 'admin') {
                return res.status(403).json({ error: 'Only admins can pull the sync queue' });
            }
            
            await checkProjectAccess(context, projectId);

            const branch = new URL(req.url, `http://${req.headers.host}`).searchParams.get('branch') || await getProjectActiveBranch(db, projectId);

            const items = await db.query(
                'SELECT * FROM sync_queue WHERE project_id = ? AND branch = ? AND status = ? ORDER BY created_at DESC',
                [projectId, branch, 'pending']
            );

            return res.status(200).json(items);
        }

        if (req.method === 'PUT') {
            if (user.role !== 'admin') return res.status(403).json({ error: 'Only admins can update the sync queue' });

            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'ids array is required' });
            }

            const projectId = req.body.projectId;
            if (!projectId) return res.status(400).json({ error: 'projectId is required' });
            
            await checkProjectAccess(context, projectId);

            const placeholders = ids.map(() => '?').join(',');
            await db.execute(
                `UPDATE sync_queue SET status = 'synced' WHERE project_id = ? AND id IN (${placeholders})`,
                [projectId, ...ids]
            );

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
