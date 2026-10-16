# ADR-001: Host platform

- Status: **Accepted** (2026-10-16), with device-tier gaps listed under *Open measurements*
- Deciders: owner (review), lead engineer
- Data: `packages/latency-lab/results/engine-*.json`, screenshots in `results/raw/`

## Context

The TV-side "host" runs the library UI and the emulator. Brief §3 asks us to compare:

- **(a) Web host**: Nostalgist.js / EmulatorJS in desktop Chrome (laptop → HDMI) and in a WebView/Chromium on Android TV.
- **(b) Native Android TV host**: Kotlin + Compose for TV + LibretroDroid.

The decision criteria are FPS stability and audio crackle per system per device tier, ending in green / yellow / red per device.

## Hardware actually available

| Device | Role | SoC / GPU |
|---|---|---|
| Laptop "SaifGO" | desktop-Chrome web host | Intel i7-10750H, Intel UHD 630 (ANGLE/D3D11), Chromium 156 |
| Samsung Galaxy S21 (SM-G991U) | proxy for an Android SoC running the web host in Chrome | Snapdragon 888 (SM8350), Adreno 660 |
| Cheap Android TV box, mid-range Google TV, NVIDIA Shield | **not available**: see *Open measurements* | n/a |

## What we built to measure

`packages/latency-lab/engine.html` launches a core through Nostalgist.js with a selectable backend:

- `retroarch`: official RetroArch Emscripten builds (the Nostalgist default set).
- `ejs`: EmulatorJS core builds (`@emulatorjs/core-*` 4.2.3), adapted to Nostalgist at download time (see *Findings*).
- `ejs-thread`: EmulatorJS pthread builds (need cross-origin isolation).

