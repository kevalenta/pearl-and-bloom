// Pearl & Bloom — the tiny backend.
//
// Two jobs:
//   POST /api/order               take an order from the checkout form, save it, email the shop + customer
//   GET  /api/order?number&email  look an order up so "Track an order" works
//
// Everything else (the HTML, CSS, JS, photos) is served automatically from public/.
// Email goes out through Microsoft 365 (Graph API) as orders@pearlandbloom.us.

import { adminRouter, listProducts, servePhoto } from "./admin.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Products for the shop page (managed from the tailnet-only admin page).
    if (url.pathname === "/api/products" && request.method === "GET") {
      return listProducts(env);
    }
    // Photos uploaded through the admin page.
    if (url.pathname.startsWith("/photos/")) {
      return servePhoto(url.pathname.slice("/photos/".length), env);
    }
    // Admin API — needs the secret token; see src/admin.js.
    if (url.pathname.startsWith("/api/admin/")) {
      return adminRouter(request, env, url);
    }

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

// The three ways an order can get to the customer. The checkout page shows the
// same three, but these prices are the ones that count: the page only sends the
// key ("local" / "first" / "ground"), never a dollar amount.
const SHIPPING = {
  local: { label: "Free local delivery (Palmas Del Mar)", price: 0 },
  first: { label: "First Class Mail (not trackable)", price: 2 },
  ground: { label: "USPS Ground Advantage (trackable)", price: 7 },
};

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
    shipping: clean(body.shipping, 20),
    items: Array.isArray(body.items) ? body.items.slice(0, 50) : [],
  };

  if (!order.customer || !order.email.includes("@") || !order.address || !order.city || !order.state || !order.zip) {
    return json({ error: "Please fill in every shipping field." }, 400);
  }
  if (!SHIPPING[order.shipping]) return json({ error: "Please pick a shipping option." }, 400);
  if (!order.items.length) return json({ error: "Your cart is empty." }, 400);

  // Prices come from the page, but re-add them here so the email total is honest.
  const items = order.items.map((it) => ({
    name: clean(it.name, 200),
    price: Math.max(0, Math.round(Number(it.price) * 100) / 100 || 0),
  }));
  const shipping = SHIPPING[order.shipping];
  const subtotal = Math.round(items.reduce((sum, it) => sum + it.price, 0) * 100) / 100;
  const total = Math.round((subtotal + shipping.price) * 100) / 100;

  // Inventory: if a product has a stock count, don't sell more than that.
  const stockProblem = await checkStock(env, items);
  if (stockProblem) return json({ error: stockProblem, stock: true }, 409);

  const number = await makeOrderNumber(env);
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO orders (number, created_at, status, customer, email, phone, address, city, state, zip, notes, items_json, shipping_method, shipping_cost, total)
     VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(number, createdAt, order.customer, order.email, order.phone, order.address, order.city, order.state, order.zip, order.notes, JSON.stringify(items), shipping.label, shipping.price, total)
    .run();

  await takeStock(env, items);

  // Email the shop and the customer. If this fails the order is still saved, so don't fail the request.
  try {
    await sendOrderEmails(env, { number, createdAt, ...order, items, subtotal, shipping, total });
  } catch (err) {
    console.log("email failed", String(err));
  }

  return json({ ok: true, number, total });
}

// ---------- inventory ----------

// How many of each product name are in the cart.
function countItems(items) {
  const counts = new Map();
  for (const it of items) counts.set(it.name, (counts.get(it.name) || 0) + 1);
  return counts;
}

// Returns a friendly message if the cart asks for more than we have, else null.
// Products with stock = NULL are made to order (unlimited).
async function checkStock(env, items) {
  for (const [name, wanted] of countItems(items)) {
    const p = await env.DB.prepare("SELECT stock, sold_out FROM products WHERE name = ? AND active = 1").bind(name).first();
    if (!p) continue; // custom items aren't in the products table
    if (p.sold_out && (p.stock === null || p.stock <= 0)) return `Sorry, "${name}" just sold out. Please remove it from your cart.`;
    if (p.stock !== null && wanted > p.stock) {
      return p.stock === 0
        ? `Sorry, "${name}" just sold out. Please remove it from your cart.`
        : `Only ${p.stock} left of "${name}" - please change the amount in your cart.`;
    }
  }
  return null;
}

// Lower the stock counts for what was just ordered; anything that hits 0 becomes sold out.
async function takeStock(env, items) {
  const stmts = [];
  for (const [name, qty] of countItems(items)) {
    stmts.push(env.DB.prepare(
      "UPDATE products SET stock = MAX(stock - ?, 0), sold_out = CASE WHEN stock - ? <= 0 THEN 1 ELSE sold_out END WHERE name = ? AND stock IS NOT NULL"
    ).bind(qty, qty, name));
  }
  if (stmts.length) await env.DB.batch(stmts);
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

// ---------- email via Microsoft 365 (Graph) ----------

async function graphToken(env) {
  const res = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error("token " + res.status + " " + (await res.text()));
  return (await res.json()).access_token;
}

async function graphSend(env, token, { to, subject, text, replyTo }) {
  const from = env.SHOP_FROM || "orders@pearlandbloom.us";
  const message = {
    subject,
    body: { contentType: "Text", content: text },
    toRecipients: [{ emailAddress: { address: to } }],
  };
  if (replyTo) message.replyTo = [{ emailAddress: { address: replyTo } }];
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok && res.status !== 202) throw new Error("sendMail " + res.status + " " + (await res.text()));
}

