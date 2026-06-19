<div align="center">
  <img src="resources/icon.jpg" alt="API Documenter Logo" width="128" />

  # API Documenter
  ### The Professional Self-Hosted API Ecosystem

  **Postman Power + Enterprise Control + 100% Data Ownership.**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Version](https://img.shields.io/badge/version-1.0.25-emerald.svg)](package.json)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
  [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)
</div>

---

## 🌟 The Vision

**API Documenter** is more than just an API client; it is a complete **Documentation, Testing, and Collaboration Ecosystem**. It was built for engineering teams that cannot compromise on data privacy or reliability. While existing tools force your sensitive API keys and internal endpoints onto their cloud, API Documenter keeps your data exactly where it belongs: **on your machine, in your Git repository, and in your private database.**

---

## 🤝 The Developer-Friendly Philosophy (Inspired by Bruno)

Why do developers love tools like Bruno? Because **transparency matters**. 

In API Documenter, there are **no opaque cloud synchronization engines** holding your data hostage. Everything you create is stored locally as plain text (`.apidoc`, `.folder`, `.json`) in a transparent, easily readable folder structure. 

- **Pure Git Control:** Because your APIs are just files in a folder, you can use your standard Git workflows. Branch, commit, review, and merge your API specs right alongside your backend code.
- **No Forced Cloud Backend:** We don't force you onto a proprietary cloud. You own your data.
- **Direct File Editing:** You can open your API workspace in VS Code, modify a `.apidoc` file by hand, and the API Documenter UI instantly reflects the change.

**The API Documenter Advantage:** We take this developer-friendly, transparent, local-first philosophy and superpower it for Enterprise Teams by adding **Folder-Level RBAC** and **Hybrid Database Sync**. You get the transparency of local files *plus* the collaboration power of a team workspace.

---

## 🚀 Master Feature Suite

### 1. 📂 Folder-Level RBAC (Enterprise Security)
The first self-hosted tool to offer granular, folder-level **Role Based Access Control** via a secure Proxy Server.
- **Admins**: Full access. Manage project connections, global variables, and assign team permissions.
- **Editors**: Can read, write, and modify endpoints within specific folders they are assigned to, but cannot delete destructive entities.
- **Viewers**: Read-only access to view documentation and test endpoints without the risk of modifying team data.
- **Team Isolation**: Complete isolation between projects and selective folder visibility.

### 2. 📝 Advanced Documentation Engine
A dedicated workspace for crafting beautiful, production-ready API documentation.
- **Markdown-Native**: Write documentation using standard Markdown with real-time side-by-side preview.
- **Smart Components**: Insert **Smart Table of Contents**, **Page Breaks**, and dynamic code blocks.
- **Built-in PDF Compilation**: Export high-fidelity A4 documentation PDFs using a built-in Chromium engine (no external Chrome dependency required).

### 3. 🔄 Advanced Database Synchronization & Offline Mode
Bypass the proprietary cloud and sync directly with your own infrastructure.
- **Native Support**: Direct integration with **MySQL** and **PostgreSQL**.
- **Offline-First Queue**: Make changes offline. The app automatically queues creations, modifications, and deletions into a robust `sync_queue`.
- **Smart Conflict Resolution**: When coming back online, the app seamlessly deduplicates events, auto-resolves identical deletions, and gracefully handles `update-update` and `delete-update` conflicts with a beautiful UI.
- **Vercel Proxy Bridge**: One-click deployment of a secure RBAC proxy. Your database credentials stay encrypted in Vercel environment variables—never stored on user machines.

### 4. 🌿 Git Integration (Version Control)
True version control for your API documentation.
- **Local File Watcher**: Seamlessly tracks changes across `.apidoc`, `.folder`, and `.json` schema files.
- **Branch Management**: Create, switch, and sync branches directly from the application.
- **Commit & Discard**: Commit your API states locally or discard un-staged changes with ease.

### 5. ⚡ High-Performance Request Engine
A testing suite built for speed and precision.
- **Complete Method Support**: GET, POST, PUT, DELETE, PATCH, and OPTIONS.
- **Variable Injection**: Multi-environment support with dynamic variable substitution in URLs, Headers, and Bodies. Manage **Global** vs. **Folder-level** environment scopes.
- **Response Analytics**: Real-time benchmarks for execution time, payload size, and status codes.
- **Rich Body Support**: JSON (with syntax highlighting), Key-Value pairs, FormData, and raw text.

### 6. 🎨 Aesthetic & Ergonomic UI
Designed for developers who spend 8+ hours a day in their tools.
- **Premium Monochrome Design**: A sleek, glassmorphic dark-mode interface that reduces eye strain.
- **Dynamic Font Scaling**: Global font scaling (10px to 20px) ensures accessibility and comfort on any display density.
- **Zero-Flicker Performance**: Optimized React components and IndexedDB caching for a snappy, native feel.

---

## 🛠️ Technical Architecture

API Documenter is engineered with a **Security-First** mindset:

- **Frontend**: React 18 & TypeScript for type-safe UI logic.
- **Desktop Layer**: Electron with a hardened IPC bridge.
- **Local Persistence**: **Dexie.js (IndexedDB)** for ultra-fast, offline-first data storage.
- **Remote Bridge**: A serverless **Node.js Proxy** (deployed to Vercel) that handles DB pooling and RBAC authorization without exposing internal ports.
- **State Engine**: **Zustand** for lightweight UI state and **React Query** for robust server-state synchronization.

> 💡 **For a deep dive into the folder structure, Git integration, and Sync Queue engine, please read our comprehensive [Developer Guide](DEVELOPER.md).**

---

## 📦 Installation & Setup

### For Developers

1. **Clone the repository:**
   ```bash
   git clone https://github.com/PraneethKulukuri26/API-Documenter.git
   cd API-Documenter
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start Development:**
   ```bash
   npm run dev
   ```

4. **Package for Distribution:**
   ```bash
   npm run build:win # Windows
   npm run build:mac # macOS
   ```

---

## 🛡️ Privacy Commitment

**Your data is yours.** API Documenter does not track your requests, store your passwords, or upload your documentation to external servers. All team collaboration happens through **your** database and **your** Vercel account.

---

<div align="center">
  Built for the community by <a href="https://github.com/PraneethKulukuri26">Praneeth Kulukuri</a>
</div>