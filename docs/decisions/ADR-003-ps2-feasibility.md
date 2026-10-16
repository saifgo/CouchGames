# ADR-003: PS2 feasibility

- Status: **Accepted: experimental flag** (2026-10-16)
- Decision: **PS2 ships behind an experimental flag, on the native Android TV host only, gated by a device benchmark. No-go on the web host.**

## Context

PS2 is a stretch goal (brief §1). It must be **legal to ship inside our GPL-3.0 app** and technically viable on the hardware we target.

## Options (verified 2026-10-16)

| Path | License | Form | Fits our host? | Notes |
|---|---|---|---|---|
| **Play!** (`play_libretro`) | **BSD-2-Clause** | libretro core; nightly Android arm64 build on the libretro buildbot (1.7 MB, 2026-10-16) | ✅ LibretroDroid loads libretro GL cores | HLE BIOS for many titles; compatibility lower than PCSX2; GLES renderer |
| **LRPS2** (`pcsx2_libretro`, libretro/ps2) | **GPL-3.0** | libretro core; nightly **Android arm64** build exists (3.3 MB, 2026-10-16); very active repo (commits 2026-10-12) | ⚠️ Probably. Renderer selection on Android (GL vs Vulkan) must be verified with LibretroDroid, which only provides GLES contexts | Needs a real PS2 BIOS (user-supplied). Highest compatibility |
| **ARMSX2** | GPL-3.0 (PCSX2 fork) | standalone Android app, **not a libretro core** | ❌ would mean embedding a second emulator frontend | Good performance, but not integrable without a large port |
| **AetherSX2 / NetherSX2** | proprietary / unauthorised patch | standalone app | ❌ never | legal no-go |
| **Play!.js** (web) | BSD-2-Clause | experimental WASM build | ❌ for product | ADR-001: even PS1 is red in WASM on Android SoCs. PS2 in WASM is demo-only |

All the libretro options are GPL-3.0-compatible (BSD-2 and GPL-3 both are), so **licensing does not block PS2**.

## Hardware tier

Brief §2.1 and community data: PS2 needs roughly Snapdragon 845-class CPU, and Adreno GPUs do far better than Mali. Our only device is a Snapdragon 888 phone. We have **no Android TV device**. Most Android TV boxes (Amlogic/Mali, 4× Cortex-A53/A55) are far below the floor. NVIDIA Shield (Tegra X1+) is the realistic minimum, and even it is borderline.

## Decision

1. **Experimental flag** `Settings → Labs → PS2 (experimental)`, off by default, Android TV host only.
2. **Core order**: `play` (no BIOS needed for many games, BSD) → `pcsx2` (LRPS2, needs BIOS; enabled when a BIOS is present and the core initialises a GLES context under LibretroDroid).
3. **Benchmark gate**: when the flag is enabled, the app runs a 10-second CPU+GPU micro-benchmark. It refuses to enable PS2 below the Shield-class threshold (`tier ≥ 5` in `@couch/systems`), with a clear message.
4. **Web host**: PS2 is hidden.

## Consequences

- M5 is implemented as described. The gate and the core download are built and tested on the S21 (Snapdragon 888) as a stand-in. **The owner must validate on a Shield-class TV device before calling PS2 supported.**
- The PS2 controller skin (DualShock 2) already exists in `@couch/skins`.
- Users supply BIOS files in `roms/bios/` (Android: `Documents/roms/bios/`). We never download or ship BIOS.
