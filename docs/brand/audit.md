# Couch design audit (Step 2)

Taken 2026-10-21. A snapshot of what the three surfaces use today, so Step 3 (identity) and Step 4
(tokens) start from facts. Each item ends with a verdict: **Keep**, **Merge** or **Drop**.

Screenshots: `audit/*.png` (TV web at 1920×1080, phone at 844×390). Regenerate with
`SHOTS=1 SHOTS_DIR=docs/brand/audit pnpm e2e screenshots` (after `pnpm build`).
Android TV shots are the older ones in `docs/img/android-tv-*.png` (Oct 16, before the latest
Android UI changes); retake them on a TV before Step 6.

## Summary

The bones are good: a dark, calm TV screen; Couch Yellow already used for focus and the main action;
game art as the hero; per-console color that changes the mood as you browse. The problem is that
**nothing is shared**. Every value is typed by hand in three places, and they have drifted.

| | TV web | Phone controller | Android TV |
| - | - | - | - |
| Distinct color values | 49 | 24 | ~40 |
| Font sizes | 24 | 7 | 17 (+2 tokens) |
| Corner radii | 10 | 6 | 10 |
| Font | Segoe UI (Windows) / system | system-ui | Roboto (platform default) |
| Icons | hand-drawn SVG set | Unicode glyphs (⚙ ↻ ▶) | Material Icons Rounded |

The top 7 issues, in order:

1. **No brand typeface.** Couch looks like Segoe UI on Windows and Roboto on Android. The "Couch"
   wordmark is just bold system text, so it looks different on every device.
2. **Three logos.** Launcher icon, favicon and PWA icon are a yellow *gamepad*; the in-app logo,
   TV banner and covers use the *triangle + circle* mark; the phone shows the text `▲●`.
3. **Colors drift.** "Muted" grey has 3 values; the dark background has 2 that leak across apps.
4. **Five focus styles on one TV screen.** Yellow ring (covers, buttons), white fill (pills, icon
   buttons), scale with no ring (platform wheel), yellow fill (selected menu item), TV Material
   default (Android dialogs). The brand rule "focus is sacred" needs one, clearly yellow.
5. **Console colors overpower Couch Yellow.** On the NES the screen washes red: backdrop glow,
   preview border, system name, cover strip. Next to the full-color Nintendo/Sega logos on the
   wheel, our own brand is the quietest thing on the screen.
6. **The phone controller feels like another product.** The join screen is on-brand, but the
   in-game menu uses navy buttons (`#263045`) and a different panel, radius and spacing from the TV.
7. **Text below TV minimum.** Android breaks its own 14sp floor in 5 places (8sp NEW badge,
   12–13sp chip subtitles, key caps, overlay, footer). Web cover titles drop to ~0.8rem when focused.

## 1. Color

### Core UI colors

| Role | TV web | Controller | Android | Verdict |
| ---- | ------ | ---------- | ------- | ------- |
| Background | `#07090d` | `#0b0d12` | `#07090D` | **Merge** to one. `#0b0d12` also used by favicon, manifest and Android pill focus text. |
| Panel (solid) | `#12161f` | `#151a24` | `#12161F` | **Merge** |
| Panel (glass) | `rgba(16,20,28,.82)` | `#0d1119f2` (sheet) | n/a | **Merge** into one "raised" surface |
| Cover background | `#11151d` | n/a | `#11151D`, plus `#111111` | **Merge** with panel |
| Text | `#eef2f8` | `#e8ecf3` | `#EEF2F8` | **Merge** |
| Muted text | `#a3adbf` | `#8b96a8` | `#95A0B4` | **Merge**, check contrast on TV |
| Line / border | `rgba(255,255,255,.1)` | `#26304a` (inputs) | white .1 | **Merge** |
| Accent (Couch Yellow) | `#ffd166` | `#ffd166` | `#FFD166` | **Keep**: consistent everywhere |
| Ink on accent | `#1a1405` | `#1a1405` | `#1A1405` | **Keep** |
| Good / Ok / Bad | `#2ed47a` `#ffc83d` `#ff5d6c` | same (ping uses literals) | same | **Keep**, as tokens |
| Secondary button | `rgba(255,255,255,.08)` | `#263045` (navy) | white .06 / TV Material | **Merge**: drop the navy |

