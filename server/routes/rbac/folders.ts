import { initDB, verifyUserRole, getAllFolders } from '../../src/db/proxyDb.js';

export default async function handler(req: any, res: any) {
    try {
        const { user, token, projectId = 'default' } = req.query;
        if (!token) {
            return res.status(400).json({ error: 'Missing token' });
        }

        const db = await initDB();
        const userRow = await verifyUserRole(db, user, token, projectId);

        if (!userRow) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const allowedFoldersData = typeof userRow.allowed_folders === 'string'
            ? JSON.parse(userRow.allowed_folders)
            : userRow.allowed_folders;

        const isGlobal = userRow.allowed_folders === '*' ||
            userRow.allowed_folders === '["*"]' ||
            (Array.isArray(allowedFoldersData) && allowedFoldersData.includes('*'));

        let folders;
        let roles: Record<string, string> = {};

        if (isGlobal) {
            folders = await getAllFolders(db, projectId);
            folders.forEach(f => roles[f.name] = userRow.role);
        } else if (Array.isArray(allowedFoldersData)) {
            const allAvailableFolders = await getAllFolders(db, projectId);
            const allowedNames = new Set(allowedFoldersData);
            folders = allAvailableFolders.filter(f => allowedNames.has(f.name));
            folders.forEach(f => roles[f.name] = userRow.role);
        } else if (allowedFoldersData && typeof allowedFoldersData === 'object') {
            // New mapping support: {"FolderName": "role"}
            const allAvailableFolders = await getAllFolders(db, projectId);
            const allowedNames = new Set(Object.keys(allowedFoldersData));
            folders = allAvailableFolders.filter(f => allowedNames.has(f.name));
            folders.forEach(f => roles[f.name] = allowedFoldersData[f.name]);
        } else {
            folders = [];
        }

        res.json({
            success: true,
            folders: folders,
            roles: roles
        });
    } catch (error: any) {
        console.error('Folders proxy error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}
