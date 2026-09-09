ALTER TABLE plans ADD COLUMN map_provider TEXT NOT NULL DEFAULT 'naver';

CREATE INDEX IF NOT EXISTS idx_plans_map_provider ON plans(map_provider);