The page measures emulated FPS (from the core's own frame counter where exported, otherwise from rAF ticks), per-frame CPU cost, and **hitches**: frame gaps over 25 ms, which on a 60 Hz loop mean a visible stutter and an audio underrun (crackle). The page doesn't sample audio output directly; per-frame cost against the 16.7 ms budget is the proxy. It also verifies that injected input reaches the core, by comparing compositor screenshots before and after presses. Runners: `scripts/bench-engine.ts` (desktop, Playwright) and `scripts/bench-phone-engine.ts` (phone over adb).

## Results

Frame cost is time spent inside one `retro_run` tick (budget 16.7 ms). Each run is 15 s after a 3 s warm-up, using homebrew test ROMs (`pnpm test-roms`).

| System | Core (backend) | Laptop fps | Laptop cost p50/p95 ms | S21 fps | S21 cost p50/p95 ms | Input reaches core |
|---|---|---|---|---|---|---|
| NES | fceumm (retroarch) | 60.0 | 0.9 / 1.5 | n/a | n/a | ✅ |
| NES | fceumm (ejs) | 60.0 | 1.1 / 1.8 | 59.5 | 4.0 / 4.4 | ✅ |
| SNES | snes9x (retroarch) | 60.0 | 1.6 / 2.3 | 59.5 | 4.9 / 5.4 | ✅ |
| SNES | snes9x (ejs) | 60.0 | 2.3 / 3.0 | 59.5 | 6.1 / 6.6 | ✅ |
| Genesis | genesis_plus_gx (retroarch) | 60.0 | 1.7 / 2.4 | n/a | n/a | ✅ |
| Genesis | genesis_plus_gx (ejs) | 60.0 | 2.0 / 3.2 | 59.5 | 5.6 / 5.9 | (animated screen) |
| GBA | mgba (ejs) | 59.9 | 1.9 / 2.4 | 59.6 | 5.9 / 6.4 | ✅ |
| PS1 | pcsx_rearmed (retroarch) | 59.9 | **8.3 / 12.1** | n/a | n/a | (needs X+O chord) |
| PS1 | pcsx_rearmed (ejs) | 59.5 | **12.7 / 17.2** | **52.5** | **18.9 / 19.3** | (needs X+O chord) |
| PS1 | pcsx_rearmed (ejs-thread) | 58.3 | 15.8 / 20.2 | n/a | n/a | n/a |
| NDS | melonds (ejs) | 60.0 | 7.6 / 9.4 | 59.4 | 10.0 / 12.0 | n/a (homebrew stops at an SD-card error screen) |
| NDS | desmume2015 (ejs) | 59.9 | 5.6 / 7.3 | n/a | n/a | n/a |
| PSP | ppsspp (ejs-thread, COOP/COEP) | 59.9 | 2.7 / 3.3 | not run¹ | n/a | ✅ |
| N64 | mupen64plus_next / parallel_n64 (ejs, ejs-thread) | **crash** | n/a | n/a | n/a | n/a |

¹ Threaded cores need `crossOriginIsolated`, which needs a secure context (HTTPS or `localhost`). A phone or TV opening the host over plain-HTTP LAN can't run them.

### Green / yellow / red (web host)

| System | Laptop (i7-10750H) | Snapdragon 888 Chrome | Cheap Mali TV box | Google TV mid | Shield |
|---|---|---|---|---|---|
| NES, GB/GBC, Genesis | 🟢 | 🟢 | ⚪ not measured | ⚪ | ⚪ |
| SNES, GBA | 🟢 | 🟢 | ⚪ (estimate 🟡: ~3–4× slower CPU than SD888) | ⚪ | ⚪ |
| PS1 | 🟢 (8–13 ms) | 🔴 (52 fps, no dynarec in WASM) | ⚪ (estimate 🔴) | ⚪ | ⚪ |
| NDS | 🟢 | 🟡 (10–12 ms, little headroom) | ⚪ (estimate 🔴) | ⚪ | ⚪ |
| PSP | 🟡 (works on localhost only, needs COOP/COEP) | ⚪ | ⚪ | ⚪ | ⚪ |
| N64 | 🔴 (core crashes at `plugin_start_gfx` in this integration) | 🔴 | 🔴 | 🔴 | 🔴 |

## Findings

1. **The official RetroArch web build has no N64, PSP, NDS or PS2 cores** (verified against the full 1.22.2 Emscripten archive). Only EmulatorJS publishes WASM builds of those.
2. **EmulatorJS cores can run under Nostalgist**, after three integration fixes that we now apply automatically:
   - `scripts/fetch-cores.mjs` rewrites the CommonJS/AMD wrapper into the ESM shape Nostalgist expects. The emulator code is untouched.
   - The page passes `emscriptenModule: { parent, callbacks, getSavExt }`. The EJS RetroArch fork looks these up.
   - pthread builds get `mainScriptUrlOrBlob` pointing at the untouched classic script, because workers can't import Nostalgist's ESM blob.
3. **Input injection works in both backends, and both are frame-accurate.** The core reads input at its next `input_poll`, so phone input lands within 0–16.7 ms (mean 8.3 ms) of arrival, with no queue.
   - `retroarch`: virtual W3C gamepads (`navigator.getGamepads` override). RetroArch's `rwebpad` samples them every frame.
   - `ejs`: the exported `simulate_input(port, id, value)`, which handles digital and analog.
4. **EmulatorJS cores stall without a user gesture**: the audio context must be unlocked. The official builds keep running. The host UI therefore starts on a "press any key / click to switch on" splash. That gives the page sticky activation, and later launches started from a phone are fine. The Android TV host is not affected.
5. **PS1 is CPU-bound in WebAssembly.** pcsx_rearmed has no dynarec in WASM. Even a Snapdragon 888 misses 60 fps (52.5 fps). TV-box SoCs are 3–5× slower. Native Android pcsx_rearmed uses its ARM dynarec and is a different league.
6. **N64 on the web**: both EmulatorJS N64 cores crash or hang right after `plugin_start_gfx` under our Nostalgist integration, with two different homebrew ROMs, threaded or not. Our time-boxed attempt to validate them under stock EmulatorJS didn't produce a result. **N64 is native-Android-only for now.** Revisit by embedding stock EmulatorJS for N64 if the web host ever needs it.
7. The official `retroarch` builds cost 15–35% less per frame than the EmulatorJS builds of the same core.

## Options

| | Web host (laptop Chrome) | Web host in Android TV WebView | Native Android TV (LibretroDroid) |
|---|---|---|---|
| Systems at 60 fps | NES→GBA, PS1, NDS (PSP on localhost) | 8/16-bit only (PS1 red even on flagship SoC) | All target systems (native dynarecs, GLES cores incl. N64/PSP/PS2) |
| Setup for the user | Laptop + HDMI + browser | Install an app anyway | Install an app |
| Dev speed / iteration | Fastest | Medium | Slowest |
| Audio | WebAudio, gesture needed for EJS cores | Same | Oboe low-latency (LibretroDroid) |
| Phone ↔ host path | Needs a LAN server process on the laptop (couch server) | App can embed a server | Embedded Ktor server + libwebrtc |

## Decision

1. **Build the web host first** (M1/M2) as the prototyping and laptop-to-TV product. Its backends:
   - NES / SNES / Genesis / GB / GBC / GBA / PS1 use the official `retroarch` builds (cheapest per frame, no gesture stall).
   - NDS uses `ejs` (melonDS, with DeSmuME 2015 as a lighter fallback).
   - PSP uses `ejs-thread`, behind an "experimental" flag, available only when the page is cross-origin isolated (localhost or HTTPS).
   - N64 is hidden on web.
2. **The native Android TV host (LibretroDroid) is the real product target** (M3+). Every system above SNES is tiered per device there. The brief's hypothesis holds.
3. **We don't pursue the "web host inside an Android TV WebView" variant.** It has the worst of both: you install an app anyway, and WASM cores lose to native for anything above 16-bit.
4. Host apps hide systems the device can't run (M4): a startup micro-benchmark plus the tier table in `@couch/systems` (`tier` 1–5).

## Consequences

- The web host must ship the couch server (`apps/signaling`) on the laptop: phones can't connect to a browser tab directly. `pnpm start` runs it.
- The web host shows a one-time "switch on" splash for audio activation.
- Downloaded cores live in `apps/host-web/public/cores/` (≈150 MB, git-ignored, `pnpm cores`). The TV never depends on a CDN at play time.
- The brief's PS1 placement on web is partially contradicted: it's green on a laptop, red on Android-class SoCs. See `docs/DEVIATIONS.md`.

## Open measurements

To fill in when hardware is available (owner has none of these today):

- [ ] Cheap Mali Android TV box: native host, all systems (the M3 build includes the same benchmark screen).
- [ ] Mid-range Google TV (e.g. Chromecast with Google TV 4K, Amlogic S905X4).
- [ ] NVIDIA Shield (Tegra X1+), the PS2 gate in ADR-003.
- [ ] Audio crackle by ear on each device (the hitch metric is only a proxy).
