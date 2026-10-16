# Where measured data contradicts the brief

The brief (`docs/BRIEF.md`) is unchanged. Each item here proposes a change, with evidence.

| # | Brief says | Data says | Proposed change | Status |
|---|---|---|---|---|
| 1 | PS1 belongs in the early web-host systems | PS1 (pcsx_rearmed WASM) costs 8–13 ms/frame on a laptop: fine. Even a Snapdragon 888 reaches only 52 fps, because WASM has no dynarec (ADR-001) | Web host: PS1 only on desktop-class CPUs (tier check). Android TV: native core | applied |
| 2 | Controller page from a **public HTTPS origin**, fallback 1 = **WebSocket to host on LAN** | An HTTPS page can't open `ws://` to a LAN IP (mixed content), and a bare-IP `wss://` has no valid cert. Since Chrome 147, LAN WebSockets from public origins also need an LNA prompt (ADR-002) | **LAN mode** (page served by the host over HTTP, WebSocket-first then WebRTC) is the default. **Public mode** (HTTPS origin, WebRTC P2P, cloud relay as the only fallback) needs a deployed domain: owner decision | applied (LAN); public mode pending owner |
| 3 | 5 GHz target p95 ≤ 20 ms, p99 ≤ 40 ms | 5 GHz: met with a wide margin (p95 6.7 ms, p99 8.6–9.8 ms). 2.4 GHz misses p99 on both paths (58–79 ms) | Keep the targets for 5 GHz. The TV warns players whose p95 exceeds 25 ms | applied |
| 4 | Web host uses Nostalgist.js (EmulatorJS as an alternative) | The official RetroArch web build has **no N64/PSP/NDS** cores. EmulatorJS builds of NDS/PSP run under Nostalgist after three integration fixes. N64 crashes (ADR-001) | Two backends behind one engine adapter. N64 is Android-only | applied |
| 5 | Snes9x / Genesis Plus GX may be non-commercial | Confirmed non-commercial (ADR-004) | Fine while free/OSS; downloaded separately, never bundled. Switch to bsnes/clownmdemu before any monetisation | applied |
| 6 | PS2 via NetherSX2/ARMSX2/Play! | NetherSX2 is legally out, ARMSX2 is not a libretro core. Play! (BSD) and **LRPS2** (GPL-3, now with Android arm64 builds) are usable (ADR-003) | Experimental flag, Android only, benchmark-gated | applied |
| 7 | Bluetooth HID as transport option 4 | Not measured: it needs a native companion app, which breaks zero-install | Deferred to after M6 as an optional feature | pending owner |
| 8 | N64 is a target on Android via Mupen64Plus | mupen64plus_next aborts under LibretroDroid on the S21 (Android 15, Adreno 660) with every build and option tried. parallel_n64 runs | parallel_n64 is the default (experimental), mupen selectable; verify on TV hardware; separate emulator process next | applied, open |
| 9 | Web host on a TV via QR, PSP included | Threaded cores (PSP) need `crossOriginIsolated`, which requires HTTPS or localhost | PSP on the web only on localhost with `COI=1` (laptop host), or in the future public HTTPS mode | applied |
