# ADR-005: Couch Free + Couch Pro (paid Android TV app)

- Status: **Accepted** (2026-10-19, owner decision)
- Supersedes: the brief's "free / open source, not monetised" (DEVIATIONS #10)

## Decision

One Android TV app on Google Play (and later the Amazon Appstore). It is free to install,
and a one-time in-app purchase (`couch_pro`, about $5.99) unlocks **Couch Pro**. There is no subscription.

| | Couch Free | Couch Pro |
|---|---|---|
| Players (phones + TV controllers) | 2 | 4 or 8 (Settings) |
| Systems | NES, SNES, GB, GBC, Genesis/SMS/GG, Atari 2600, PC Engine | + GBA, PS1, N64, PSP, NDS, PS2 (still device-tier gated) |
| Save states | slot 1 + automatic save on quit (older saves in other slots still load) | slots 1–4 |
| Couch server library (roms/ or S3) | no | yes |
| Reminders | "Couch Free" line under the lobby, a "Go Pro" card before a game at most once every 20 h (Play is the focused default) | none |

Rule: limit how far Free goes, never how well it plays. No time limits, ads or added latency.
The rules live in `ProRules` (`apps/host-android-tv/.../Pro.kt`) with a unit test.

## Consequences

- **Cores**: non-commercial cores (snes9x, genesis_plus_gx, picodrive) are gone from the Android
  catalog (ADR-004 condition). SNES runs on bsnes_mercury_performance (bsnes fallback), Genesis on
  clownmdemu, and Master System / Game Gear files on Gearsystem (GPL-3). A test in `@couch/systems`
  keeps them out. The web host is not sold and keeps its cores. If it is ever monetised, the same switch applies there.
- **GPL**: the app stays GPL-3.0-or-later (LibretroDroid is GPL), so the Pro check can be
  legally removed from a self-built copy. We accept this: people pay for the store install and
  updates. No obfuscation or licence servers.
- **Purchase check**: Google Play Billing 8. The result is cached in preferences so Pro works offline. It is re-checked
  on every start, so a refund turns Pro off. There is no server-side verification (not worth it under the GPL).
- **Sideloaded builds** can't buy Pro (no Play Store). Debug builds have a "Pro test switch" in Settings.
- **Not built yet**: themes / custom controller layouts (planned Pro extras).

## Open question: Play Billing vs. the GPL (owner decision)

The Billing Library is proprietary (Android SDK License). Our own code is the owner's, but
LibretroDroid is GPL-3 by a third party, and the GPL doesn't clearly allow shipping it in one APK
with a proprietary library. Many GPL apps on Play do it anyway, but it's a risk. Options:

1. **Keep in-app billing** and ask LibretroDroid's author (Swordfish90) for a written exception. Smoothest for buyers.
2. **Unlock-key app**: a tiny paid "Couch Pro Key" app on Play. Couch checks that it's installed
   and signed with our key. No proprietary code in Couch, so the licence question disappears. Buying takes one extra store page.
3. Keep in-app billing without asking. Common practice, but the risk stays.

Recommendation: 2 if the exception (1) isn't granted before launch. Only `Pro.kt` changes.

## Owner to-do before launch

1. Google Play developer account. Check that your country is a supported merchant location.
2. Create the in-app product `couch_pro` (one-time) and set the price.
3. Release keystore + signed AAB (the release build still uses the debug key).
4. Store listing: "play the games you own", no ROMs, no console trademarks in the icon/title.
5. A short legal check of the listing wording.
