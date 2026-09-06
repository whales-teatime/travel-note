ALTER TABLE plans ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_plans_deleted_at ON plans(deleted_at);
