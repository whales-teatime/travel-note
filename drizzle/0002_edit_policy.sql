ALTER TABLE plans ADD COLUMN edit_policy TEXT NOT NULL DEFAULT 'owner';

CREATE INDEX IF NOT EXISTS idx_plans_edit_policy ON plans(edit_policy);
