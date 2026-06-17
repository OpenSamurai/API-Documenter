import { initDB, verifyUserRole, getAllFolders, getApisByFolders } from '../../src/db/proxyDb.js';

export default async function handler(req: any, res: any) {
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { user, token, projectId = 'default' } = req.query;
        if (!token) {
            return res.status(400).json({ error: 'Missing token' });
        }

        const db = await initDB();
        const userRow = await verifyUserRole(db, user, token, projectId);

        if (!userRow) {
            return res.status(403).json({ error: 'Unauthorized - invalid token' });
        }

        const allowedFoldersData = typeof userRow.allowed_folders === 'string'
            ? JSON.parse(userRow.allowed_folders)
            : userRow.allowed_folders;

        let allowedFolderNames: string[] = [];
        let folderRoles: Record<string, string> = {};

        if (userRow.allowed_folders === '*' || userRow.allowed_folders === '["*"]') {
            const allFolders = await getAllFolders(db, projectId);
            allowedFolderNames = allFolders.map(f => f.name);
            allFolders.forEach(f => folderRoles[f.name] = userRow.role);
        } else if (Array.isArray(allowedFoldersData)) {
            // Legacy array support
            allowedFolderNames = allowedFoldersData;
            allowedFoldersData.forEach(name => folderRoles[name] = userRow.role);
        } else {
            // New mapping support: {"FolderName": "role"}
            allowedFolderNames = Object.keys(allowedFoldersData);
            folderRoles = allowedFoldersData;
        }

        const apis = await getApisByFolders(db, projectId, allowedFolderNames);

        res.status(200).json({
            success: true,
            user: userRow.id,
            role: userRow.role,
            allowed_folders: allowedFolderNames,
            folder_roles: folderRoles,
            total_apis: apis.length,
            last_sync: new Date().toISOString(),
            apis: apis
        });

    } catch (error: any) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        // Note: Close DB if it was initialized. 
        // In a pool setup this is usually handled by the adapter closing.
        // For serverless we might need to be careful with persistent connections.
    }
}
