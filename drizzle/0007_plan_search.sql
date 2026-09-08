-- Keep public plan-list search independent from the large stops_json column.
-- The trigram tokenizer supports fast arbitrary substring matching for terms
-- containing at least three consecutive Unicode characters.
CREATE VIRTUAL TABLE IF NOT EXISTS plan_search USING fts5(
  plan_id UNINDEXED,
  title,
  destination,
  tokenize = 'trigram'
);

CREATE TRIGGER IF NOT EXISTS plan_search_after_insert
AFTER INSERT ON plans
BEGIN
  INSERT INTO plan_search(rowid, plan_id, title, destination)
  VALUES (new.rowid, new.id, new.title, new.destination);
END;

CREATE TRIGGER IF NOT EXISTS plan_search_after_update
AFTER UPDATE OF title, destination ON plans
BEGIN
  DELETE FROM plan_search WHERE rowid = old.rowid;
  INSERT INTO plan_search(rowid, plan_id, title, destination)
  VALUES (new.rowid, new.id, new.title, new.destination);
END;

CREATE TRIGGER IF NOT EXISTS plan_search_after_delete
AFTER DELETE ON plans
BEGIN
  DELETE FROM plan_search WHERE rowid = old.rowid;
END;

PRAGMA optimize;
