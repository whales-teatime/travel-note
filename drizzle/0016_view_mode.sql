-- Keep the planner's visualisation choice with the plan.
-- Older plans default to the original route-order view.
ALTER TABLE plans ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'route';

CREATE INDEX IF NOT EXISTS idx_plans_view_mode ON plans(view_mode);
