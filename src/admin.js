// Pearl & Bloom — admin API + product/photo helpers.
//
// Everything under /api/admin/ needs the secret ADMIN_TOKEN (a Worker secret).
// Only the admin app on the pearlbloom VM knows it, and that app is only
// reachable inside the tailnet. Anyone else gets a plain 404.
//
// Public (no secret):
//   GET /api/products         products that are switched on, in shop order
//   GET /photos/<key>         a photo that was uploaded through the admin page (stored in R2)
//
// Admin (Bearer ADMIN_TOKEN):
//   POST   /api/admin/migrate            create tables / seed if missing (safe to repeat)
//   GET    /api/admin/products           all products, hidden ones too
//   POST   /api/admin/products           add one   {name, category, price, keywords, description, photo, sold_out, active}
//   PUT    /api/admin/products/:id       change one (send only the fields to change)
//   DELETE /api/admin/products/:id
//   POST   /api/admin/products/reorder   {ids:[...]} in the new order
//   PUT    /api/admin/photos/<key>       body = image bytes → saved in R2, returns {photo:"photos/<key>"}
//   DELETE /api/admin/photos/<key>
//   GET    /api/admin/orders?status=new  list orders (status optional)
//   PUT    /api/admin/orders/:number     {status, notify:true, shipped_at:"2026-09-08", tracking:"9400..."} → emails the customer when notify
//   DELETE /api/admin/orders/:number

import { json, sendStatusEmail } from "./index.js";

const CATEGORIES = ["bracelets", "necklaces", "keychains", "clay", "earrings", "paintings"];
const STATUSES = ["new", "paid", "shipped", "done"];

// ---------- public ----------

export async function listProducts(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, category, price, keywords, description, photo, photo2, sold_out, stock FROM products WHERE active = 1 ORDER BY sort, id"
  ).all();
  return json(results, 200, { "cache-control": "no-store" });
}

export async function servePhoto(key, env) {
  if (!env.PHOTOS) return new Response("Not found", { status: 404 });
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
      etag: obj.httpEtag,
    },
  });
}

// ---------- admin ----------

