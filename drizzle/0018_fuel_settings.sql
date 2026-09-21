-- Store the domestic-trip fuel estimate inputs separately from place costs.
ALTER TABLE plans ADD COLUMN fuel_efficiency REAL NOT NULL DEFAULT 12;
ALTER TABLE plans ADD COLUMN fuel_price REAL NOT NULL DEFAULT 1700;
