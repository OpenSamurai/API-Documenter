# API Documenter: Developer Guide

Welcome to the API Documenter source code! This guide explains the core architecture, the folder structure, and how the advanced features (like the Git integration and Sync Engine) work under the hood.

## 🏗️ Core Architecture

API Documenter is a local-first, hybrid-sync application built with the **Electron** framework. It consists of three distinct layers:

1. **Frontend (Renderer Process):** Built with React 18, Vite, Tailwind CSS, Zustand (state), and React Query. It stores data locally in IndexedDB (using Dexie.js) to guarantee offline availability and instant UI response.
2. **Desktop Core (Main Process):** Handles file system operations, local Git interactions, direct MySQL/PostgreSQL connections (Local Mode), and IPC bridging.
3. **Remote Proxy (Vercel):** A serverless Node.js application deployed to Vercel that handles Role-Based Access Control (RBAC) and team collaboration (Team Workspace Mode).

---

## 📂 Project Structure

Here is a breakdown of the codebase to help you navigate:

### `/src` (Electron App)
*   **`/src/main` (Main Process)**
    *   `index.ts`: The main entry point for the Electron app. Manages window lifecycle.
    *   **`/controllers/`**: Contains the logic that runs securely in Node.js.
        *   `SyncController.ts`: Handles direct connections to your remote MySQL/Postgres database and processes the `sync_queue` for Local Mode syncing.
        *   `GitController.ts`: Exposes Git operations to the frontend via IPC.
    *   `gitManager.ts`: A wrapper around `simple-git` that executes Git commands (commit, checkout, branch) on your local workspace.
    *   `fileWatcher.ts`: Monitors your local directory for changes to `.apidoc`, `.folder`, and `.json` schema files.
*   **`/src/preload`**
    *   `index.ts`: Context Bridge exposing safe IPC methods (like `window.electronAPI.sendHttpRequest` and `window.electronAPI.fetchSyncQueue`) to the React frontend.
*   **`/src/renderer` (React Frontend)**
    *   **`/src/components/`**: React components. The heart of the UI.
        *   `Sidebar.tsx`: Renders the folder tree, sync buttons, and Git status indicators.
        *   `ApiDocumentationPage.tsx`: The main Markdown editor, request builder, and response viewer.
    *   **`/src/hooks/`**: Data fetching and business logic.
        *   `useSync.ts`: The complex sync engine. Pulls items from the proxy/db, resolves conflicts, and manages push queues.
        *   `useGit.ts`: Connects UI actions to the underlying `GitManager`.
    *   **`/src/db/`**: Contains the `Dexie.js` configuration for Local IndexedDB storage.
    *   **`/src/stores/`**: Zustand state management (e.g., `appStore.ts` for tracking the active branch and team configurations).

### `/server` (Proxy Server)
This is the deployable Vercel serverless backend for Team Workspaces.
*   **`/server/src/db/`**: Adapters for MySQL and Postgres. Includes the `schema.sql` file used to initialize the databases.
*   **`/server/src/middleware/`**:
    *   `rbac.ts`: Enforces the Admin/Editor/Viewer roles at the folder and environment levels.
*   **`/server/routes/`**: API endpoints.
    *   `/sync.ts`: Handles the exact same queue-processing logic as `SyncController.ts` but enforces RBAC and user tokens.
    *   `/apis`, `/folders`, `/users`: Standard CRUD endpoints for the team workspace.

---

## 🌿 The Git Integration (Developer-Friendly Version Control)

API Documenter treats your API specifications as code. You can version control your API endpoints exactly like source code.

### How it works:
1. **Local Storage:** When you create an API or Folder, the app not only saves it to the local IndexedDB but also writes it as a physical file (e.g., `login.apidoc`, `auth.folder`) in your selected local workspace directory.
2. **File Watcher (`src/main/fileWatcher.ts`):** A `chokidar` file watcher monitors your local workspace. If you edit a `.apidoc` file externally in VS Code, or pull changes via Git CLI, the File Watcher instantly detects the change, parses the JSON, and updates the local IndexedDB.
3. **Git Manager (`src/main/gitManager.ts`):** The app uses `simple-git` to allow you to perform standard Git operations from within the API Documenter UI:
    *   **Branches:** Create new branches for experimental API designs without affecting the `master` documentation.
    *   **Commits:** Stage and commit your `.apidoc` files. The app intelligently maps the files you've modified and links them to the commit.
    *   **Discard:** Revert uncommitted changes, instantly restoring the previous state in both the filesystem and the UI.

### Why this is developer-friendly:
By syncing both to a Database AND tracking files via Git, you get the best of both worlds: Non-technical team members can view real-time API docs from the database, while developers can submit PRs to update API documentation right alongside their backend code.

---

## 🔄 The Sync Engine & Offline Queue

API Documenter is **offline-first**. 

When you lose internet connection, you can still read, edit, create, and delete APIs.
*   **The Sync Queue:** Every action you take is logged into a local IndexedDB table called `syncQueue` (storing the operation type: `create`, `update`, `delete`).
*   **Pushing:** When you click "Sync" (or the auto-sync triggers), `useSync.ts` gathers all pending operations and sends them to either `SyncController.ts` (Local DB mode) or `server/routes/sync.ts` (Proxy mode).
*   **Conflict Resolution:** If the remote database has a newer `version` of the API than your local machine, the server returns a `conflict`. The UI deduplicates these conflicts and presents a dialog asking you to either "Keep My Changes" or "Accept Remote".
*   **Auto-Resolution:** The sync engine is smart enough to auto-resolve identical duplicate operations or ignore ghost edits on APIs that have already been deleted.

---

## 🚀 Getting Started with Development

1. Run `npm install` in the root directory.
2. Run `npm run dev` to start the Electron + Vite process.
3. Use the Chrome DevTools (Ctrl+Shift+I) in the Electron window to debug the React frontend.
4. Main process logs will appear in your terminal.
