-- Trigram FTS cannot optimize one- or two-character searches (common for
-- Korean city names). Keep a compact 1/2-character gram index for those.
CREATE TABLE IF NOT EXISTS plan_search_grams (
  plan_id TEXT NOT NULL,
  gram TEXT NOT NULL,
  PRIMARY KEY (gram, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_search_grams_plan ON plan_search_grams(plan_id);

CREATE TRIGGER IF NOT EXISTS plan_search_grams_after_insert
AFTER INSERT ON plans
BEGIN
  INSERT OR IGNORE INTO plan_search_grams(plan_id, gram)
  WITH RECURSIVE source(value) AS (
    SELECT new.title UNION ALL SELECT new.destination
  ), chars(value, pos) AS (
    SELECT value, 1 FROM source
    UNION ALL
    SELECT value, pos + 1 FROM chars WHERE pos < length(value)
  )
  SELECT new.id, substr(value, pos, 1) FROM chars WHERE length(value) >= 1;

  INSERT OR IGNORE INTO plan_search_grams(plan_id, gram)
  WITH RECURSIVE source(value) AS (
    SELECT new.title UNION ALL SELECT new.destination
  ), chars(value, pos) AS (
    SELECT value, 1 FROM source
    UNION ALL
    SELECT value, pos + 1 FROM chars WHERE pos < length(value)
  )
  SELECT new.id, substr(value, pos, 2) FROM chars WHERE pos < length(value);
END;

CREATE TRIGGER IF NOT EXISTS plan_search_grams_after_update
AFTER UPDATE OF title, destination ON plans
BEGIN
  DELETE FROM plan_search_grams WHERE plan_id = old.id;

  INSERT OR IGNORE INTO plan_search_grams(plan_id, gram)
  WITH RECURSIVE source(value) AS (
    SELECT new.title UNION ALL SELECT new.destination
  ), chars(value, pos) AS (
    SELECT value, 1 FROM source
    UNION ALL
    SELECT value, pos + 1 FROM chars WHERE pos < length(value)
  )
  SELECT new.id, substr(value, pos, 1) FROM chars WHERE length(value) >= 1;

  INSERT OR IGNORE INTO plan_search_grams(plan_id, gram)
  WITH RECURSIVE source(value) AS (
    SELECT new.title UNION ALL SELECT new.destination
  ), chars(value, pos) AS (
    SELECT value, 1 FROM source
    UNION ALL
    SELECT value, pos + 1 FROM chars WHERE pos < length(value)
  )
  SELECT new.id, substr(value, pos, 2) FROM chars WHERE pos < length(value);
END;

CREATE TRIGGER IF NOT EXISTS plan_search_grams_after_delete
AFTER DELETE ON plans
BEGIN
  DELETE FROM plan_search_grams WHERE plan_id = old.id;
END;

PRAGMA optimize;
