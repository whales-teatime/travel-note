CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  people INTEGER NOT NULL DEFAULT 1,
  stops_json TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  edit_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_updated_at ON plans(updated_at);
CREATE INDEX IF NOT EXISTS idx_plans_title_destination ON plans(title, destination);
