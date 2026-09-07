-- Products now live in the database so they can be managed from the admin page
-- (tailnet only) instead of by editing index.html.
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'bracelets', -- bracelets | necklaces | keychains | clay | earrings | paintings
  price       REAL NOT NULL,
  keywords    TEXT NOT NULL DEFAULT '',          -- extra words the search box matches
  description TEXT NOT NULL DEFAULT '',
  photo       TEXT NOT NULL DEFAULT '',          -- 'img/x.jpg' (in the repo) or 'photos/x.jpg' (uploaded, stored in R2)
  active      INTEGER NOT NULL DEFAULT 1,        -- 0 = hidden from the shop
  sold_out    INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS products_sort ON products (active, sort);

-- The products that were in index.html on 2026-09-07 (photos stay in public/img/).
INSERT INTO products (name, category, price, keywords, photo, sort)
SELECT * FROM (VALUES
  ('Peace & Petals Bracelet', 'bracelets', 3.0, 'neon pink & green peace bracelet', 'img/peace-petals-bracelet.jpg', 10),
  ('Pink Happy Day Bracelet', 'bracelets', 3.0, 'pink smiley bracelet', 'img/pink-happy-day-bracelet.jpg', 20),
  ('Blueberry Splash Bracelet', 'bracelets', 3.0, 'blue disc bracelet', 'img/blueberry-splash-bracelet.jpg', 30),
  ('Ocean Garden Bracelet', 'bracelets', 3.0, 'blue & green bead bracelet', 'img/ocean-garden-bracelet.jpg', 40),
  ('Purple Besties BFF Set', 'bracelets', 3.0, 'bff purple disc bracelets', 'img/purple-besties-bff-set.jpg', 50),
  ('Pink Promise BFF Set', 'bracelets', 3.0, 'bff pink bead bracelets', 'img/pink-promise-bff-set.jpg', 60),
  ('Bubblegum Skies Bracelet', 'bracelets', 3.0, 'pink blue smiley bracelet', 'img/bubblegum-skies-bracelet.jpg', 70),
  ('Pastel Sweetheart Bracelet', 'bracelets', 3.0, 'pastel heart bracelet', 'img/pastel-sweetheart-bracelet.jpg', 80),
  ('Yellow Pink Happy Day Bracelet', 'bracelets', 3.0, 'yellow pink smiley bracelet', 'img/yellow-pink-happy-day-bracelet.jpg', 90),
  ('Blue Skies Smiley Bracelet', 'bracelets', 3.0, 'blue smiley bracelet', 'img/blue-skies-smiley-bracelet.jpg', 100),
  ('Sugar Plum Necklace', 'necklaces', 6.0, 'purple pink necklace', 'img/sugar-plum-necklace.jpg', 110),
  ('Turquoise Tide Necklace', 'necklaces', 6.0, 'turquoise tide necklace blue teal beaded necklace', 'img/turquoise-tide-necklace.jpg', 120),
  ('Pastel Lagoon Necklace', 'necklaces', 6.0, 'pastel lagoon necklace', 'img/pastel-lagoon-necklace.jpg', 130),
  ('Mermaid Lagoon Keychain', 'keychains', 3.5, 'blue green keychain', 'img/mermaid-lagoon-keychain.jpg', 140),
  ('Happy Pastels Bracelet', 'bracelets', 3.0, 'pastel smiley bracelet', 'img/happy-pastels-bracelet.jpg', 150),
  ('Berry Crystal Necklace', 'necklaces', 6.0, 'berry crystal necklace', 'img/berry-crystal-necklace.jpg', 160),
  ('Rainbow Sorbet Necklace', 'necklaces', 6.0, 'rainbow sorbet necklace', 'img/rainbow-sorbet-necklace.jpg', 170),
  ('Rainbow Pop Keychain', 'keychains', 3.5, 'rainbow pop keychain', 'img/rainbow-pop-keychain.jpg', 180),
  ('Midnight Blue Keychain', 'keychains', 3.5, 'midnight blue keychain', 'img/midnight-blue-keychain.jpg', 190),
  ('Rainbow Candy Bracelet', 'bracelets', 3.0, 'rainbow candy bracelet', 'img/rainbow-candy-bracelet.jpg', 200))
WHERE NOT EXISTS (SELECT 1 FROM products);
