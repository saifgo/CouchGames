---
target: Android TV home
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\INFOTEC\\Desktop\\romsFUN\\apps\\host-android-tv\\app\\src\\main\\java\\app\\couch\\tv\\ui\\HomeScreen.kt"
target_fingerprint: "sha256:0968f67d85d261a3cbbf5cf11e38aaa7c56220a8015f99ac2fca295b26464156"
target_path: "C:\\Users\\INFOTEC\\Desktop\\romsFUN\\apps\\host-android-tv\\app\\src\\main\\java\\app\\couch\\tv\\ui\\HomeScreen.kt"
timestamp: 2026-10-19T23-02-34Z
slug: c-main-java-app-couch-tv-ui-homescreen-kt-155c44b9
---
Method: design review only (detector not applicable, native platform). Reviewed from source (HomeScreen.kt, HomeParts.kt, Common.kt); no device/emulator; repo screenshots predate the current layout.

Heuristics: 1 Status 3 | 2 Real world 2 | 3 Control 3 | 4 Consistency 2 | 5 Error prevention 3 | 6 Recognition 3 | 7 Flexibility 2 | 8 Minimalist 2 | 9 Error recovery 2 | 10 Help 2 | Total 24/40 Acceptable.

Specificity: synthwave grid, scanlines, neon script, CRT frame, PRESS A blink = generic retro-frontend (Big Box) vocabulary; Couch's differentiator (phones as controllers) is a 250dp side panel with an 84dp QR. Brand (yellow ▲●, heavy sans) absent.

Priority issues:
- [P0] Join QR 84dp (~10cm on 55") unscannable from sofa; join copy 9-11sp. Fix: QR 160-200dp, room code >=40sp, URL >=16sp while slots are open; collapse after join. (/impeccable layout)
- [P1] Phone-scale type: ~15 styles at 9-12sp (cover titles, slots, platform subs, facts). Fix: 10-foot scale, 14sp floor, 16-18sp for guest-facing. (/impeccable typeset)
- [P1] Effect stack + 6-fact Details panel + players shown 3x; infinite grid + blur on Mali boxes; no animator-scale respect. Fix: one hero effect, pause idle, trim facts, drop top-bar chips. (/impeccable quieter)
- [P1] "PRESS A"/A-B hints on remote-first device; store screenshots show the old layout (Play policy). Fix: OK for remote, A/B after gamepad input; reshoot screenshots. (/impeccable clarify)
- [P2] No overscan safe area (8dp top, 5dp hint bar). Fix: 48/27dp margins. (/impeccable adapt)

Personas: first-time guest can't scan or read titles from the sofa; remote-only host has no A button; big-library enthusiast has no letter jump and no names/retry on failed loads; cheap Mali box stutters.

Minor: FontFamily.Cursive varies by device; ★★★★★ for favourite reads as rating; emoji at 9sp; empty-state message split across two panels; "Recently" vague; "no network" has no action.