### Overlays (scrims)
6 different near-black overlays: `rgba(4,6,10,.78)`, `rgba(5,7,11,.85)`, `rgba(10,12,18,.9)`,
`rgba(0,0,0,.5/.72)`, and on Android `#04060A` at 5 different alphas. **Merge** into 2: *dim*
(behind dialogs) and *heavy* (in-game menu, over moving video).

### One-off colors with no role
`#ff9b9b` (storage error), `#FFC37A` (Pro status), `#1A2133` (TV banner), `#2A303C` (key cap),
`#555`/`#555555`/`#888`/`#666` (offline grey). **Drop**, map each to a token.

### Player colors (P1–P8)
`#ff4d5e #3d9bff #2ed47a #ffc83d #b06bff #ff8a3d #2fd6d0 #ff6bcb`, identical in TS and Kotlin.
**Keep**, but note the clashes: P1 red ≈ "bad" red, P3 = "good" green, P4 = "ok" yellow and close to
Couch Yellow. A red P1 dot next to a red "bad connection" dot reads as an error. Step 3 should
either nudge P1/P4 or make status colors never appear as plain dots next to players.

### Console colors (13 systems)
Defined once in `packages/systems` and copied into Android: consistent. **Keep** as an identity
feature, but decide in Step 3 *how much of the screen* they may color (see issue 5). PSP `#30343b`
and PS2 `#1d3b8f` are too dark to read as text on our background.

## 2. Typography

- **Font:** none chosen. **Drop** system stacks; pick one typeface for all surfaces (Step 3).
- **Sizes:** 24 on web, 17 on Android, chosen per element. **Merge** into a scale of ~7 steps, one
  per surface (TV / phone).
- **Weights:** 400, 600, 700, 800, 900 all used; 800 is the house style for titles. **Keep** a
  heavy display weight, limit to 3 weights.
- **Good patterns to keep:** tabular numbers on clock, facts and room code; `text-wrap: balance`
  on titles; the wide-spaced room code.
- **Covers:** default covers are rendered with whatever font the build machine has. They should use
  the brand font once chosen.

## 3. Shape and space

- **Radius:** web uses 0.3–1.2rem in 10 values, phone 6–18px, Android 4–26dp. **Merge** into 4:
  small (badges, covers), medium (buttons, inputs), large (panels, dialogs), full (pills, avatars).
- **Spacing:** no scale anywhere; values like 0.35, 0.45, 0.5, 0.6, 0.7, 0.8 rem side by side.
  **Merge** into a 4-based scale.
- **Dialogs:** Android has 5 widths (560–880) and 4 paddings (26–32). **Merge** into sm/md/lg.
- **TV safe area:** Android uses 48/27 dp overscan margins, web uses 2.4rem. **Keep**, as a token.
- **10-foot scaling:** web ties 1rem to 1.45% of screen height. **Keep**, it's a good idea.

## 4. Focus and states (most important on TV)

| Element | Focus today |
| ------- | ----------- |
| Cover (web) | yellow outline + scale 1.3 |
| Cover (Android) | yellow 3dp border + spring scale 1.28 |
| Buttons (web) | yellow double ring |
| Pills, icon buttons (web + Android) | turn solid white, dark text |
| Platform wheel | scale 1.1, faint white fill, no ring |
| Selected menu item | solid yellow |
| Android dialogs, settings, in-game menu | TV Material defaults |

**Merge** into one focus language: a Couch Yellow ring plus a lift (scale), with sizes set by token.
White-fill focus is **Drop**. Pressed/disabled states are only defined on the phone pad (scale .92,
brightness 1.45, 40 ms). **Keep** the pad's press feel; it's tuned for latency.

## 5. Components found

