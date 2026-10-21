# Milestones: demo, results, known issues

Status as of 2026-10-16. Test hardware: laptop (i7-10750H, Intel UHD, Windows 11, Chromium 156) and
Samsung Galaxy S21 (Snapdragon 888, Android 15). Used as phone controller, as Android host and as an
"Android SoC" proxy. **No Android TV box, Shield or iPhone was available.** Those measurements are open (see the end).

---

## M0 · Technical spike ✅

**Delivered:** ADR-001 to ADR-004, `packages/latency-lab` (transport + engine benchmarks, real phone over adb,
report generator), `docs/LATENCY.md` with chart, `docs/LICENSES.md`, `docs/DEVIATIONS.md`.

**Key results**
- Our software adds < 1 ms (loopback p95 ≤ 1.2 ms with 4 phones).
- 5 GHz Wi-Fi, one-way: WebRTC p95 6.75 / p99 9.8 ms; WebSocket p95 6.7 / p99 8.6 ms.
- 2.4 GHz misses p99 (58–79 ms).
- Web cores: 8/16-bit and GBA trivial everywhere. PS1 needs a desktop CPU (52 fps on Snapdragon 888 in WASM).
  N64 doesn't run on the web.

**Demo:** `pnpm --filter @couch/latency-lab bench:phone` (phone over USB, same Wi-Fi) or `bench:transport`.

---

## M1 · Vertical slice (web host + controller) ✅

**Delivered:**
- **TV:** splash (audio unlock), home with hero / continue / favourites / per-system rows, lobby (QR + room code
  + slots), game detail, settings, in-game menu.
- **Engine adapter:**
  - official RetroArch WASM cores via virtual gamepads, with explicit binds: the d-pad needed index binds, not hats;
  - EmulatorJS cores via `simulate_input`.
- **Phone:** join screen, framework-free pad engine (multi-touch, slide, chords, 8-way d-pad, sticks),
  per-console SVG skins, latency overlays on both sides.

**Demo**
1. `pnpm setup && pnpm start`, then open `http://localhost:8787` on the TV.
2. Scan the QR code with a phone and pick a game.
3. Press **L** on the keyboard (or open the menu) for the latency overlay. Triple-tap the phone's P-badge for
   phone-side stats.

**Test results:** `e2e/couch.spec.ts` covers:
- pairing and slots;
- reconnect keeping the slot;
- phone navigating TV menus;
- a game launching, the skin switching to NES, and a real pointer press moving the cursor in the core;
- Home → menu on TV and phone, and save state from the phone;
- the loopback latency regression (p95 < 5 ms; measured 0.55 ms).

Real phone with the real product (S21, 5 GHz, SNES game): **one-way p50 5 ms, p95 9.5 ms, loss 0.13 %**.

---

## M2 · Multiplayer ✅

**Delivered:**
- **Players and slots:** 4 or 8 players; drop-in/drop-out. A disconnected phone keeps its slot for 5 minutes,
  identified by a per-device id.
- **Controllers:** slot swap from the TV menu; per-console skin switching; "modern pad" override; left-handed
  mirror; size/opacity; floating sticks; gyro → stick.
- **Haptics:**
  - Android: Vibration API;
  - iOS: switch-checkbox tick;
  - game rumble forwarded from the core via `vibrationActuator`.
- **Keep-awake:** on LAN HTTP pages a no-sleep video replaces Wake Lock. Verified on the S21: Chrome holds a
  `SCREEN_BRIGHT_WAKE_LOCK`.
- **Robustness:** a reconnect race fixed after a real-phone trace; the clock-sync ping burst on join; no latency
  samples before sync.

**Demo:** join with 2–4 phones, then turn one phone's screen off and on: it rejoins as the same player.

**Known issues**
- iOS is untested (no iPhone available).
- A screen-off phone looks like a disconnect until the browser resumes the page.

---

## M3 · Android TV host ✅

**Delivered:**
- Kotlin codec, byte-identical to TypeScript (`ProtocolGoldenTest`, 7 tests).
- **LAN server and networking:** embedded Ktor LAN server (controller + `/ws`), libwebrtc answerer
  (desktop Chrome ↔ Android P2P verified), HostSession port.
- **UI:** phone → D-pad key injection for navigating Compose for TV; LibretroDroid InputBridge; Compose for TV UI
  (home, lobby, detail, settings, in-game menu, latency overlay).
- **Cores:** bundled in the APK (Play policy, see ADR-004 update); side-load path in debug builds.
- **Library:** game folders picked with the system folder picker (copied to the cache on first play), the app folder on
  every volume, and on Android 8–10 USB, Documents and Download.
- **TV launcher integration:** Watch Next "Continue playing" with the `couch://game/<id>` deep link, leanback
  banner, device-tier benchmark.

**Demo**
1. Build and install (README).
2. `adb push` games into `Android/data/com.tunisolutions.couch/files/roms/<system>/`, or use a USB drive.
3. Scan the QR code shown on the TV.

