# Pearl & Bloom — CLAUDE.md

Caroline's handmade-jewelry shop. Live at https://pearlandbloom.us (Cloudflare Pages, deploys from  on every push).

## How this repo works
- Plain HTML/CSS/JS, no framework, no build step.  +  +  + .
- Working copy on this VM:  (user harbourlab). Preview of the working copy: https://pearlbloom.tailfb80ed.ts.net (tailnet only; served straight from this folder, refresh to see saved changes).
-  = deploy. Cloudflare Pages rebuilds in ~30 s. Rollback = Cloudflare dashboard → Deployments → previous → Rollback.

## Rules
- This is a kid's learning project. Keep code readable: no minification, no bundlers, no frameworks. Prefer showing Caroline one small change over rewriting a file.
- NEVER put Caroline's age, last name, school, or personal email anywhere in the site. Order email is the shop address only.
- Product photos: JPEG, max 1200 px on the long side, into , named like .
- Prices:  bracelets,  necklaces, .50 keychains unless told otherwise. Shipping is a flat  (see Cowork ).
- Orders go through FormSubmit to the shop inbox; payment is a Venmo QR shown after checkout.
- Commit messages in plain English describing the change ("Add Rainbow Candy keychain").
