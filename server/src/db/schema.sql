-- 1. PROJECTS (One per team)
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  database_url VARCHAR(500),  -- Admin only
  proxy_url VARCHAR(500),     -- Team sharing
  last_deployed_at TIMESTAMP NULL,
  version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. FOLDERS (RBAC assigned here)
CREATE TABLE IF NOT EXISTS folders (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  last_sync TIMESTAMP NULL,
  sync_status VARCHAR(20) DEFAULT 'synced',
  version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. API COLLECTIONS (Inside folders)
CREATE TABLE IF NOT EXISTS api_collections (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50),
  folder_id VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  url_params TEXT, -- JSON
  headers TEXT,    -- JSON
  body_type VARCHAR(20) DEFAULT 'none',
  raw_type VARCHAR(20) DEFAULT 'json',
  form_data TEXT,     -- JSON
  urlencoded TEXT,    -- JSON
  request_body TEXT, -- JSON
  response_examples TEXT, -- JSON
  version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  last_sync TIMESTAMP NULL,
  sync_status VARCHAR(20) DEFAULT 'synced',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. RBAC USERS (Folder permissions)
CREATE TABLE IF NOT EXISTS rbac_users (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(100),
  token VARCHAR(100) UNIQUE NOT NULL,
  allowed_folders TEXT NOT NULL, -- JSON ["Auth"] or ["*"]
  project_id VARCHAR(50),
  role VARCHAR(20) DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. ENVIRONMENTS (Variables and Base URLs)
CREATE TABLE IF NOT EXISTS environments (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50),
  folder_id VARCHAR(50), -- Null for project-wide envs
  name VARCHAR(100) NOT NULL,
  base_url TEXT,
  is_global BOOLEAN DEFAULT FALSE,
  variables TEXT, -- JSON key-value pairs
  version INT DEFAULT 1,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 6. SYNC QUEUE (Offline changes)
CREATE TABLE IF NOT EXISTS sync_queue (
  id VARCHAR(50) PRIMARY KEY,
  local_id VARCHAR(50),
  table_name VARCHAR(50),
  operation VARCHAR(20),
  data TEXT NOT NULL, -- JSON
  status VARCHAR(20) DEFAULT 'pending',
  retries INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update RBAC Users with environment permissions
ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS allowed_environments TEXT; -- JSON ["Alpha", "Beta"] or ["*"]

