import { authenticate } from '../../src/middleware/auth.js';
import { checkProjectAccess } from '../../src/middleware/rbac.js';
import { rateLimit } from '../../src/middleware/rateLimit.js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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
            const url = new URL(req.url, `http://${req.headers.host}`);
            const tableName = url.searchParams.get('tableName');
            const entityId = url.searchParams.get('entityId');
            const branch = url.searchParams.get('branch') || 'main';
            
            if (!tableName || !entityId) return res.status(400).json({ error: 'tableName and entityId are required' });
            
            // Allow admin, since resolution is only for admin
            if (user.role !== 'admin') {
                return res.status(403).json({ error: 'Only admins can fetch specific entities for resolution' });
            }

            const dbTableName = tableName === 'apiCollections' ? 'api_collections' : tableName;

            const items = await db.query(
                `SELECT * FROM ${dbTableName} WHERE id = ? AND branch = ?`,
                [entityId, branch]
            );

            if (items.length > 0) {
                return res.status(200).json(items[0]);
            } else {
                return res.status(404).json({ error: 'Entity not found' });
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