| Component | Web TV | Android | Phone | Notes |
| --------- | :----: | :-----: | :---: | ----- |
| Button (primary / secondary / danger) | ✓ | TV Material | ✓ (navy) | 3 looks |
| Pill / chip button | ✓ | ✓ | | white-fill focus |
| Icon button | ✓ | ✓ | ✓ (glyph) | |
| Cover card + default cover | ✓ | ✓ | | strong, keep |
| Platform wheel item | ✓ | ✓ | | real console logos |
| Details panel + facts list | ✓ | ✓ | | |
| Lobby: QR, room code, player slots | ✓ | ✓ | | strong, keep |
| Player chip + connection dot | ✓ | ✓ | ✓ (badge) | |
| Hint bar with button keys (A, B) | ✓ | ✓ | | |
| Modal / dialog | ✓ | ✓ (5 sizes) | sheet | |
| In-game menu | list | list | button grid | different on phone |
| Toast / banner | ✓ | ✓ | ✓ | 3 styles |
| Spinner, progress bar | ✓ | ✓ | | |
| Text input | | ✓ | ✓ | |
| Settings row / toggle | ✓ | ✓ | ✓ | |
| Onboarding steps | ✓ (3 columns) | ✓ (numbered text) | | very different |
| Controller pad (14 skins) | | | ✓ | console replicas; outside the brand on purpose |

## 6. Icons

Three icon systems: hand-drawn SVGs (web TV), Material Icons Rounded (Android, plus one filled
Settings icon), Unicode glyphs (phone, and `✓ ✗ ⬇` in two web modals). **Merge** into one rounded,
2px-stroke set shared by all three, as SVG + Android vector drawables.

## 7. Logo and app icons

| Where | Mark |
| ----- | ---- |
| In-app logo (web, Android), TV banner, default covers | triangle + circle, yellow |
| Android launcher icon, web favicon, PWA icon | yellow gamepad with P1/P2-colored buttons |
| Phone join screen | text `▲●` + bold system "Couch" |

**Merge** to one mark everywhere (Step 3 decides which). The triangle + circle is already on every
default cover, so it is the stronger candidate.

## 8. Motion

Mostly consistent in spirit (one ease-out curve on web, springs on Android). Durations range from
120 to 800 ms with no shared set. Reduced motion is honoured on web; on Android the spinner, accent
crossfade and progress bars ignore it. **Merge** into 3 durations (fast / normal / slow), one ease
curve and one spring, and honour reduced motion everywhere.

## 9. Voice (against `BRAND.md`)

Mostly on-brand already. To fix:
- "4 games hidden: play them in the Android TV app (get it)": too long for a hint bar.
- Android onboarding: "Copy your games into roms/<system>/ … (this device creates the folders for
  you)": developer wording on a welcome screen.
- "All Games" uses title case; the rest is sentence case.
- "Let's play" uses a straight apostrophe.
- Developer terms on main screens: "Save state", "Folder · 0 games", "Hide latency overlay".

## 10. Dead or duplicate code

- Skins define `SkinBody.well` and `SkinBody.accent` that nothing reads.
- `Accent`/`#FFD166` and `#1A1405` retyped in several Kotlin files.
- Themes `sunset` and `arcade` only exist on web (`styles.css`); Android has no theme switch.

## What this means for Step 3

Decisions the identity step must make:
1. **Typeface**: one free (OFL) family with a heavy display weight that reads at 3 m.
2. **Logo**: triangle + circle (recommended) or gamepad; then redraw launcher icon, favicon, banner.
3. **Neutrals**: one background, 3 surface levels, one muted grey that passes contrast on a TV.
4. **Console color budget**: where console color is allowed (recommendation: backdrop glow and small
   accents only; never borders, focus or main text), so Couch Yellow stays the lead.
5. **Player vs status colors**: fix the P1/P3/P4 overlap with bad/good/ok.
6. **Focus style**: one yellow focus treatment for TV, one press treatment for phone.
7. **Themes**: keep sunset/arcade (and bring them to Android) or drop them.
