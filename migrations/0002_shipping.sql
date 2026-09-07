-- Which shipping option the customer picked, and what it cost.
-- Orders placed before this existed keep an empty method and $0.
ALTER TABLE orders ADD COLUMN shipping_method TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN shipping_cost   REAL NOT NULL DEFAULT 0;
