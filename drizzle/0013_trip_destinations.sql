-- Store date-ranged destinations without changing the existing stops payload.
-- An empty array keeps older plans fully backward compatible.
ALTER TABLE plans ADD COLUMN destinations_json TEXT NOT NULL DEFAULT '[]';
