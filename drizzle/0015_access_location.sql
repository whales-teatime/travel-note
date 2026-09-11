-- Store coarse location metadata supplied by Cloudflare when available.
-- Raw IP addresses remain intentionally absent.
ALTER TABLE access_logs ADD COLUMN city TEXT;
ALTER TABLE access_logs ADD COLUMN region TEXT;
