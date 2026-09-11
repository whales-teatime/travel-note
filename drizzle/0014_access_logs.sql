-- Lightweight page-visit log for the private admin dashboard.
-- Only document requests are recorded; raw IP addresses are never stored.
CREATE TABLE IF NOT EXISTS access_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  country TEXT,
  visitor_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_path ON access_logs(path, created_at DESC);
