# Couch: brand foundations

Step 1 of the design system (plan and progress: `README.md` in this folder).
This file says **who Couch is**. Colors, type and components come later and must follow it.

## The name

**Couch.** Always one word with a capital C. Not "COUCH", not "Couch Emulation", not "the Couch app".
In a sentence it works like a place: "Join on Couch", "Couch is ready".

## The idea in one line

> Game night on your sofa. The TV is the console, everyone's phone is a controller.

## Personality

| We are                         | We are not                          |
| ------------------------------ | ----------------------------------- |
| **Warm**: a lamp-lit living room | Cold, techy, a dashboard           |
| **Social**: built for 2–4 people at once | A solo "gamer" setup        |
| **Easygoing**: scan, pick, play | Fiddly, settings-first             |
| **Nostalgic, lightly**: a wink at the old consoles | Neon RGB, pixel-everything, kitsch |
| **Confident and simple**: few choices, big targets | Busy, cluttered, tiny text |

Direction: **warm living-room, with a light touch of retro arcade.**

## How much retro? (the "light touch" rule)

Retro is seasoning, not the meal. About **10%**: one retro detail per screen at most.

Retro is allowed in:
- **Moments**: splash, joining, a player connecting, game launch and exit. A short CRT flicker,
  a pixel sparkle or a chiptune blip is fine here.
- **Small accents**: player numbers (P1–P4), score-like counters, console badges.
- **The games themselves**: box art and screenshots carry most of the nostalgia already.

Retro is not allowed in:
- Body text, menus, settings or error messages (always clean and readable).
- Scanlines or pixel fonts on anything people must read for more than a second.
- Effects that cost frames or add latency to input.

## Signature color

**Couch Yellow, `#FFD166`**, the color of a warm lamp. It's the one color people should remember.
- Used for: focus, the main action on a screen, the logo mark, "you are here".
- Used sparingly: if everything is yellow, nothing is focused.
- Always on dark. Text on yellow is near-black (`#1A1405`), never white.

The final palette (dark surfaces, player colors, console colors, status colors, themes) is
defined in Step 3 around this yellow.

## The logo, as it is today

The mark is a **triangle and a circle**, like two controller buttons, next to the word "Couch"
(`apps/host-web/src/ui/common.tsx`, `Logo`). Step 3 decides whether to keep, refine or redraw it.
The idea to keep: *controller buttons = play together*.

## Voice: how Couch talks

Couch talks like the friend who owns the console and is setting it up for you.

1. **Short.** TV text is read from 3 m away by people holding drinks. One idea per line.
2. **Plain words.** "Scan to join", not "Pair your device via QR". No jargon (WebRTC, core, latency) on
   the main screens; it can live in Settings > Advanced.
3. **Talk to the group.** "you", "your phones", "everyone's in". Never "the user".
4. **Calm when things break.** Say what happened and what to do next. No blame, no error codes up front.
5. **A little fun, never silly.** A light line on happy moments, straight talk everywhere else.

| Instead of                            | Write                                       |
| ------------------------------------- | ------------------------------------------- |
| Device paired successfully            | Sam’s phone is in. Player 2.               |
| Error: core failed to load (code 3)   | Couldn't start this game. Try another one, or check Settings. |
| No ROMs found in library              | No games yet. Add some to get started.      |
| Connection quality degraded           | Your phone's signal is weak. Move closer to the Wi-Fi. |
| Initializing emulator…                | Starting…                                   |

Existing copy that already fits: "Your phones are the controllers. Add a game to get started.",
"Loading your library…", "Couldn't start this game".

Formatting rules:
- Sentence case everywhere ("Controller settings", not "Controller Settings").
- Curly apostrophes (’) in UI text.
- Numbers as digits ("2 players", "P1").
- No exclamation marks except on real celebration moments (someone joined, a game launched).

## The three screens, one brand

| Surface | Where it's used | Feel |
| ------- | --------------- | ---- |
| **TV** (host-web, Android TV) | 3 m away, remote or phone D-pad | Big, calm, cinematic. Focus is always obvious. |
| **Phone controller** | In hand, eyes on the TV | Thumb-sized, high contrast, works without looking. Haptics over visuals. |
| **Couch server pages** | Setup, rarely seen | Same colors and type, plainer. |

All three share the name, the yellow, the type and the voice. Sizes and density change per screen.

## Design principles (used to settle arguments)

1. **The TV is the stage.** The phone supports it, it doesn't compete with it.
2. **Focus is sacred.** On TV, it's always clear what's selected, from across the room.
3. **Games first.** Box art and the game image are the hero; our UI frames them.
4. **Never slow the game.** No visual feature is worth a frame or a millisecond of input.
5. **One warm room.** Every new feature should look like it was always part of Couch.

## Still open (to settle in Step 3)

- References: apps, consoles or brands we like or dislike (not given yet).
- Typeface (must be free to ship, licence logged in `docs/LICENSES.md`).
- Whether the triangle and circle mark stays as is.
- Whether the "sunset" and "arcade" themes stay, and how far they may move from Couch Yellow.
