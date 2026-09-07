CREATE INDEX IF NOT EXISTS idx_plans_active_updated ON plans(deleted_at, updated_at DESC, id DESC);
PRAGMA optimize;
