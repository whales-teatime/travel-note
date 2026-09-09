-- Persist overseas place lookups so repeated searches do not spend provider
-- credits and popular destinations stay fast across Worker restarts.
CREATE TABLE IF NOT EXISTS place_lookup_cache (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  language TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_place_lookup_cache_expires
ON place_lookup_cache(expires_at);

PRAGMA optimize;
