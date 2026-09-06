var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var src_default = {
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
    return env.ASSETS.fetch(request);
  }
};
async function placeOrder(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (body.website) return json({ ok: true, number: "PB-00000" });
  const clean = /* @__PURE__ */ __name((v, max = 200) => String(v ?? "").trim().slice(0, max), "clean");
  const order = {
    customer: clean(body.customer),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone, 40),
    address: clean(body.address),
    city: clean(body.city, 80),
    state: clean(body.state, 40),
    zip: clean(body.zip, 20),
    notes: clean(body.notes, 1e3),
    items: Array.isArray(body.items) ? body.items.slice(0, 50) : []
  };
  if (!order.customer || !order.email.includes("@") || !order.address || !order.city || !order.state || !order.zip) {
    return json({ error: "Please fill in every shipping field." }, 400);
  }
  if (!order.items.length) return json({ error: "Your cart is empty." }, 400);
  const items = order.items.map((it) => ({
    name: clean(it.name, 200),
    price: Math.max(0, Math.round(Number(it.price) * 100) / 100 || 0)
  }));
  const total = Math.round(items.reduce((sum, it) => sum + it.price, 0) * 100) / 100;
  const number = await makeOrderNumber(env);
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare(
    `INSERT INTO orders (number, created_at, status, customer, email, phone, address, city, state, zip, notes, items_json, total)
     VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(number, createdAt, order.customer, order.email, order.phone, order.address, order.city, order.state, order.zip, order.notes, JSON.stringify(items), total).run();
  try {
    await sendOrderEmails(env, { number, createdAt, ...order, items, total });
  } catch (err) {
    console.log("email failed", String(err));
  }
  return json({ ok: true, number, total });
}
__name(placeOrder, "placeOrder");
async function makeOrderNumber(env) {
  for (let i = 0; i < 5; i++) {
    const number = "PB-" + String(Math.floor(1e4 + Math.random() * 9e4));
    const hit = await env.DB.prepare("SELECT 1 FROM orders WHERE number = ?").bind(number).first();
    if (!hit) return number;
  }
  return "PB-" + Date.now().toString().slice(-6);
}
__name(makeOrderNumber, "makeOrderNumber");
async function graphToken(env) {
  const res = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    })
  });
  if (!res.ok) throw new Error("token " + res.status + " " + await res.text());
  return (await res.json()).access_token;
}
__name(graphToken, "graphToken");
async function graphSend(env, token, { to, subject, text, replyTo }) {
  const from = env.SHOP_FROM || "orders@pearlandbloom.us";
  const message = {
    subject,
    body: { contentType: "Text", content: text },
    toRecipients: [{ emailAddress: { address: to } }]
  };
  if (replyTo) message.replyTo = [{ emailAddress: { address: replyTo } }];
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true })
  });
  if (!res.ok && res.status !== 202) throw new Error("sendMail " + res.status + " " + await res.text());
}
__name(graphSend, "graphSend");
async function sendOrderEmails(env, o) {
  const shopName = env.SHOP_NAME || "Pearl & Bloom";
  const shopTo = env.SHOP_FROM || "orders@pearlandbloom.us";
  const lines = o.items.map((it, i) => `${i + 1}. ${it.name} - $${it.price.toFixed(2)}`).join("\n");
  const shipTo = [o.customer, o.address, `${o.city}, ${o.state} ${o.zip}`, o.phone ? `Phone: ${o.phone}` : ""].filter(Boolean).join("\n");
  const token = await graphToken(env);
  await graphSend(env, token, {
    to: shopTo,
    replyTo: o.email,
    subject: `New order ${o.number} - $${o.total.toFixed(2)} from ${o.customer}`,
    text: [
      `New ${shopName} order ${o.number}`,
      ``,
      `Items:`,
      lines,
      ``,
      `Total: $${o.total.toFixed(2)}`,
      ``,
      `Ship to:`,
      shipTo,
      `Email: ${o.email}`,
      o.notes ? `
Notes: ${o.notes}` : ``,
      ``,
      `Placed: ${o.createdAt}`
    ].join("\n")
  });
  const venmo = env.VENMO_HANDLE ? `
To pay, send $${o.total.toFixed(2)} on Venmo to ${env.VENMO_HANDLE} and put ${o.number} in the note.
` : "";
  await graphSend(env, token, {
    to: o.email,
    subject: `${shopName} order ${o.number} received`,
    text: [
      `Hi ${o.customer.split(" ")[0]},`,
      ``,
      `Thank you for your ${shopName} order! Your order number is ${o.number}.`,
      ``,
      lines,
      ``,
      `Total: $${o.total.toFixed(2)}`,
      venmo,
      `We'll ship to:`,
      shipTo,
      ``,
      `You can check your order any time at https://pearlandbloom.us/#orders using this number and your email.`,
      ``,
      `Handmade with love,`,
      shopName
    ].join("\n")
  });
}
__name(sendOrderEmails, "sendOrderEmails");
async function findOrder(url, env) {
  const number = (url.searchParams.get("number") || "").trim().toUpperCase();
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  if (!number || !email) return json({ error: "Enter your order number and email." }, 400);
  const row = await env.DB.prepare(
    "SELECT number, created_at, status, items_json, total FROM orders WHERE number = ? AND email = ?"
  ).bind(number, email).first();
  if (!row) return json({ error: "We couldn't find that order. Check the number and email." }, 404);
  return json({
    number: row.number,
    placed: row.created_at,
    status: row.status,
    items: JSON.parse(row.items_json),
    total: row.total
  });
}
__name(findOrder, "findOrder");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");

// ../../../usr/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../usr/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ZdhCDk/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../usr/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ZdhCDk/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
