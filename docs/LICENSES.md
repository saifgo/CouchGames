# Third-party licenses

Couch Emulation itself is **GPL-3.0-or-later**. Since 2026-10-19 the Android TV app is sold (Couch Pro, ADR-005), so it
only uses cores whose licence allows commercial use.
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
| snes9x | SNES | Snes9x license: "non-commercial purposes… freeware for PERSONAL USE only" | ⚠️ | web only (removed from Android, ADR-005) |
| bsnes_mercury_performance | SNES | GPL-3.0 (bsnes fork) | ✅ | Android default |
| bsnes | SNES | GPL-3.0-only | ✅ | Android fallback (heavier) |
| genesis_plus_gx | Genesis/MD, SMS, GG | Custom: "may not be sold, nor used in a commercial product or activity" | ⚠️ | web only (removed from Android, ADR-005) |
| picodrive | Genesis/MD, 32X | Custom (same MAME-style non-commercial clause) | ⚠️ | not used |
| clownmdemu | Genesis/MD | AGPL-3.0 | ✅ | Android default for Genesis |
| gearsystem | Master System, Game Gear | GPL-3.0 | ✅ | Android, `.sms` / `.gg` files |
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
| stella | Atari 2600 | GPL-2.0-or-later | ✅ | Android default |
| stella2014 | Atari 2600 | GPL-2.0 | ✅ | web (EmulatorJS build) + Android fallback |
| mednafen_pce_fast (Beetle PCE Fast) | PC Engine / TurboGrafx-16 (+CD) | GPL-2.0 | ✅ | web + Android |
| play (Play!) | PS2 | BSD-2-Clause | ✅ | Android, experimental flag (ADR-003) |
| ARMSX2 | PS2 | GPL-3.0 (PCSX2 fork) | ✅ license, ❌ not a libretro core | not used (ADR-003) |
| AetherSX2 / NetherSX2 | PS2 | proprietary / unlicensed patch | ❌ | never |

### Builds we download

- **RetroArch Emscripten builds**: `arianrhodsandlot/retroarch-emscripten-build` v1.22.2 (the Nostalgist.js
  default set). Each core keeps its own license above. RetroArch: GPL-3.0.
- **EmulatorJS core builds**: `@emulatorjs/core-*` 4.2.3 on npm. These are built from EmulatorJS's GPL-3.0 RetroArch
  fork. Each package ships the core's own license file, which `scripts/fetch-cores.mjs` copies next to the
  core as `<core>_LICENSE.txt`.
- **Android cores**: libretro buildbot `android/latest/<abi>/<core>_libretro_android.so.zip` (arm64-v8a, armeabi-v7a,
  x86_64), fetched at build time and bundled in the APK (`fetchCores` in `app/build.gradle.kts`). All are GPL/MPL/BSD-licensed (table above).

## Libraries

| Library | License | Used by | Why |
|---|---|---|---|
| Nostalgist.js | MIT | host-web | Thin launcher API over RetroArch Emscripten builds |
| EmulatorJS (core builds only) | GPL-3.0 | host-web (N64/PSP/NDS cores) | Only WASM builds of those cores that exist |
| LibretroDroid | GPL-3.0 | host-android-tv | libretro frontend for Android (powers Lemuroid) |
| Google Play Billing Library 8 | Android SDK License (proprietary) | host-android-tv | ⚠️ Couch Pro purchase (ADR-005). Linking a proprietary library into an app that includes GPL-3 LibretroDroid is a licence question: see ADR-005 "Open question" |
| ws | MIT | signaling | WebSocket server |
| tsx | MIT | signaling | Run TypeScript in Node without a build step |
| @aws-sdk/client-s3 (+ @smithy/* deps) | Apache-2.0 | signaling | Optional ROM library in an S3 / S3-compatible bucket |
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
| OkHttp 4 | Apache-2.0 | host-android-tv | Couch server library and game downloads (also used by Coil) |
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

**Exception: console logos on the platform wheel** (owner decision, 2026-10-18). `packages/systems/logos/*.svg`
and the Android copies `res/drawable-nodpi/logo_*.png` come from Wikimedia Commons, where each file is marked
**public domain** (simple text/shape logos). `scripts/build-logos.mjs` lists the exact files. Black parts are
turned white for the dark UI; nothing else changes.

| System | Commons file |
|---|---|
| NES | NES logo.svg |
| SNES | SNES logo.svg |
| Genesis | Sega genesis logo.svg |
| Game Boy | Nintendo Game Boy Logo.svg |
| Game Boy Color | Game Boy Color logo.svg |
| Game Boy Advance | Game Boy Advance logo.svg |
| PlayStation | PlayStation logo and wordmark.svg |
| Nintendo 64 | Nintendo 64 wordmark.svg |
| PSP | PSP Logo.svg |
| Nintendo DS | Nintendo DS Logo.svg |
| PlayStation 2 | PlayStation 2 logo.svg |
| Atari 2600 | Atari 2600 logo.svg |

The Neon Arcade theme also shows the focused console's logo as a lit sign in the top bar (same files).

The same logos also appear on the **default Couch covers** (shown when a game has no box art):
`packages/systems/covers/*.svg` and `res/drawable-nodpi/cover_*.png`, made by
`packages/systems/scripts/build-covers.ts` (`pnpm covers`). The rest of each cover is Couch's own artwork.

⚠️ Public domain covers copyright only. These logos are **trademarks** of Nintendo, Sega, Sony Interactive
Entertainment and Atari. They're fine for personal use. Before publishing or selling the app, replace them, or
get legal advice on nominative use.

### Arcade Pixel Art theme (host-web)

The pixel console icons (`apps/host-web/src/themes/pixel-art.tsx`), cover shapes and backgrounds
(`apps/host-web/src/themes/pixel.css`) are original pixel art drawn for this project, with no logos. The theme
bundles these fonts from npm (`@fontsource/*`; packaging MIT, fonts as below):

| Font | Package | License |
|---|---|---|
| Press Start 2P (CodeMan38) | @fontsource/press-start-2p | SIL OFL 1.1 |
| VT323 (Peter Hull) | @fontsource/vt323 | SIL OFL 1.1 |
| Silkscreen (Jason Kottke) | @fontsource/silkscreen | SIL OFL 1.1 |
| Pixelify Sans (Stefie Justprince) | @fontsource/pixelify-sans | SIL OFL 1.1 |
| Jersey 10 (Sarah Cadigan-Fried) | @fontsource/jersey-10 | SIL OFL 1.1 |

### Neon Arcade theme (host-web)

The wall drawings (`apps/host-web/src/themes/neon-art.tsx`: buttons, cartridges, discs and handheld outlines
as neon tubes) and the theme styles (`apps/host-web/src/themes/neon.css`) are original artwork for this
project. The top-bar sign reuses the console logos listed above. Fonts (`@fontsource/*`; packaging MIT):

| Font | Package | License |
|---|---|---|
| Tilt Neon (Andy Clymer) | @fontsource/tilt-neon | SIL OFL 1.1 |
| Neonderthaw (Robert Leuschke) | @fontsource/neonderthaw | SIL OFL 1.1 |