**Test results (S21):**
- The PC Chromium controller joined over WebSocket LAN (240 ms), then upgraded to WebRTC P2P (1.7 s).
- It navigated the TV UI, launched NES, and START reached the core.
- Home opened the menu and save slot 1 worked.

**Known issues**
- The UI is laid out for 960×540 dp TVs, so it's cramped on phones.
- A crashing core takes down the whole app, including the phones' connection (see M6 for mitigation).

---

## M4 · Heavier systems + device tiers ✅ (N64 partial)

**Web host (laptop):** NDS (melonDS), PSP (PPSSPP pthread build, COI) and PS1 at **60.0 fps** through the real TV
UI (`e2e/heavy.spec.ts`). Systems measured too heavy for phone/TV SoCs are hidden on those devices.

**Android (S21, native):**

| System | Core | fps |
|---|---|---|
| SNES | snes9x | 59.5 |
| Genesis | genesis_plus_gx | 59.5 |
| GBA | mgba | 59.5 |
| PS1 | pcsx_rearmed | 59.5 |
| PSP | ppsspp | 59.5 |
| NDS | melonDS | 59.5 |
| N64 | parallel_n64 | runs, ~1 fps on a libdragon homebrew; not representative |

**Tiers:** a 250 ms benchmark run at first start, calibrated on the S21 (score 498). It maps to tiers 1–5, and
systems above the device's tier are hidden (override in Settings).

**Known issues**
- **mupen64plus_next aborts under LibretroDroid** (`FORTIFY: pthread_mutex_lock called on a destroyed mutex` in
  HWUI threads). It happens with the nightly build and with Lemuroid's cached build, with or without Compose,
  and with every option combination we tried. parallel_n64 is the default; mupen stays selectable.
  Next step: test on a real Android TV device. If it persists, host cores in a separate process, as Lemuroid does.
- N64 on the web: both EmulatorJS N64 cores crash under Nostalgist (ADR-001).
- Only homebrew was tested. Commercial games (standard microcode, BIOS for PS1) must be checked by the owner
  with their own ROMs.

---

## M5 · PS2 (experimental) ✅ gate built · ⚠️ not validated

**Delivered:** Labs flag (off), Android only, shown only on tier-5 devices; core order Play! → LRPS2. Details are
in ADR-003. Play! needs "All files access". On the S21 it boots the PS2 VM, then crashes on the only freely
available homebrew ELF without a BIOS.

**Owner action:** test with your own PS2 BIOS + game on a Shield-class TV. Then decide whether PS2 leaves Labs.

---

## M6 · Polish ✅

**Delivered**
- **Metadata by hash:**
  - The server CRC32s user ROMs (skipping iNES and copier headers) and matches the libretro-database No-Intro DATs.
  - That gives canonical titles and box-art names.
  - Cached in `.cache/metadata`; only public DAT files are downloaded.
- **Box art:** thumbnails.libretro.com with generated art as the fallback, on web and Android; can be turned off.
- **Save-state UI:** 4 slots with thumbnails (web), timestamps (Android), autosave on quit, "Continue".
- **Themes:** Midnight / Sunset / Arcade on the web host.
- **Onboarding:** first-run tips on web and Android, re-openable from Settings.
- **Ambient music:** generated live with WebAudio, so there are no assets to license.
- **Anonymous latency stats:** opt-in and off by default. Per session they record system, core, transport and
  p50/p95/jitter/loss: no names, ids or titles. The web host keeps them in `.cache/logs/latency-sessions.jsonl`,
  forwarded only if the operator sets `TELEMETRY_URL`. Android keeps them on the device.
- **Crash reporting:**
  - web: page errors go to `.cache/logs/crash.jsonl`;
  - Android: JVM crash logs, plus native core crashes detected via a "playing" marker. The next start names the
    game and core and offers "Try another core" (verified with the PS2 crash).

---

## Open measurements & owner decisions

| Item | Why it's open | Suggested next step |
|---|---|---|
| Cheap Mali TV box / Google TV / Shield numbers | No device | Run the Android app; Settings shows the tier; `latency-lab/scripts/android-systems.ts` gives fps per system |
| iOS Safari controller | No iPhone | Verify WebRTC from a LAN HTTP page, the switch-haptics workaround and the gyro permission |
| 4 real phones at once on Wi-Fi | Loopback only | Run 4 phones with the TV overlay on |
| Public HTTPS mode (cloud signaling + relay) | Domain chosen: **couchpad.tv** (2026-10-21) | **Owner decision** (ADR-002): Cloudflare Workers + Durable Objects (recommended) or a small VPS |
| Monetisation | Changes core defaults | **Owner decision** (ADR-004): switch SNES/Genesis to bsnes/clownmdemu first |
| Bluetooth HID companion app | Breaks zero-install | **Owner decision**; deferred |
| Separate emulator process on Android | Isolates core crashes, may fix mupen64plus | Engineering, next iteration |
| NDS touch screen on the phone | Needs a protocol v2 pointer field | Next iteration |
