# Couch Emulation

A couch retro console: the TV runs the library and emulator, and phones are the controllers
(scan a QR code, no app install). The product brief is `docs/BRIEF.md`. Decisions are in
`docs/decisions/ADR-*.md`, and places where data overrode the brief are in `docs/DEVIATIONS.md`.

## Layout

```
apps/controller-web   Phone controller (Vite + Preact). Served at /c/ by the host
apps/host-web         TV host in the browser (Vite + React + Nostalgist.js)
apps/host-android-tv  Native TV host (Kotlin, Compose for TV, LibretroDroid, Ktor, libwebrtc)
apps/signaling        "Couch server": rooms, WebRTC signaling, WS relay, ROM library API, static hosting
apps/site             couchpad.tv: marketing site, Pro page, privacy/terms/support (Astro + Markdown)
packages/protocol     Wire format (binary), clock sync, stats, golden vectors (shared with Kotlin)
packages/net          Browser transport: PhoneLink / HostLink (WebSocket first, WebRTC upgrade)
packages/skins        Controller layouts per console (RetroPad effects baked in)
packages/systems      System catalog: extensions, cores per host, perf tiers, BIOS
packages/latency-lab  Phase-0 benchmarks (transport + engine), report generator
roms/                 User ROMs (git-ignored). test-roms/ = downloaded homebrew (git-ignored)
```

## Commands

```sh
pnpm install
pnpm test-roms        # legal homebrew into test-roms/
pnpm cores            # web emulator cores into apps/host-web/cores/
pnpm build && pnpm start   # build everything, serve TV + controller on :8787
pnpm test             # unit tests (vitest) across the workspace
pnpm typecheck
pnpm e2e              # Playwright: controller ↔ host, latency regression
```

Android host (`apps/host-android-tv`): first run `pnpm --filter @couch/controller-web build` and
`pnpm --filter @couch/systems export-json` (copied into assets), then `./gradlew :app:assembleDebug :app:testDebugUnitTest`.

Dev-machine specifics (C: is nearly full, so caches live on D:):
- `PLAYWRIGHT_BROWSERS_PATH=D:/couch-cache/ms-playwright`
- `GRADLE_USER_HOME='D:\couch-cache\gradle-home'`
- Git Bash: `MSYS_NO_PATHCONV=1` before `adb shell` with `/sdcard/...` paths.
- Test phone: Galaxy S21 via adb. The `packages/latency-lab/scripts/android-*.ts` and `bench-*.ts` scripts drive it.
  Close the controller tabs you open (they share a clientId and skew measurements).

## Rules

- Never commit ROMs, BIOS or downloaded cores. Track every third-party licence in `docs/LICENSES.md`.
- The input hot path stays allocation-free:
  - phone: `pad.ts` → `sender.ts` → `PhoneLink.sendInput`
  - host: `HostSession.onInput` → engine pads
  - Changes there need before/after latency numbers (`pnpm --filter @couch/latency-lab bench:transport`).
- Protocol changes: bump `PROTOCOL_VERSION`, run `pnpm --filter @couch/protocol vectors`, and update the Kotlin codec and its test.
- Button bits are libretro RetroPad ids. Skins encode per-console mapping (see the `skins.ts` header).
- Owner decisions (money, licensing risk, dropping a system) go to the owner with options and a recommendation.
