# ADR-004: Core licensing

- Status: **Accepted** (2026-10-16). The monetisation condition was triggered on 2026-10-19 and the Android defaults were switched (ADR-005)
- Owner input: the project is **free / open source** (GPL-3.0-or-later) and not monetised. The owner explicitly accepted non-commercial cores under that condition.
- Full table: `docs/LICENSES.md`

## Context

We ship or download one libretro core per system. Some popular cores use a source-available
**non-commercial** licence. That is neither OSI open source nor GPL-compatible. The brief asked us to verify which ones (§3, ADR-004).

## Findings (verified against each repo's LICENSE on 2026-10-16)

| Core | Licence | Non-commercial? |
|---|---|---|
| **snes9x** | Snes9x licence: "for non-commercial purposes… Commercial use… Under no circumstances will commercial rights be given" | ⚠️ **yes** (brief's belief confirmed) |
| **genesis_plus_gx** | Custom: "Redistributions may not be sold, nor may they be used in a commercial product or activity" | ⚠️ **yes** (brief's belief confirmed) |
| **picodrive** | Same MAME-style clause | ⚠️ yes |
| fceumm, nestopia, gambatte, pcsx_rearmed, mupen64plus_next, parallel_n64, desmume | GPL-2.0(-or-later) | ✅ no |
| ppsspp | GPL-2.0-or-later | ✅ |
| bsnes, melonDS, swanstation, LRPS2 (pcsx2) | GPL-3.0 | ✅ |
| clownmdemu | AGPL-3.0 | ✅ |
| mgba | MPL-2.0 | ✅ |
| Play! | BSD-2-Clause | ✅ |

## Options

1. **Ship non-commercial cores bundled** in our GPL app/APK. ❌ A GPL-3.0 combined work can't include code under an incompatible licence.
2. **GPL-only defaults**: bsnes for SNES, clownmdemu for Genesis. ✅ clean. bsnes is far heavier than snes9x (cheap TV boxes struggle). clownmdemu lacks Master System / Game Gear / Mega-CD and is less battle-tested.
3. **Non-commercial cores as separately downloaded components**, the RetroArch / Lemuroid model. We never put them in our source tree or our APK. They're fetched at setup time from the libretro buildbot / EmulatorJS npm into git-ignored folders, as independent programs talking over the libretro API. ✅ for a non-commercial project.

## Decision

- **Option 3 now, with option 2 one setting away:**
  - Defaults: snes9x (SNES) and genesis_plus_gx (Genesis/SMS/GG). They're the best quality/performance choices on weak TV hardware.
  - They're never committed or bundled. Web: `pnpm cores` → `apps/host-web/cores/`. Android: downloaded into app storage on first use of that system (M3), not packaged in the APK.
  - Settings → Cores lets the user pick bsnes / clownmdemu instead. `@couch/systems` lists both, preferred first.
- **If the project is ever monetised** (ads, paid app, store fees, donations tied to features), the defaults must switch to the GPL alternatives first. That's an owner decision, recorded in `docs/DEVIATIONS.md`.
- Each downloaded core keeps its own licence file next to the binary (`*_LICENSE.txt` on web; the Android download screen shows it too).

## Update 2026-10-19: Android cores are bundled

Google Play's Device and Network Abuse policy forbids downloading executable code from outside Play, so the
Android app now bundles every catalog core (defaults and alternatives) as native libraries instead of
downloading them on first use. This is only possible because ADR-005 already removed the non-commercial cores
from the Android catalog: everything bundled is GPL-2.0/GPL-3.0/AGPL-3.0/MPL-2.0/BSD (see `docs/LICENSES.md`).
The GPL-2.0-only cores stay separate `.so` programs that talk to Couch over the libretro API. Cost: about
25–30 MB more per device download. The web host is unchanged: it still fetches cores at setup time.

## Consequences

- The Android APK contains only GPL-compatible code. Cores arrive as separate downloads. The app needs internet once per system (or a manual core-import from USB, M3).
- No change is needed for any other system: their preferred cores are already GPL/MPL/BSD.
