-- Orders placed on pearlandbloom.us
CREATE TABLE IF NOT EXISTS orders (
  number      TEXT PRIMARY KEY,           -- PB-12345
  created_at  TEXT NOT NULL,              -- ISO timestamp
  status      TEXT NOT NULL DEFAULT 'new',-- new | paid | shipped | done
  customer    TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  address     TEXT NOT NULL,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  zip         TEXT NOT NULL,
  notes       TEXT,
  items_json  TEXT NOT NULL,              -- [{"name":"...","price":3}]
  total       REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_email ON orders (email);