export async function adminRouter(request, env, url) {
  if (!isAuthorized(request, env)) return json({ error: "Not found" }, 404);

  const path = url.pathname.slice("/api/admin/".length).replace(/\/+$/, "");
  const parts = path.split("/");
  const m = request.method;

  try {
    if (path === "migrate" && m === "POST") return migrate(env);

    if (parts[0] === "products") {
      if (parts.length === 1 && m === "GET") return adminListProducts(env);
      if (parts.length === 1 && m === "POST") return createProduct(await request.json(), env);
      if (parts[1] === "reorder" && m === "POST") return reorderProducts(await request.json(), env);
      const id = Number(parts[1]);
      if (id && m === "PUT") return updateProduct(id, await request.json(), env);
      if (id && m === "DELETE") return deleteProduct(id, env);
    }

    if (parts[0] === "photos" && parts[1]) {
      const key = safeKey(parts.slice(1).join("/"));
      if (!key) return json({ error: "Bad photo name" }, 400);
      if (m === "PUT") return uploadPhoto(key, request, env);
      if (m === "DELETE") { await env.PHOTOS.delete(key); return json({ ok: true }); }
    }

    if (parts[0] === "orders") {
      if (parts.length === 1 && m === "GET") return listOrders(url, env);
      const number = (parts[1] || "").toUpperCase();
      if (number && m === "PUT") return updateOrder(number, await request.json(), env);
      if (number && m === "DELETE") return deleteOrder(number, env);
    }
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
  return json({ error: "Not found" }, 404);
}

function isAuthorized(request, env) {
  const want = env.ADMIN_TOKEN || "";
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!want || want.length < 20 || got.length !== want.length) return false;
  // compare every character so timing doesn't leak how much matched
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// Creates anything that's missing. Safe to run again and again.
async function migrate(env) {
  const done = [];
  const run = async (label, sql) => {
    try { await env.DB.prepare(sql).run(); done.push(label); } catch (e) { done.push(label + ": " + e.message); }
  };
  await run("orders", `CREATE TABLE IF NOT EXISTS orders (
    number TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
    customer TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, address TEXT NOT NULL, city TEXT NOT NULL,
    state TEXT NOT NULL, zip TEXT NOT NULL, notes TEXT, items_json TEXT NOT NULL, total REAL NOT NULL)`);
  await run("orders.shipping_method", "ALTER TABLE orders ADD COLUMN shipping_method TEXT NOT NULL DEFAULT ''");
  await run("orders.shipping_cost", "ALTER TABLE orders ADD COLUMN shipping_cost REAL NOT NULL DEFAULT 0");
  await run("products", `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'bracelets',
    price REAL NOT NULL, keywords TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sold_out INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await run("products_sort", "CREATE INDEX IF NOT EXISTS products_sort ON products (active, sort)");
  await run("products.stock", "ALTER TABLE products ADD COLUMN stock INTEGER"); // NULL = made to order
  await run("orders.shipped_at", "ALTER TABLE orders ADD COLUMN shipped_at TEXT");
  await run("orders.tracking", "ALTER TABLE orders ADD COLUMN tracking TEXT");
  await run("products.photo2", "ALTER TABLE products ADD COLUMN photo2 TEXT NOT NULL DEFAULT ''"); // optional second photo (small thumbnail)

  const count = (await env.DB.prepare("SELECT COUNT(*) AS n FROM products").first()).n;
  if (count === 0 && Array.isArray(SEED)) {
    const stmt = env.DB.prepare("INSERT INTO products (name, category, price, keywords, photo, sort) VALUES (?, ?, ?, ?, ?, ?)");
    await env.DB.batch(SEED.map((p, i) => stmt.bind(p.name, p.category, p.price, p.keywords, "img/" + p.photo, (i + 1) * 10)));
    done.push(`seeded ${SEED.length} products`);
  }
  return json({ ok: true, done, products: count });
}

// ---------- products ----------

async function adminListProducts(env) {
  const { results } = await env.DB.prepare("SELECT * FROM products ORDER BY sort, id").all();
  return json(results);
}

function cleanProduct(body, partial = false) {
  const s = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const out = {};
  if (!partial || body.name !== undefined) out.name = s(body.name);
  if (!partial || body.category !== undefined) out.category = CATEGORIES.includes(body.category) ? body.category : "bracelets";
  if (!partial || body.price !== undefined) out.price = Math.max(0, Math.round(Number(body.price) * 100) / 100 || 0);
  if (!partial || body.keywords !== undefined) out.keywords = s(body.keywords, 300).toLowerCase();
  if (!partial || body.description !== undefined) out.description = s(body.description, 1000);
  if (!partial || body.photo !== undefined) out.photo = s(body.photo, 300);
  if (!partial || body.photo2 !== undefined) out.photo2 = s(body.photo2, 300);
  if (!partial || body.active !== undefined) out.active = body.active === false || body.active === 0 ? 0 : 1;
  if (!partial || body.sold_out !== undefined) out.sold_out = body.sold_out === true || body.sold_out === 1 ? 1 : 0;
  if (!partial || body.sort !== undefined) out.sort = Number(body.sort) || 0;
  if (!partial || body.stock !== undefined) {
    // "" or null = made to order (no limit); otherwise a whole number >= 0
    out.stock = body.stock === null || body.stock === "" || body.stock === undefined ? null : Math.max(0, Math.floor(Number(body.stock)) || 0);
    if (out.stock === 0) out.sold_out = 1;                       // none left → sold out
    else if (out.stock !== null && body.sold_out === undefined) out.sold_out = 0; // restocked → back on sale
  }
  return out;
}

async function createProduct(body, env) {
  const p = cleanProduct(body);
  if (!p.name) return json({ error: "Every product needs a name." }, 400);
  if (!p.sort) {
    const last = await env.DB.prepare("SELECT MAX(sort) AS m FROM products").first();
    p.sort = (last?.m || 0) + 10;
  }
  const r = await env.DB.prepare(
    "INSERT INTO products (name, category, price, keywords, description, photo, photo2, active, sold_out, sort, stock) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(p.name, p.category, p.price, p.keywords, p.description, p.photo, p.photo2, p.active, p.sold_out, p.sort, p.stock).run();
  const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(r.meta.last_row_id).first();
  return json(row, 201);
}

async function updateProduct(id, body, env) {
  const p = cleanProduct(body, true);
  const keys = Object.keys(p);
  if (!keys.length) return json({ error: "Nothing to change." }, 400);
  if (p.name === "") return json({ error: "Every product needs a name." }, 400);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await env.DB.prepare(`UPDATE products SET ${sets} WHERE id = ?`).bind(...keys.map((k) => p[k]), id).run();
  const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  return row ? json(row) : json({ error: "No such product" }, 404);
}

async function deleteProduct(id, env) {
  const row = await env.DB.prepare("SELECT photo, photo2 FROM products WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "No such product" }, 404);
  await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  // Uploaded photos live in R2; photos in the repo (img/…) are left alone.
  for (const ph of [row.photo, row.photo2]) {
    if (ph && ph.startsWith("photos/") && env.PHOTOS) await env.PHOTOS.delete(ph.slice("photos/".length));
  }
  return json({ ok: true });
}

async function reorderProducts(body, env) {
  const ids = (body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) return json({ error: "ids required" }, 400);
  const stmt = env.DB.prepare("UPDATE products SET sort = ? WHERE id = ?");
  await env.DB.batch(ids.map((id, i) => stmt.bind((i + 1) * 10, id)));
  return json({ ok: true });
}

// ---------- photos ----------

function safeKey(key) {
  return /^[a-z0-9][a-z0-9._-]{0,120}\.(jpg|jpeg|png|webp)$/i.test(key) ? key : null;
}

async function uploadPhoto(key, request, env) {
  if (!env.PHOTOS) return json({ error: "Photo storage (R2) is not set up yet." }, 500);
  const type = request.headers.get("content-type") || "image/jpeg";
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 5 * 1024 * 1024) return json({ error: "Photo is too big (5 MB max)." }, 400);
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  return json({ ok: true, photo: "photos/" + key });
}

// ---------- orders ----------

async function listOrders(url, env) {
  const status = url.searchParams.get("status");
  const q = status && STATUSES.includes(status)
    ? env.DB.prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC").bind(status)
    : env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500");
  const { results } = await q.all();
  // Attach each item's product photo so the packing view shows a picture, not just a name.
  const photos = new Map((await env.DB.prepare("SELECT name, photo FROM products").all()).results.map((p) => [p.name, p.photo]));
  return json(results.map((o) => ({
    ...o,
    items: JSON.parse(o.items_json || "[]").map((it) => ({ ...it, photo: photos.get(it.name) || "" })),
    items_json: undefined,
  })));
}

async function updateOrder(number, body, env) {
  const status = String(body.status || "");
  if (!STATUSES.includes(status)) return json({ error: "Status must be one of " + STATUSES.join(", ") }, 400);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE number = ?").bind(number).first();
  if (!order) return json({ error: "No such order" }, 404);
  const shippedAt = body.shipped_at !== undefined ? String(body.shipped_at || "").slice(0, 20) : order.shipped_at;
  const tracking = body.tracking !== undefined ? String(body.tracking || "").replace(/\s+/g, "").slice(0, 40) : order.tracking;
  await env.DB.prepare("UPDATE orders SET status = ?, shipped_at = ?, tracking = ? WHERE number = ?").bind(status, shippedAt, tracking, number).run();
  let emailed = false;
  if (body.notify && (status === "paid" || status === "shipped")) {
    try { await sendStatusEmail(env, { ...order, shipped_at: shippedAt, tracking, items: JSON.parse(order.items_json || "[]") }, status); emailed = true; }
    catch (err) { console.log("status email failed", String(err)); }
  }
  return json({ ok: true, number, status, shipped_at: shippedAt, tracking, emailed });
}

async function deleteOrder(number, env) {
  const r = await env.DB.prepare("DELETE FROM orders WHERE number = ?").bind(number).run();
  return json({ ok: true, deleted: r.meta.changes });
}

// The products that were in index.html when this was built (2026-09-07).
// Used once, only if the products table is empty.
const SEED = [
  { name: "Peace & Petals Bracelet", category: "bracelets", price: 3, keywords: "neon pink & green peace bracelet", photo: "peace-petals-bracelet.jpg" },
  { name: "Pink Happy Day Bracelet", category: "bracelets", price: 3, keywords: "pink smiley bracelet", photo: "pink-happy-day-bracelet.jpg" },
  { name: "Blueberry Splash Bracelet", category: "bracelets", price: 3, keywords: "blue disc bracelet", photo: "blueberry-splash-bracelet.jpg" },
  { name: "Ocean Garden Bracelet", category: "bracelets", price: 3, keywords: "blue & green bead bracelet", photo: "ocean-garden-bracelet.jpg" },
  { name: "Purple Besties BFF Set", category: "bracelets", price: 3, keywords: "bff purple disc bracelets", photo: "purple-besties-bff-set.jpg" },
  { name: "Pink Promise BFF Set", category: "bracelets", price: 3, keywords: "bff pink bead bracelets", photo: "pink-promise-bff-set.jpg" },
  { name: "Bubblegum Skies Bracelet", category: "bracelets", price: 3, keywords: "pink blue smiley bracelet", photo: "bubblegum-skies-bracelet.jpg" },
  { name: "Pastel Sweetheart Bracelet", category: "bracelets", price: 3, keywords: "pastel heart bracelet", photo: "pastel-sweetheart-bracelet.jpg" },
  { name: "Yellow Pink Happy Day Bracelet", category: "bracelets", price: 3, keywords: "yellow pink smiley bracelet", photo: "yellow-pink-happy-day-bracelet.jpg" },
  { name: "Blue Skies Smiley Bracelet", category: "bracelets", price: 3, keywords: "blue smiley bracelet", photo: "blue-skies-smiley-bracelet.jpg" },
  { name: "Sugar Plum Necklace", category: "necklaces", price: 6, keywords: "purple pink necklace", photo: "sugar-plum-necklace.jpg" },
  { name: "Turquoise Tide Necklace", category: "necklaces", price: 6, keywords: "turquoise tide necklace blue teal beaded necklace", photo: "turquoise-tide-necklace.jpg" },
  { name: "Pastel Lagoon Necklace", category: "necklaces", price: 6, keywords: "pastel lagoon necklace", photo: "pastel-lagoon-necklace.jpg" },
  { name: "Mermaid Lagoon Keychain", category: "keychains", price: 3.5, keywords: "blue green keychain", photo: "mermaid-lagoon-keychain.jpg" },
  { name: "Happy Pastels Bracelet", category: "bracelets", price: 3, keywords: "pastel smiley bracelet", photo: "happy-pastels-bracelet.jpg" },
  { name: "Berry Crystal Necklace", category: "necklaces", price: 6, keywords: "berry crystal necklace", photo: "berry-crystal-necklace.jpg" },
  { name: "Rainbow Sorbet Necklace", category: "necklaces", price: 6, keywords: "rainbow sorbet necklace", photo: "rainbow-sorbet-necklace.jpg" },
  { name: "Rainbow Pop Keychain", category: "keychains", price: 3.5, keywords: "rainbow pop keychain", photo: "rainbow-pop-keychain.jpg" },
  { name: "Midnight Blue Keychain", category: "keychains", price: 3.5, keywords: "midnight blue keychain", photo: "midnight-blue-keychain.jpg" },
  { name: "Rainbow Candy Bracelet", category: "bracelets", price: 3, keywords: "rainbow candy bracelet", photo: "rainbow-candy-bracelet.jpg" },
];
