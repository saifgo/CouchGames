# Your ROMs go here

This folder is **git-ignored** (except this README and the empty system folders).
Nothing you put here is ever committed.

Drop your own game files into the folder matching the system:

| Folder     | System                    | Extensions                                   |
|------------|---------------------------|----------------------------------------------|
| `nes/`     | NES / Famicom             | `.nes`, `.fds`, `.unf`, `.zip`               |
| `snes/`    | SNES / Super Famicom      | `.sfc`, `.smc`, `.zip`                       |
| `genesis/` | Genesis / Mega Drive      | `.md`, `.gen`, `.bin`, `.smd`, `.zip`        |
| `gb/`      | Game Boy                  | `.gb`, `.zip`                                |
| `gbc/`     | Game Boy Color            | `.gbc`, `.zip`                               |
| `gba/`     | Game Boy Advance          | `.gba`, `.zip`                               |
| `psx/`     | PlayStation               | `.chd`, `.cue` + `.bin`, `.pbp`, `.m3u`      |
| `n64/`     | Nintendo 64               | `.z64`, `.n64`, `.v64`, `.zip`               |
| `psp/`     | PSP                       | `.iso`, `.cso`, `.pbp`                       |
| `nds/`     | Nintendo DS               | `.nds`, `.zip`                               |
| `ps2/`     | PlayStation 2 (experimental) | `.iso`, `.chd`                            |
| `bios/`    | Firmware files (see below)| as named below                               |

After adding files, run:

```sh
pnpm roms:index
```

This scans the folders and writes the library index the web host reads. The web
host also accepts drag-and-drop files at runtime. Those are kept in the browser's
IndexedDB and never uploaded.

The Android TV host scans `roms/` on USB drives and the device's
`Download/roms/` and `Documents/roms/` folders, using the same layout.

## BIOS / firmware

Some systems need firmware dumped from your own console. Put it in `bios/` with these exact names:

| System | File | Needed? |
|---|---|---|
| PlayStation | `scph5501.bin` (USA), `scph5500.bin` (JP), `scph5502.bin` (EU) | Recommended. Without it, the cores fall back to HLE BIOS and some games break. |
| Nintendo DS | `bios7.bin`, `bios9.bin`, `firmware.bin` | Optional for most games (melonDS/DeSmuME have HLE) |
| PlayStation 2 | `ps2-*.bin` / `SCPH-*.bin` | Required by the Play! core for some titles |
| GBA | `gba_bios.bin` | Optional (mGBA has HLE) |

## Free test ROMs

`pnpm test-roms` downloads a few **legal homebrew** ROMs into `test-roms/`
(also git-ignored). We use them for automated tests and demos.
