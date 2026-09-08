# Pearl & Bloom — CLAUDE.md

Caroline's handmade-jewelry shop. Live at https://pearlandbloom.us — a Cloudflare Worker (`src/`) that serves the static site from `public/` and a small API backed by D1 (orders + products) and R2 (uploaded photos). Deploys automatically from `main` on every push (Workers Builds, `npx wrangler deploy`).

## Two ways to change things
1. **Code / design** (this repo): edit on the `pearlbloom` VM in `/var/app/pearl-and-bloom` as user `harbourlab`, preview at https://pearlbloom.tailfb80ed.ts.net (tailnet only, served from this folder — save, then refresh), then `git push` = deploy (~1 min). Rollback = Cloudflare dashboard → Workers & Pages → pearlandbloom → Deployments.
2. **Products and orders** (no code, no git): the admin page at https://pearlbloom.tailfb80ed.ts.net/admin — tailnet only, never on the public web. Add/edit/remove products, drag-and-drop photos (resized to 1200 px automatically), reorder, mark sold out; move orders New → Paid → Shipped → Done (Paid and Shipped email the customer).

## Layout
- `public/` — `index.html`, `style.css`, `app.js`, `img/`. The product grid is empty in HTML; `app.js` fills it from `/api/products`.
- `src/index.js` — orders API (`POST/GET /api/order`), emails via Microsoft Graph as orders@pearlandbloom.us, the `SHIPPING` table (three options; the page only sends the key).
- `src/admin.js` — `/api/products` (public), `/photos/*` (R2), and `/api/admin/*` (needs the `ADMIN_TOKEN` secret; everything else gets 404).
- `admin/` — the Node app behind the admin page. Runs on the VM as systemd `pearlbloom-admin` on 127.0.0.1:8100, exposed by `tailscale serve --set-path /admin`. Token lives in `/etc/pearlbloom-admin.env` (never in git).
- `migrations/` — D1 schema history. `POST /api/admin/migrate` (the admin app can call it) creates anything missing and seeds products once.
- `wrangler.toml` — bindings: ASSETS, DB (D1 `pearl-and-bloom`), PHOTOS (R2 `pearl-and-bloom-photos`), plain vars. Secrets (`MS_CLIENT_SECRET`, `ADMIN_TOKEN`) are set in the Cloudflare dashboard only.

## Rules
- Kid's learning project. Keep code readable: no minification, no bundlers, no frameworks. Prefer showing Caroline one small change over rewriting a file.
- NEVER put Caroline's age, last name, school, or personal email anywhere in the site. The order email is the shop address only.
- Photos: JPEG, max 1200 px on the long side. Uploaded ones live in R2 as `photos/<name>-<id>.jpg`; the original 20 live in `public/img/`.
- Prices: $3 bracelets, $6 necklaces, $3.50 keychains unless told otherwise.
- Shipping options and prices live in `SHIPPING` in `src/index.js` (and the matching list in `app.js`).
- Payment is Venmo (`VENMO_HANDLE` in `wrangler.toml` + `app.js`, QR at `public/img/venmo-qr.png`); the customer puts the PB-##### number in the note. Stripe under Harbour Pointe Advisors is the planned upgrade.
- Commit messages in plain English describing the change ("Add Rainbow Candy keychain").
