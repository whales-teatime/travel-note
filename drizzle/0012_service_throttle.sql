-- Shared gates for external services whose policy limits apply to the whole
-- application rather than to an individual Worker isolate.
CREATE TABLE IF NOT EXISTS service_throttle (
  id TEXT PRIMARY KEY,
  next_allowed_ms INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO service_throttle (id, next_allowed_ms)
VALUES ('nominatim', 0);
