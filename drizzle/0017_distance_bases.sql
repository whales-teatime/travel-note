-- Persist the user-selected base stops used by distance comparison mode.
ALTER TABLE plans ADD COLUMN distance_base_ids_json TEXT NOT NULL DEFAULT '[]';
