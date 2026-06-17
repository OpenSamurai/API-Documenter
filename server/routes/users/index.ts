import { authenticate } from '../../src/middleware/auth.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';

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

    if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        if (req.method === 'GET') {
            const users = await db.query('SELECT id, email, role, allowed_folders, created_at FROM rbac_users WHERE project_id = ?', [user.projectId]);
            return res.status(200).json(users);
        }

        if (req.method === 'POST') {
            const { id, email, token: userToken, allowed_folders, role } = req.body;
            if (!id || !email || !userToken || !allowed_folders) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            await db.execute(
                'INSERT INTO rbac_users (id, email, token, allowed_folders, project_id, role) VALUES (?, ?, ?, ?, ?, ?)',
                [id, email, userToken, JSON.stringify(allowed_folders), user.projectId, role || 'viewer']
            );

            return res.status(201).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    } finally {
    }
}
