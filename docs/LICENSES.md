# Third-party licenses

Couch Emulation itself is **GPL-3.0-or-later** (owner decision, 2026-10-16: free / open source).
Every core and library we ship or download at build time is listed here. Licenses were
verified on 2026-10-16 against each project's LICENSE file (GitHub API `spdx_id`, plus the
file text where GitHub reports `NOASSERTION`).

Legend: ✅ GPL-3-compatible open source · ⚠️ source-available, **non-commercial** (not OSI,
not GPL-compatible) · ❌ not usable.

## Emulator cores

| Core | Systems | License | Status | Where we use it |
|---|---|---|---|---|
| fceumm | NES | GPL-2.0-or-later | ✅ | web + Android |
| nestopia | NES | GPL-2.0 | ✅ | fallback |
| snes9x | SNES | Snes9x license: "non-commercial purposes… freeware for PERSONAL USE only" | ⚠️ | web + Android default (see ADR-004) |
| bsnes | SNES | GPL-3.0-only | ✅ | Android alternative (heavier) |
| genesis_plus_gx | Genesis/MD, SMS, GG | Custom: "may not be sold, nor used in a commercial product or activity" | ⚠️ | web + Android default |
| picodrive | Genesis/MD, 32X | Custom (same MAME-style non-commercial clause) | ⚠️ | fallback |
| clownmdemu | Genesis/MD | AGPL-3.0 | ✅ | GPL-clean MD option (web build exists) |
| gambatte | GB/GBC | GPL-2.0 | ✅ | web + Android |
| mgba | GB/GBC/GBA | MPL-2.0 | ✅ | web + Android |
| vba_next | GBA | GPL-2.0 | ✅ | fallback |
| pcsx_rearmed | PS1 | GPL-2.0 | ✅ | web + Android |
| swanstation | PS1 | GPL-3.0 | ✅ | Android alternative |
| mupen64plus_next | N64 | GPL-2.0 | ✅ | Android (web: see ADR-001) |
| parallel_n64 | N64 | GPL-2.0 | ✅ | fallback |
| ppsspp | PSP | GPL-2.0-or-later | ✅ | Android (web: threads build, experimental) |
| melonds | NDS | GPL-3.0 | ✅ | web + Android |
| desmume / desmume2015 | NDS | GPL-2.0 | ✅ | fallback |
| play (Play!) | PS2 | BSD-2-Clause | ✅ | Android, experimental flag (ADR-003) |
| ARMSX2 | PS2 | GPL-3.0 (PCSX2 fork) | ✅ license, ❌ not a libretro core | not used (ADR-003) |
| AetherSX2 / NetherSX2 | PS2 | proprietary / unlicensed patch | ❌ | never |

### Builds we download

- **RetroArch Emscripten builds**: `arianrhodsandlot/retroarch-emscripten-build` v1.22.2 (the Nostalgist.js
  default set). Each core keeps its own license above. RetroArch: GPL-3.0.
- **EmulatorJS core builds**: `@emulatorjs/core-*` 4.2.3 on npm. These are built from EmulatorJS's GPL-3.0 RetroArch
  fork. Each package ships the core's own license file, which `scripts/fetch-cores.mjs` copies next to the
  core as `<core>_LICENSE.txt`.
- **Android cores**: libretro buildbot `android/latest/arm64-v8a/<core>_libretro_android.so.zip`.

## Libraries

| Library | License | Used by | Why |
|---|---|---|---|
| Nostalgist.js | MIT | host-web | Thin launcher API over RetroArch Emscripten builds |
| EmulatorJS (core builds only) | GPL-3.0 | host-web (N64/PSP/NDS cores) | Only WASM builds of those cores that exist |
| LibretroDroid | GPL-3.0 | host-android-tv | libretro frontend for Android (powers Lemuroid) |
| ws | MIT | signaling | WebSocket server |
| tsx | MIT | signaling | Run TypeScript in Node without a build step |
| fflate | MIT | host-web, latency-lab | Unzip PPSSPP assets / zipped ROMs in the browser |
| qrcode | MIT | host-web | QR code for pairing |
| Preact | MIT | controller-web | Tiny UI runtime (hot path bypasses it) |
| React | MIT | host-web | TV UI |
| Vite, Vitest, Playwright, Turbo, TypeScript | MIT / Apache-2.0 | dev only | Tooling |
| 7zip-bin | MIT (7-Zip: LGPL-2.1 + unRAR restriction) | dev only | Extract core archives |
| Jetpack Compose (+ TV), AndroidX | Apache-2.0 | host-android-tv | UI |
| Ktor | Apache-2.0 | host-android-tv | Embedded LAN HTTP/WebSocket server |
| stream-webrtc-android (libwebrtc) | Apache-2.0 / BSD-3 | host-android-tv | WebRTC DataChannels |
| ZXing core | Apache-2.0 | host-android-tv | QR code rendering |
| Coil 3 | Apache-2.0 | host-android-tv | Box art loading |
| androidx.tvprovider | Apache-2.0 | host-android-tv | "Continue playing" on the TV home screen |
| kotlinx.serialization / coroutines | Apache-2.0 | host-android-tv | JSON, concurrency |

## Data

| Data | Licence | Use |
|---|---|---|
| libretro-database No-Intro DATs | CC-BY-SA-4.0 | Downloaded on demand by the couch server for CRC → title lookup (not redistributed) |
| thumbnails.libretro.com box art | © respective owners, served by libretro | Fetched at runtime by the TV for display only (can be disabled) |

## Test content

Only freely distributable homebrew, downloaded by `pnpm test-roms` into the git-ignored `test-roms/`
(see `test-roms/MANIFEST.md` after download). **No commercial ROMs or BIOS files are ever committed.**
User games live in the git-ignored `roms/`.

## Artwork

All controller skins and UI art are original SVG drawn for this project. They contain no console maker
logos or trademarks. Console names are used only nominatively ("SNES-style pad").
