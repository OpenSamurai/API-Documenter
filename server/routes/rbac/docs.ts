import { initDB, verifyUserRole, getFolderById, getApisByFolder } from '../../src/db/proxyDb.js';

export default async function handler(req: any, res: any) {
  const { user, token, folderId, projectId = 'default' } = req.query;

  try {
    if (!token || !folderId) {
      return res.status(400).json({ error: 'Missing token or folderId' });
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

    const folder = await getFolderById(db, folderId, projectId);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    let isAllowed = false;
    let folderRole = userRow.role;

    if (isGlobal) {
      isAllowed = true;
    } else if (Array.isArray(allowedFoldersData)) {
      isAllowed = allowedFoldersData.includes(folder.name);
    } else if (allowedFoldersData && typeof allowedFoldersData === 'object') {
      if (allowedFoldersData[folder.name]) {
        isAllowed = true;
        folderRole = allowedFoldersData[folder.name];
      }
    }

    if (!isAllowed) {
      return res.status(403).json({ error: 'No access to this folder' });
    }

    const apis = await getApisByFolder(db, folderId, projectId);
    const html = generateDocsHTML(folder, apis);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${folder.name}-docs.html"`);
    res.status(200).send(html);

  } catch (error: any) {
    console.error('Docs generation error:', error);
    res.status(500).json({ error: 'Document generation failed: ' + error.message });
  }
}

function generateDocsHTML(folder: any, apis: any[]) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${folder.name} - API Documentation</title>
  <link href="https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism.css" rel="stylesheet">
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #fafafa; color: #333; }
    header { border-bottom: 2px solid #eee; padding-bottom: 1rem; margin-bottom: 2rem; }
    h1 { margin: 0; color: #000; }
    section { margin: 2rem 0; background: white; border: 1px solid #eee; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .method { background: #007acc; color: white; padding: 0.2rem 0.5rem; border-radius: 3px; font-weight: bold; font-family: monospace; }
    code { font-family: monospace; background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>${folder.name}</h1>
    <p><em>${folder.description || 'No description provided.'}</em></p>
  </header>
  
  ${apis.map(api => `
    <section>
      <h2>${api.name}</h2>
      <p>${api.description || ''}</p>
      <div style="background:#f5f5f5;padding:1rem;border-radius:4px; margin-bottom: 1rem;">
        <span class="method">${api.method}</span>
        <code>${api.path}</code>
      </div>
      ${api.headers ? `<h3>Headers</h3><pre><code>${JSON.stringify(JSON.parse(api.headers || '[]'), null, 2)}</code></pre>` : ''}
    </section>
  `).join('')}
</body>
</html>`;
}
