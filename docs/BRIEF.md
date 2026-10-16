# MASTER BRIEF — "Couch Emulation" (phones as controllers)

> The original product brief, kept verbatim as the source of truth. Where measured data
> contradicts it, the deviation is recorded in `docs/decisions/` and summarised in
> `docs/DEVIATIONS.md`, not silently applied here.

---

## 0. Role

Lead engineer on a new product; a solo full-stack developer reviews every milestone. Work in small,
verifiable steps. Run a **technical spike** before product code and write decision records backed by
real measurements. The whole product lives or dies on input latency and device performance.

## 1. Product vision

A **couch retro-gaming console** with no physical controllers:

- **The big screen** (TV) runs a beautiful, controller-free game library and the emulator. It shows a
  **QR code + 4-letter room code**.
- **Each player's smartphone becomes the controller.** Scan the QR, the phone opens a controller page
  (no app install), picks a player slot, and shows a **faithful on-screen replica of that console's
  controller** (SNES pad for SNES games, N64 pad with C-buttons/Z for N64, DualShock for PS1/PS2…).
  The skin switches automatically when the game on the TV changes.
- Up to 4 players (8 later), drop-in/drop-out mid-game, per-player ping shown on the TV.
- Target systems, in order: NES, SNES, Genesis/Mega Drive, Game Boy/GBC/GBA, PS1, N64, PSP, NDS →
  **PS2 as a stretch goal** (only on capable hardware).

The original part is the **phone-as-controller layer** (pairing, low-latency transport, per-console
skins, haptics, gyro). Emulation uses existing open-source cores — we do not write emulators.

## 2. Research already done (verify where flagged)

### 2.1 Emulation engines
| Option | What it is | Systems | Notes |
|---|---|---|---|
| **EmulatorJS** | RetroArch compiled to WebAssembly with a full player UI | Wide: NES→PS1, N64, PSP, NDS, arcade… | Feature-rich, less friendly to modern frontend tooling. PSP core has limitations in some modes. |
| **Nostalgist.js** | Thin JS API over RetroArch Emscripten builds (`launch`, `saveState`, `loadState`, Emscripten FS) | Same libretro cores | Developer-oriented — **preferred for the web host**. Koin.js is a React wrapper worth studying. |
| **Play!.js** | Experimental WASM build of the Play! PS2 emulator | PS2 | Subset of games; heavy. Browser PS2 is "demo only". |
| **LibretroDroid** | C++/Kotlin libretro frontend library for Android (powers Lemuroid) | Stella, Gambatte, mGBA, Mupen64Plus, Snes9x, fceumm, PPSSPP, FBNeo, Genesis Plus GX, DeSmuME, PCSX-ReARMed… | Gradle dependency, GL cores, audio, gamepad events, save states, shaders. **Preferred for the Android TV host.** |
| **PS2 on Android** | NetherSX2 (closed AetherSX2 patch), ARMSX2 (newer, open), Play! | PS2 | ~Snapdragon 845+; Adreno ≫ Mali. **Most Android TV boxes (Mali) will not run PS2 well.** Shield-class is the realistic floor — must be measured. |

### 2.2 Reference apps for the TV UI (study, don't copy assets)
Daijishō, ES-DE, Pegasus, Beacon, Lemuroid (TV focus handling), RetroAssembly / Koin.js, GamesDownloader
"Couch Mode"; console home screens (PS5 / Switch / Steam Big Picture): big art, focus scaling, ambient
music, snappy transitions.

### 2.3 Prior art for phone-as-controller
- **AirConsole** — WebRTC when available, falling back to WebSockets then long-polling; claimed ~1–10 ms on
  WebRTC vs ~40–120 ms without. Weaknesses: no haptics on iOS, players can't feel buttons.
- **Gamepad Remote For TV Games**, **Phone2Pad** — generic phone gamepads (app install, generic layouts).
- **Bluke**, **Bluetooth Remote** — Android phone as a real **Bluetooth HID gamepad** (`BluetoothHidDevice`, API 28+). Android only.

### 2.4 Platform constraints
- **WebRTC DataChannel** `ordered: false, maxRetransmits: 0` → UDP-like. One unreliable channel for input
  state, one reliable channel for events.
- **Chrome Local Network Access (LNA)**: Chrome 142 (fetch/XHR) and 147 (WebSockets): public origin → private
  IP triggers a permission prompt and requires HTTPS. **WebRTC not yet covered** (re-verify). Local-to-local unaffected.
- **Haptics**: `navigator.vibrate` on Android; **iOS has no Vibration API**. Workaround: toggling hidden
  `<input type="checkbox" switch>` (Safari 17.4+) → system haptic tick.
- **Wi-Fi**: 5 GHz preferred; client/AP isolation blocks phone↔TV → need a fallback path.

## 3. Phase 0 — Technical spike

ADR files with context, options, **measured results**, decision, consequences.

- **ADR-001 Host platform.** (a) Web host (Nostalgist.js/EmulatorJS) in desktop Chrome and in a WebView on
  Android TV vs (b) native Android TV host (Kotlin + Compose for TV + LibretroDroid). FPS stability and audio
  crackle for SNES, PS1, N64, PSP homebrew on cheap box / mid-range Google TV / Shield → green/yellow/red.