async function sendOrderEmails(env, o) {
  const shopName = env.SHOP_NAME || "Pearl & Bloom";
  const shopTo = env.SHOP_FROM || "orders@pearlandbloom.us";
  const lines = o.items.map((it, i) => `${i + 1}. ${it.name} - $${it.price.toFixed(2)}`).join("\n");
  const shipTo = [o.customer, o.address, `${o.city}, ${o.state} ${o.zip}`, o.phone ? `Phone: ${o.phone}` : ""].filter(Boolean).join("\n");

  const token = await graphToken(env);

  // 1. Notification to the shop inbox (reply goes straight to the customer).
  await graphSend(env, token, {
    to: shopTo,
    replyTo: o.email,
    subject: `New order ${o.number} - $${o.total.toFixed(2)} from ${o.customer}`,
    text: [
      `New ${shopName} order ${o.number}`, ``,
      `Items:`, lines, ``,
      `Subtotal: $${o.subtotal.toFixed(2)}`,
      `Shipping: ${o.shipping.label} - $${o.shipping.price.toFixed(2)}`,
      `Total: $${o.total.toFixed(2)}`, ``,
      `Ship to:`, shipTo, `Email: ${o.email}`,
      o.notes ? `\nNotes: ${o.notes}` : ``, ``,
      `Placed: ${o.createdAt}`,
    ].join("\n"),
  });

  // 2. Confirmation to the customer.
  const venmo = env.VENMO_HANDLE ? `\nTo pay, send $${o.total.toFixed(2)} on Venmo to ${env.VENMO_HANDLE} and put ${o.number} in the note.\nTap to pay: https://venmo.com/${env.VENMO_HANDLE.replace("@", "")}?txn=pay&amount=${o.total.toFixed(2)}&note=${encodeURIComponent(o.number)}\n` : "";
  await graphSend(env, token, {
    to: o.email,
    subject: `${shopName} order ${o.number} received`,
    text: [
      `Hi ${o.customer.split(" ")[0]},`, ``,
      `Thank you for your ${shopName} order! Your order number is ${o.number}.`, ``,
      lines, ``,
      `Subtotal: $${o.subtotal.toFixed(2)}`,
      `Shipping: ${o.shipping.label} - $${o.shipping.price.toFixed(2)}`,
      `Total: $${o.total.toFixed(2)}`,
      venmo,
      o.shipping.price === 0 ? `We'll deliver to:` : `We'll ship to:`, shipTo, ``,
      `You can check your order any time at https://pearlandbloom.us/#orders using this number and your email.`, ``,
      `Handmade with love,`, shopName,
    ].join("\n"),
  });
}

// ---------- looking an order up ----------

async function findOrder(url, env) {
  const number = (url.searchParams.get("number") || "").trim().toUpperCase();
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  if (!number || !email) return json({ error: "Enter your order number and email." }, 400);

  const row = await env.DB.prepare(
    "SELECT number, created_at, status, items_json, shipping_method, shipping_cost, total FROM orders WHERE number = ? AND email = ?"
  )
    .bind(number, email)
    .first();

  if (!row) return json({ error: "We couldn't find that order. Check the number and email." }, 404);

  return json({
    number: row.number,
    placed: row.created_at,
    status: row.status,
    items: JSON.parse(row.items_json),
    shipping: row.shipping_method || "",
    shippingCost: row.shipping_cost || 0,
    total: row.total,
  });
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

// ---------- order status emails (sent from the admin page) ----------

export async function sendStatusEmail(env, o, status) {
  const shopName = env.SHOP_NAME || "Pearl & Bloom";
  const first = (o.customer || "").split(" ")[0] || "there";
  const items = (o.items || []).map((it, i) => `${i + 1}. ${it.name} - $${Number(it.price).toFixed(2)}`).join("\n");
  const token = await graphToken(env);
  if (status === "paid") {
    await graphSend(env, token, {
      to: o.email,
      subject: `${shopName} order ${o.number} - payment received`,
      text: [
        `Hi ${first},`, ``,
        `Thank you! We got your payment for order ${o.number}.`, ``,
        items, ``,
        `Total: $${Number(o.total).toFixed(2)}`, ``,
        o.shipping_cost === 0 && o.shipping_method ? `We'll deliver it soon (${o.shipping_method}).` : `We'll get it packed up and let you know when it ships.`, ``,
        `Handmade with love,`, shopName,
      ].join("\n"),
    });
  } else if (status === "shipped") {
    const local = o.shipping_cost === 0 && /local/i.test(o.shipping_method || "");
    const when = o.shipped_at ? ` on ${o.shipped_at}` : "";
    const tracking = o.tracking
      ? `Tracking number: ${o.tracking}\nTrack it: https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(o.tracking)}`
      : "";
    await graphSend(env, token, {
      to: o.email,
      subject: local ? `${shopName} order ${o.number} - delivered!` : `${shopName} order ${o.number} is on its way`,
      text: [
        `Hi ${first},`, ``,
        local ? `Your order ${o.number} was delivered${when}.` : `Good news - your order ${o.number} shipped${when}!`,
        o.shipping_method && !local ? `Shipping: ${o.shipping_method}` : ``,
        tracking, ``,
        items, ``,
        `You can check your order any time at https://pearlandbloom.us/#orders using this number and your email.`, ``,
        `Thank you for supporting a small handmade shop!`, ``,
        `Handmade with love,`, shopName,
      ].join("\n"),
    });
  }
}
