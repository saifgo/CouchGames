# couchpad.tv

The public site: what CouchPad is, how it works, CouchPad Pro, and the privacy, terms and support
pages. Static Astro, no client framework, no cookies, no analytics. The app itself (TV host and
phone controller) is `apps/signaling`, deployed on app.couchpad.tv.

```sh
pnpm --filter @couch/site dev        # http://localhost:4321
pnpm --filter @couch/site build      # → apps/site/dist
pnpm --filter @couch/site typecheck
```

## Where things are

| What | Where |
| --- | --- |
| Facts every page repeats (URLs, price, email, developer) | `src/site.ts` |
| Privacy, terms, support (Markdown) | `src/content/legal/*.md` → `/privacy`, `/terms`, `/support` |
| Home, Pro, 404 | `src/pages/` |
| Styles (brand tokens, type steps, chapters, motion) | `src/styles/global.css` |
| Behaviour (entrances, chapter-coloured bar, the two live pieces) | `src/scripts/site.ts` |
| Screenshots and controller skins | `src/assets/` (from `docs/brand/shots`, `docs/img/skins`) |
| Share image | `public/og.png`, rebuilt by `scripts/og.mjs` |

In the Markdown pages, `{{email}}`, `{{developer}}`, `{{updated}}` and `{{price}}` are replaced with
the values in `src/site.ts`.

## Before launch

- Set the real support address in `src/site.ts` (`email`; it is a placeholder).
- The Google Play link points at `com.tunisolutions.couch`, which isn't published yet.
- If the price, the Free/Pro split (`ProRules` in `Pro.kt`) or the app's data handling changes,
  update `src/site.ts`, the Pro section, `/pro` and `privacy.md` (and its date) in the same commit.

## Deploy

`apps/site/Dockerfile` builds the site and serves it with nginx (`nginx.conf` maps `/privacy` and
`/privacy.html` to the same page, which the Play Console links use). In Coolify: Dockerfile build
pack, location `apps/site/Dockerfile`, port 80, domain `https://couchpad.tv`.

## Design

Brand from `docs/brand/identity.md` (Cozy Yellow, Ink, Cream; Fredoka + Inter, self-hosted). The
layout is a row of full-bleed colour chapters; the hero is the TV's own join card, and its four
seats are the page navigation.
