// Pearl & Bloom — the tiny backend.
//
// Two jobs:
//   POST /api/order            take an order from the checkout form, save it, email the shop
//   GET  /api/order?number&email  look an order up so "Track an order" works
//
// Everything else (the HTML, CSS, JS, photos) is served automatically from public/.

import { EmailMessage } from "cloudflare:email";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/order" && request.method === "POST") {
      return placeOrder(request, env);
    }
    if (url.pathname === "/api/order" && request.method === "GET") {
      return findOrder(url, env);
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, 404);
    }
    // Not an API call — hand it to the static site.
    return env.ASSETS.fetch(request);
  },
};

// ---------- placing an order ----------

async function placeOrder(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  // Simple spam trap: real people never fill the hidden "website" field.
  if (body.website) return json({ ok: true, number: "PB-00000" });

  const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
  const order = {
    customer: clean(body.customer),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone, 40),
    address: clean(body.address),
    city: clean(body.city, 80),
    state: clean(body.state, 40),
    zip: clean(body.zip, 20),
    notes: clean(body.notes, 1000),
    items: Array.isArray(body.items) ? body.items.slice(0, 50) : [],
  };

  if (!order.customer || !order.email.includes("@") || !order.address || !order.city || !order.state || !order.zip) {
    return json({ error: "Please fill in every shipping field." }, 400);
  }
  if (!order.items.length) return json({ error: "Your cart is empty." }, 400);

  // Prices come from the page, but re-add them here so the email total is honest.
  const items = order.items.map((it) => ({
    name: clean(it.name, 200),
    price: Math.max(0, Math.round(Number(it.price) * 100) / 100 || 0),
  }));
  const total = Math.round(items.reduce((sum, it) => sum + it.price, 0) * 100) / 100;

  const number = await makeOrderNumber(env);
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO orders (number, created_at, status, customer, email, phone, address, city, state, zip, notes, items_json, total)
     VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(number, createdAt, order.customer, order.email, order.phone, order.address, order.city, order.state, order.zip, order.notes, JSON.stringify(items), total)
    .run();

  // Email the shop. If this fails the order is still saved, so don't fail the request.
  try {
    await sendOrderEmail(env, { number, createdAt, ...order, items, total });
  } catch (err) {
    console.log("email failed", String(err));
  }

  return json({ ok: true, number, total });
}

// PB- + 5 digits, unique in the database.
async function makeOrderNumber(env) {
  for (let i = 0; i < 5; i++) {
    const number = "PB-" + String(Math.floor(10000 + Math.random() * 90000));
    const hit = await env.DB.prepare("SELECT 1 FROM orders WHERE number = ?").bind(number).first();
    if (!hit) return number;
  }
  return "PB-" + Date.now().toString().slice(-6);
}

async function sendOrderEmail(env, o) {
  const to = env.EMAIL_TO || "pearlandbloom.us@gmail.com";
  const from = env.SHOP_FROM || "orders@pearlandbloom.us";
  const lines = o.items.map((it, i) => `${i + 1}. ${it.name} — $${it.price.toFixed(2)}`).join("\n");
  const text = [
    `New ${env.SHOP_NAME || "Pearl & Bloom"} order ${o.number}`,
    ``,
    `Items:`,
    lines,
    ``,
    `Total: $${o.total.toFixed(2)}`,
    ``,
    `Ship to:`,
    o.customer,
    o.address,
    `${o.city}, ${o.state} ${o.zip}`,
    o.phone ? `Phone: ${o.phone}` : ``,
    `Email: ${o.email}`,
    o.notes ? `\nNotes: ${o.notes}` : ``,
    ``,
    `Placed: ${o.createdAt}`,
  ].join("\n");

  const raw = [
    `From: ${env.SHOP_NAME || "Pearl & Bloom"} <${from}>`,
    `To: ${to}`,
    `Reply-To: ${o.email}`,
    `Subject: New order ${o.number} - $${o.total.toFixed(2)} from ${o.customer}`,
    `Message-ID: <${crypto.randomUUID()}@pearlandbloom.us>`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    text,
  ].join("\r\n");

  await env.EMAIL.send(new EmailMessage(from, to, raw));
}

// ---------- looking an order up ----------

async function findOrder(url, env) {
  const number = (url.searchParams.get("number") || "").trim().toUpperCase();
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  if (!number || !email) return json({ error: "Enter your order number and email." }, 400);

  const row = await env.DB.prepare(
    "SELECT number, created_at, status, items_json, total FROM orders WHERE number = ? AND email = ?"
  )
    .bind(number, email)
    .first();

  if (!row) return json({ error: "We couldn't find that order. Check the number and email." }, 404);

  return json({
    number: row.number,
    placed: row.created_at,
    status: row.status,
    items: JSON.parse(row.items_json),
    total: row.total,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
