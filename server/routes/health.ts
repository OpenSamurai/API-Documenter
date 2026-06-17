import { initDB, ensureSchema } from '../src/db/proxyDb.js';

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    try {
        const db = await initDB();

        // Force migration if requested
        if (new URL(req.url, `http://${req.headers.host}`).searchParams.get('migrate') === 'true') {
            await ensureSchema(db);
        }

        await db.query('SELECT 1');
        res.status(200).json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
            service: 'API Documenter RBAC Proxy'
        });
    } catch (err: any) {
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
}