- **ADR-002 Controller transport.** Throwaway phone page + host, timestamped state echoed back. RTT/2 and
  jitter p50/p95/p99 over 2 000 samples for: (1) WebRTC unordered/unreliable LAN P2P; (2) WebSocket to a
  server on the host; (3) WebSocket via cloud relay; (4) optional Bluetooth HID. 2.4 vs 5 GHz, Android Chrome
  vs iOS Safari, 1 vs 4 phones. Verify LNA prompts, mixed content, RTCPeerConnection from plain-HTTP LAN page.
- **ADR-003 PS2 feasibility.** Legal + technical path (PCSX2-derived, ARMSX2, Play! libretro) and hardware tier → go / experimental-flag / no-go.
- **ADR-004 Core licensing.** Every core + license; flag non-commercial (Snes9x, Genesis Plus GX?) and GPL alternatives.

Default hypothesis: controller = web page/PWA from public HTTPS origin via QR; transport = WebRTC DataChannel
(unordered, 0 retransmits) LAN P2P with cloud signaling; fallback 1 = WebSocket to host on LAN; fallback 2 =
TURN/cloud relay with a "high latency" warning. Build web host first, then native Android TV host on the same
protocol and controller page.

## 4. Controller protocol (shared, versioned)

- Binary `ArrayBuffer`, little-endian, no JSON on the hot path.
- **Input state packet** (unreliable), on every change + heartbeat 60 Hz while held, 20 Hz idle:
  `u8 type | u8 protocolVersion | u16 seq | u32 clientTimeMs | u32 buttonsBitmask | i8 lx, ly, rx, ry | u8 l2, r2 | (optional) i16 gyroX, gyroY, gyroZ`.
  Always full state; host drops older `seq`.
- **Reliable channel**: join, leave, slot assignment, skin change (with console id), rumble, menu actions
  (pause, save/load state, quit), clock-sync ping/pong.
- **Clock sync**: NTP-style every 2 s; per-player offset + one-way latency on the TV.
- Canonical button map = RetroPad (libretro joypad IDs).
- TS codec in `packages/protocol` with round-trip tests; Kotlin port with **shared golden test vectors**.

## 5. Latency requirements

- Touch → input visible to core: **p95 ≤ 20 ms on 5 GHz LAN**, p99 ≤ 40 ms.
- Phone: Pointer Events, `touch-action: none`, no React re-render on the hot path, full multi-touch.
- Host: apply latest state at start of each frame; never queue. Investigate run-ahead.
- Latency debug overlay on TV (RTT, jitter, loss, transport) + phone debug page, hidden toggle in prod.
- Automated latency test in CI (headless Chromium controller ↔ host loopback).

## 6. TV experience

10-foot UI, D-pad/phone navigable; Home (hero, Continue, per-console carousels, favorites, search); Game page;
in-game overlay from phone Home (resume, save/load slots with screenshots, reassignment, quit); Lobby (QR + code,
slots with avatar/colour, quality per player). Library from **user-supplied ROMs**; metadata via hash lookup
(check terms); ship only legal homebrew. 60 fps UI, prefetch art, ambient music toggle.

## 7. Phone controller experience

Landscape, fullscreen, Wake Lock, orientation lock, A2HS prompt. Per-console SVG skins (NES, SNES, Genesis 3/6,
GB/GBA, DualShock, N64, PSP, NDS) — original artwork, no trademarks. Auto skin switch; "generic modern pad"
option. Floating/fixed sticks, dead-zone, gyro→analog. Haptics (Android vibrate; iOS switch workaround) + forwarded
rumble. Generous hit areas, slide-between-buttons, press feedback, left-handed mirror, size/opacity saved locally.
Auto-reconnect keeping the same slot.

## 8. Repo structure

```
/apps        controller-web, host-web, host-android-tv, signaling
/packages    protocol, skins, latency-lab
/docs        BRIEF.md, decisions/ADR-*.md, LATENCY.md, LICENSES.md
```
pnpm workspaces + Turborepo; TS strict; Vitest; Playwright e2e.

## 9. Milestones

M0 Spike → M1 vertical slice (web host + controller, QR, 1 player, NES/SNES homebrew, SNES skin, latency overlay)
→ M2 multiplayer (4 players, slots, drop-in/out, reconnection, skin switching, haptics) → M3 Android TV host
(LibretroDroid, same protocol/controller, local/USB library, launcher integration) → M4 heavier systems (PS1, N64,
PSP, NDS, per-device tiers, auto-hide) → M5 PS2 experimental flag (if ADR-003 "go") → M6 polish (scraping,
save-state UI, themes, onboarding, anonymous latency analytics, crash reporting).

Each milestone ends with demo instructions, test results, known issues, next plan.

## 10. Rules of engagement

- Never commit/download copyrighted ROMs or BIOS. Homebrew/public-domain test ROMs only; user-provided BIOS.
- Track every third-party core/library license in `docs/LICENSES.md`.
- Boring, maintained dependencies; one-line justification per new dependency in commit messages.
- Input hot path allocation-free and measured; changes need before/after latency numbers.
- Product, money, licensing risk, or dropping a target system → stop and ask with options + recommendation.
- Keep `docs/decisions/` current; if data contradicts the brief, say so and propose the change.

## Owner answers (2026-10-16)

- Test hardware available: **Android phone(s)** only (no TV box, no iPhone, no Shield).
- Signaling during development: **local Node server**.
- Monetization: **free / open source** (the app is GPL-3.0-or-later).
- Scope: **build all milestones M0 → M6** without a review stop in between. The owner supplies their own ROMs in `roms/`.
