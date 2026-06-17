import healthHandler from '../routes/health.js';
import syncHandler from '../routes/sync.js';
import apisIndexHandler from '../routes/apis/index.js';
import apisIdHandler from '../routes/apis/[id].js';
import environmentsIndexHandler from '../routes/environments/index.js';
import environmentsIdHandler from '../routes/environments/[id].js';
import foldersIndexHandler from '../routes/folders/index.js';
import foldersIdHandler from '../routes/folders/[id].js';
import rbacDocsHandler from '../routes/rbac/docs.js';
import rbacFoldersHandler from '../routes/rbac/folders.js';
import rbacIndexHandler from '../routes/rbac/index.js';
import syncQueueIndexHandler from '../routes/sync_queue/index.js';
import usersIndexHandler from '../routes/users/index.js';

export default async function handler(req: any, res: any) {
    // Basic CORS for unhandled preflights
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        let pathname = url.pathname;
        
        // Remove trailing slash if present
        if (pathname.length > 1 && pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1);
        }

        // Exact matches
        if (pathname === '/api/health') return healthHandler(req, res);
        if (pathname === '/api/sync') return syncHandler(req, res);
        if (pathname === '/api/apis') return apisIndexHandler(req, res);
        if (pathname === '/api/environments') return environmentsIndexHandler(req, res);
        if (pathname === '/api/folders') return foldersIndexHandler(req, res);
        if (pathname === '/api/rbac') return rbacIndexHandler(req, res);
        if (pathname === '/api/rbac/docs') return rbacDocsHandler(req, res);
        if (pathname === '/api/rbac/folders') return rbacFoldersHandler(req, res);
        if (pathname === '/api/sync_queue') return syncQueueIndexHandler(req, res);
        if (pathname === '/api/users') return usersIndexHandler(req, res);

        // Dynamic ID matches
        if (pathname.startsWith('/api/apis/')) {
            req.query = { ...req.query, id: pathname.split('/').pop() };
            return apisIdHandler(req, res);
        }
        if (pathname.startsWith('/api/environments/')) {
            req.query = { ...req.query, id: pathname.split('/').pop() };
            return environmentsIdHandler(req, res);
        }
        if (pathname.startsWith('/api/folders/')) {
            req.query = { ...req.query, id: pathname.split('/').pop() };
            return foldersIdHandler(req, res);
        }

        // 404 Fallback
        res.status(404).json({ error: 'Route not found in consolidated API' });
    } catch (err: any) {
        console.error('Master Router Error:', err);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
}
