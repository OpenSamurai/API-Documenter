<div align="center">
  <img src="resources/icon.jpg" alt="API Documenter Logo" width="128" />

  # API Documenter
  ### The Professional Self-Hosted API Ecosystem

  **Postman Power + Enterprise Control + 100% Data Ownership.**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![Version](https://img.shields.io/badge/version-1.0.20-emerald.svg)](package.json)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
  [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)](#)
</div>

---

## 🌟 The Vision

**API Documenter** is more than just an API client; it is a complete **Documentation and Testing Ecosystem**. It was built for engineering teams that cannot compromise on data privacy or reliability. While existing tools force your sensitive API keys and internal endpoints onto their cloud, API Documenter keeps your data exactly where it belongs: **on your machine and in your private database.**

---

## 🚀 Master Feature Suite

### 1. 📂 Folder-Level RBAC (Enterprise Security)
The first self-hosted tool to offer granular, folder-level **Role Based Access Control**.
- **Admins**: Manage project connections, deployment settings, and global team permissions.
- **Editors**: Create and modify endpoints within specific folders they have access to.
- **Viewers**: Access real-time documentation and test endpoints without risk of modifying team data.
- **Team Isolation**: Different members can have different roles on different folders within the same project.

### 2. 📝 Advanced Documentation Engine
A dedicated workspace for crafting beautiful, production-ready API documentation.
- **Markdown-Native**: Write documentation using standard Markdown with real-time side-by-side preview.
- **Smart Components**: Insert **Smart Table of Contents**, **Page Breaks**, and dynamic code blocks.
- **Built-in PDF Compilation**: Export high-fidelity A4 documentation PDFs using a built-in Chromium engine (no external Chrome dependency required).
- **Distraction-Free Mode**: Collapse all sidebars and toolbars to focus purely on the content.

### 3. 🔄 Advanced Database Synchronization
Bypass the proprietary cloud and sync directly with your own infrastructure.
- **Native Support**: Direct integration with **MySQL** and **PostgreSQL**.
- **Vercel Proxy Bridge**: One-click deployment of a secure RBAC proxy. Your database credentials stay encrypted in Vercel environment variables—never stored on user machines.
- **Real-Time Connectivity**: Instantly syncs changes across team members while maintaining an offline-first cache for zero-latency editing.
- **Smart Error Recovery**: Robust handling for VPN/Firewall interruptions with detailed connection error reporting and one-click retry.

### 4. ⚡ High-Performance Request Engine
A testing suite built for speed and precision.
- **Complete Method Support**: GET, POST, PUT, DELETE, PATCH, and OPTIONS.
- **Variable Injection**: Multi-environment support with dynamic variable substitution in URLs, Headers, and Bodies.
- **Response Analytics**: Real-time benchmarks for execution time, payload size, and status codes.
- **Rich Body Support**: JSON (with syntax highlighting), Key-Value pairs, and raw text.

### 5. 🎨 Aesthetic & Ergonomic UI
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