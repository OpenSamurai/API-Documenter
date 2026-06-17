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
            const results = await db.query(
                'SELECT * FROM environments WHERE project_id = ? AND branch = ? AND (is_deleted = 0 OR is_deleted = false OR is_deleted IS NULL)',
                [user.projectId, activeBranch]
            );

            // Ensure a Global environment exists at the database level if not present
            let foundGlobal = results.find((e: any) => Number(e.is_global) === 1);
            if (!foundGlobal) {
                const globalId = `global-${user.projectId}`;
                try {
                    await db.execute(
                        'INSERT INTO environments (id, project_id, branch, name, is_global, variables) VALUES (?, ?, ?, ?, ?, ?)',
                        [globalId, user.projectId, activeBranch, 'Global', 1, '{}']
                    );
                    // Add it to the results list manually so the current response is complete
                    results.push({
                        id: globalId,
                        project_id: user.projectId,
                        branch: activeBranch,
                        name: 'Global',
                        is_global: 1,
                        variables: '{}',
                        created_at: Date.now()
                    });
                } catch (e) {
                    // Might already exist but wasn't in original SELECT results (race condition or ID format)
                    // We'll re-fetch just to be safe if insert fails
                    const refetch = await db.query('SELECT * FROM environments WHERE id = ? AND branch = ?', [globalId, activeBranch]);
                    if (refetch.length > 0) results.push(refetch[0]);
                }
            }

            // Map to frontend camelCase
            const mapped = results.map((env: any) => ({
                id: env.id,
                projectId: env.project_id,
                folderId: env.folder_id,
                name: env.name,
                baseUrl: env.base_url,
                isGlobal: Number(env.is_global) === 1,
                variables: env.variables,
                createdAt: env.created_at
            }));

            // Deduplicate by ID just in case
            const unique = Array.from(new Map(mapped.map(item => [item.id, item])).values());

            // RBAC Filter and Role Injection
            const filtered = unique.filter((env: any) => {
                if (user.role === 'admin') return true;
                if (env.isGlobal) return true;
                const allowedEnvs = user.allowedEnvironments || [];
                return allowedEnvs.some((p: any) => {
                    const idOrName = typeof p === 'string' ? p : p.envId;
                    return idOrName === '*' || idOrName === env.id || idOrName === env.name;
                });
            }).map((env: any) => {
                let effectiveRole = user.role;
                if (user.role !== 'admin') {
                    const allowedEnvs = user.allowedEnvironments || [];
                    const perm = allowedEnvs.find((p: any) => {
                        const idOrName = typeof p === 'string' ? p : p.envId;
                        return idOrName === env.id || idOrName === env.name || (env.isGlobal && (idOrName === 'global' || idOrName === 'Global'));
                    });
                    if (perm && typeof perm === 'object' && perm.role) {
                        effectiveRole = perm.role;
                    }
                }
                return { ...env, role: effectiveRole };
            });

            return res.status(200).json(filtered);
        }

        if (req.method === 'POST') {
            if (user.role === 'viewer') return res.status(403).json({ error: 'Viewer role cannot manage environments' });

            const { id, name, baseUrl, isGlobal, folderId, variables } = req.body;
            if (!id || !name) return res.status(400).json({ error: 'ID and Name are required' });

            await db.execute(
                'INSERT INTO environments (id, project_id, folder_id, branch, name, base_url, is_global, variables) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, user.projectId, folderId || null, activeBranch, name, baseUrl || '', isGlobal ? 1 : 0, variables || '{}']
            );

            await db.execute(
                `INSERT INTO sync_queue (id, project_id, local_id, branch, table_name, operation, data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), user.projectId, id, activeBranch, 'environments', 'create', JSON.stringify(req.body), 'pending']
            );

            return res.status(201).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
}
