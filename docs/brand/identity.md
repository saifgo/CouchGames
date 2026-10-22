# CouchPad: identity

Step 3 of the design system (plan: `README.md`). The source is the brand kit,
[`CouchPad Brand Kit.html`](./CouchPad%20Brand%20Kit.html) (boards 01–07; open it in a browser).
This file turns the kit into rules for the code. Where the two disagree, the kit wins for the brand
and this file wins for the product.

The kit's original "In product: TV join screen & phone controller" board was removed on purpose:
its screens were wrong. In-product screens follow the rules below and `BRAND.md`.

## Name

**CouchPad.** One word, capital C and P. Never "Couch Pad", "Couchpad" or "COUCHPAD", and never
retyped in another font. On Ink only, "Pad" may turn Yellow in the lockup.

| Was | Now |
| --- | --- |
| Couch | CouchPad |
| Couch Free / Couch Pro | CouchPad Free / CouchPad Pro |
| Couch server | CouchPad server |
| CoucheTV (Android TV app) | CouchPad for Android TV |

Internal identifiers don't change: npm scopes `@couch/*`, the Kotlin package `app.couch.tv`, the
Android application id `com.tunisolutions.couch` (changing it would make a new Play listing), the
`couch://` deep link, storage keys and the Gradle project name.

Tagline: **Scan. Sit. Play.** Always this punctuation, no exclamation mark.

## Logo

An upside-down gamepad body is the seat, two landscape phones lying on top are the back cushions,
the shoulder buttons are the feet. Defined once in `packages/design/src/mark.ts`; every logo file is
generated from it by `pnpm --filter @couch/design assets`.

| Variant | Use | File |
| --- | --- | --- |
| Full mark on Cream (primary) | light pages, print, docs | `packages/design/assets/mark.svg` |
| Die-cut, Ink border, on Yellow | app icon, TV banner | `mark-on-yellow.svg`, `app-icon.svg` |
| Die-cut, Cream border, on Ink | TV app and phone (dark UI), splash | `mark-on-ink.svg`, Android `cp_mark_on_ink` |
| Simplified (no screens, fat strokes) | below 96 px | `mark-mini.svg`, `favicon.svg` |
| Mono / mono reversed | one-colour print, over photos | `mark-mono*.svg` |

Lockups: horizontal (default), stacked, mark only, wordmark only (see kit board 02).
Clear space: one phone-cushion on every side. Minimum: mark 24 px, lockup 120 px wide, 48 px on TV.

Don't: gradients, glows or shadows on the mark; rotate, stretch or flip it; recolour it (except the
in-app player colour on the body, below); remove the outline; put it on busy images.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| Cozy Yellow | `#F7C948` | logo body, primary buttons, focus ring, "you are here". Only with Ink text. |
| Deep Yellow | `#D9A520` | yellow text/icons on Cream (20 px+ bold), pressed states |
| Ink | `#1C1814` | outlines, text on light, **TV and phone background**. Never `#000`. |
| Cream | `#FFF6E0` | light ground (web pages), text on Ink, sticker border on dark |
| Mocha | `#7A6F5E` | secondary text on Cream |
| Sand | `#B8AE9C` | secondary text on Ink |
| Linen | `#E8DCC0` | borders on Cream, soft text on Ink |

Dark surfaces are lifted Ink: panel `#26211B`, raised `#312A23`, line `#3A332B`.

Pairings that pass: Ink on Yellow 12.1:1, Ink on Cream 15.6:1 (and the reverses). Never Yellow
text on Cream, Cream text on Yellow.

**Player colours** (controllers and player chips only, never brand surfaces):
P1 Yellow `#F7C948`, P2 Coral `#F47C5B`, P3 Teal `#3EBFA5`, P4 Lilac `#9B8CF5`; the kit stops at
four, the 8-player hosts continue with P5 Sky `#5AA9F0`, P6 Leaf `#8CCB5E`, P7 Rose `#F28AC0`,
P8 Linen `#E8DCC0`. Inside the app the mark's body may take the player's colour.

Status colours (good / ok / bad) are functional, not brand, and stay as they were.

Console colours stay an identity feature of the home screen, but Yellow stays the lead: focus, the
main action and the logo are always Yellow.

## Type

| Role | Font | Size (TV) |
| --- | --- | --- |
| Display | Fredoka 700 | 72 |
| Title | Fredoka 600 | 44 |
| Heading | Fredoka 600 | 28 |
| Body | Inter 500 | 20 (TV), 16 (phone, web) |
| UI (buttons, tabs) | Inter 600 | 16+ |
| Caption | Inter 500 | 13, may be ALL CAPS tracked +4 % |

Rules: Fredoka only at 28 px and up, never for paragraphs. TV body 20 px minimum, nothing under 16 px.
Phone labels 14 px minimum. Sentence case. Fallbacks: Fredoka → Nunito → system rounded; Inter →
system-ui. Both fonts are SIL OFL 1.1 and bundled (web: `packages/design/fonts`, Android:
`res/font`), never loaded from Google at runtime.

## Voice

Short, warm, a little playful. Talks like a friend handing you a controller, not a console menu.
See `BRAND.md` for the full voice guide; it still applies with the new name.

## Themes

The default TV theme is the CouchPad look (Ink ground, Yellow focus, Fredoka + Inter). Its internal
id stays `midnight` so saved settings keep working; it is labelled "CouchPad". The other themes
(Sunset, Arcade Pixel Art, Neon Arcade) keep their own art direction but use the new name and logo.
Themes never move or resize components (one shared geometry).

## Files

| What | Where |
| --- | --- |
| Brand kit (source) | `docs/brand/CouchPad Brand Kit.html` |
| Mark geometry, colours | `packages/design/src` |
| Web tokens + fonts | `packages/design/tokens.css`, `packages/design/fonts` |
| Generated logos | `packages/design/assets`, app `public/` folders, Android `res/` |
| Android tokens | `apps/host-android-tv/app/src/main/java/app/couch/tv/ui/Brand.kt` |
