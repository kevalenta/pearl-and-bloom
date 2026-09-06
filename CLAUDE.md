# Pearl & Bloom — CLAUDE.md

Caroline's handmade-jewelry shop. Live at https://pearlandbloom.us (Cloudflare Pages, deploys from `main` on every push).

## How this repo works
- Plain HTML/CSS/JS, no framework, no build step: `index.html` + `style.css` + `app.js` + `img/`.
- Working copy on the `pearlbloom` VM: `/var/app/pearl-and-bloom` (user `harbourlab`). Preview of the working copy: https://pearlbloom.tailfb80ed.ts.net (tailnet only; served straight from this folder — save, then refresh).
- `git push` = deploy. Cloudflare Pages rebuilds in ~30 s. Rollback = Cloudflare dashboard → Workers & Pages → pearl-and-bloom → Deployments → pick previous → Rollback.

## Rules
- Kid's learning project. Keep code readable: no minification, no bundlers, no frameworks. Prefer showing Caroline one small change over rewriting a file.
- NEVER put Caroline's age, last name, school, or personal email anywhere in the site. The order email is the shop address only.
- Product photos: JPEG, max 1200 px on the long side, saved in `img/`, named like `sugar-plum-necklace.jpg`.
- Prices: $3 bracelets, $6 necklaces, $3.50 keychains unless told otherwise. Shipping is a flat $3 (details in Cowork `Pearl and Bloom/SHIPPING.md`).
- Orders go through FormSubmit to the shop inbox; payment is a Venmo QR shown after checkout.
- Commit messages in plain English describing the change ("Add Rainbow Candy keychain").
