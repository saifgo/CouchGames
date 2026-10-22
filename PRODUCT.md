# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

The Android TV app (`apps/host-android-tv`, Compose for TV) is the primary product. The phone
controller (`apps/controller-web`) is always a web page, and the browser TV host (`apps/host-web`)
is a free secondary way to run the TV side.

## Users

Both groups, casual first. An enthusiast usually sets CouchPad up: owns their games, puts them in
`roms/<system>/` or a CouchPad server library, and installs the TV app. The people who pick up phones
are casual guests on a sofa (friends, family) who are not technical, have never seen the app, and
want to be playing within seconds of scanning a QR code.

## Product Purpose

A couch retro console with no physical controllers. The TV runs the game library and the emulator
and shows a QR code plus a 4-letter room code. Each player scans it and their phone becomes a
faithful replica of that console's controller. Success means a group goes from "let's play" to
playing together in seconds, and the input feels as immediate as a real pad.

## Positioning

The phone-as-controller layer is the original part: no app install on the phone, a per-console
controller skin that switches automatically with the game on the TV (SNES pad, N64 pad with C
buttons, DualShock), haptics and gyro, and measured low latency (Galaxy S21 on 5 GHz Wi-Fi: one-way
p50 5 ms, p95 9.5 ms, against a p95 budget of 20 ms). Emulation itself uses existing open-source
libretro cores; CouchPad does not write emulators.

## Operating Context

- Living room: a TV seen from a sofa, driven by a TV remote or gamepad (D-pad focus), and phones
  held in landscape as controllers.
- Up to 4 players (8 optional in Pro), drop-in/drop-out mid-game, reconnects keep their slot,
  per-player ping shown on the TV.
- Phones and TV must share the same Wi-Fi. On Android TV the app is its own server; no computer or
  internet is needed while playing.
- Games come from the user: a picked folder, USB drives, the app folder, or a CouchPad server library
  (local `roms/` or S3).

## Capabilities and Constraints

- Systems: NES, SNES, Genesis/SMS/GG, GB/GBC, GBA, Atari 2600, PC Engine everywhere; PS1, N64, PSP,
  NDS and PS2 depend on the device's measured performance tier, which decides what is shown.
- CouchPad Free / CouchPad Pro (ADR-005): free install, one-time in-app purchase (about $5.99), no
  subscription. Free: 2 players, the lighter systems, save slot 1 plus auto-save. Pro: 4 or 8
  players, heavier systems, save slots 1 to 4, CouchPad server library. Free shows a "CouchPad Free" line
  in the lobby and a "Go Pro" card before a game at most once every 20 hours, with Play as the
  focused default.
- The input hot path stays allocation-free; any change there needs before/after latency numbers.
- Controller button bits are libretro RetroPad ids; skins carry the per-console mapping.
- Store and legal constraints: no ROMs, BIOS or games included; no console trademarks in the icon
  or title; listing wording is "play the games you own". Target audience 13+.
- Open owner decision: Play Billing versus the GPL (in-app billing with an exception, or a separate
  unlock-key app). See ADR-005.
- Planned, not built: themes and custom controller layouts as Pro extras.

## Brand Commitments

- Name: CouchPad. Paid tier: CouchPad Pro. Developer name on the store: Tuni Solutions (to be confirmed).
- Voice is plain and direct, as in the README and store notes.
- Existing assets: store icons, feature graphic, TV banner and screenshots in
  `apps/host-android-tv/play-store/out/`; legal pages in `apps/host-web/public/`.

## Evidence on Hand

- Latency measurements: `docs/LATENCY.md`.
- Screenshots: `docs/img/` and `apps/host-android-tv/play-store/out/`.
- Decisions and measured results: `docs/decisions/ADR-*.md`, `docs/DEVIATIONS.md`.
- No testimonials, user counts, reviews or press exist. Do not invent them.

## Product Principles

1. Seconds to play. Scanning a QR code is the whole setup for a guest; nothing on the phone should
   need explaining.
2. Latency is the product. Nothing ships that adds input delay, and claims about speed come from
   measurements.
3. Feels like the real pad. Each console gets its own faithful controller, switched automatically.
4. Limit how far Free goes, never how well it plays. No time limits, ads or added latency.
5. The user's games, the user's network. No accounts, no analytics, nothing leaves the room unless
   the user sets up a server.

## Accessibility & Inclusion

The TV must be fully usable with a remote's D-pad from sofa distance. Guests are non-technical, so
the controller and join flow must be readable and obvious without instructions. iOS has no
Vibration API, so haptics on iPhone rely on the hidden-switch workaround.
