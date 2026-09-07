// Pearl & Bloom admin — runs on the pearlbloom VM, reachable only inside the tailnet
// (Tailscale Serve → https://pearlbloom.tailfb80ed.ts.net/admin).
//
// It is a thin shell around the Worker's /api/admin API:
//   - the browser talks to this app (no secrets in the browser)
//   - this app adds the ADMIN_TOKEN and forwards to the live site
//   - photo uploads are resized here (max 1200 px, JPEG) before going to R2
//
// Config comes from /etc/pearlbloom-admin.env:  ADMIN_TOKEN=...  WORKER_URL=https://pearlandbloom.us

import express from "express";
import multer from "multer";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8100);
const WORKER_URL = (process.env.WORKER_URL || "https://pearlandbloom.us").replace(/\/$/, "");
const TOKEN = process.env.ADMIN_TOKEN || "";
if (TOKEN.length < 20) {
  console.error("ADMIN_TOKEN missing — put it in /etc/pearlbloom-admin.env");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Serve the UI at / and at /admin/ (Tailscale Serve may or may not strip the prefix).
const ui = express.Router();
ui.get("/", (req, res) => {
  if (!req.originalUrl.endsWith("/") && !req.originalUrl.includes("?")) return res.redirect(req.originalUrl + "/");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
ui.use(express.static(path.join(__dirname, "public")));

// Who is this? Tailscale Serve adds these headers for tailnet visitors.
ui.get("/api/whoami", (req, res) => {
  res.json({
    login: req.get("Tailscale-User-Login") || "",
    name: req.get("Tailscale-User-Name") || "",
    site: WORKER_URL,
  });
});

// Photo upload: resize → JPEG → PUT to the Worker → returns {photo:"photos/<key>"}
ui.post("/api/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No photo received." });
    const base = slug(req.body.name || path.parse(req.file.originalname).name || "photo");
    const key = `${base}-${Date.now().toString(36)}.jpg`;
    const jpeg = await sharp(req.file.buffer)
      .rotate() // honour phone orientation
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    const r = await fetch(`${WORKER_URL}/api/admin/photos/${key}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "image/jpeg" },
      body: jpeg,
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Everything else under /api/* is forwarded to the Worker's /api/admin/*
ui.all(/^\/api\/(.*)/, async (req, res) => {
  try {
    const target = `${WORKER_URL}/api/admin/${req.params[0]}${req.originalUrl.includes("?") ? "?" + req.originalUrl.split("?")[1] : ""}`;
    const init = { method: req.method, headers: { authorization: `Bearer ${TOKEN}` } };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(req.body || {});
    }
    const r = await fetch(target, init);
    res.status(r.status).type("application/json").send(await r.text());
  } catch (err) {
    res.status(502).json({ error: "Could not reach the site: " + String(err.message || err) });
  }
});

app.use("/admin", ui);
app.use("/", ui);

app.listen(PORT, "127.0.0.1", () => console.log(`Pearl & Bloom admin on http://127.0.0.1:${PORT} → ${WORKER_URL}`));

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "photo";
}
