# Couch design system

One brand for the TV (host-web, Android TV), the phone controller and the server pages.
We build it step by step; each step ends with a file in this folder or a package.

| # | Step | Output | Status |
| - | ---- | ------ | ------ |
| 1 | Brand foundations: name, personality, voice, principles | `BRAND.md` | Done |
| 2 | Audit: every color, size, font, component in use today | `audit.md` + `audit/*.png` | Draft, awaiting review |
| 3 | Identity: logo, palette, typeface, icons, motion, sound | `identity.md` + `assets/` | To do |
| 4 | Design tokens: one `tokens.json` → `tokens.css` + `Tokens.kt` | `packages/design` | To do |
| 5 | Components: button, focus ring, cover card, player chip, wheel, hint bar, toast, dialog, QR card, pad | `components.md` + `/design` gallery | To do |
| 6 | Move the apps over: host-web → controller-web → Android TV | One PR each, before/after screenshots | To do |
| 7 | Guardrails: root `DESIGN.md`, CLAUDE.md rule, lint against raw colors, new-screen checklist | Repo rules | To do |

Decided so far: name **Couch**, direction **warm living-room with a light touch of retro arcade**,
signature color **Couch Yellow `#FFD166`**.
