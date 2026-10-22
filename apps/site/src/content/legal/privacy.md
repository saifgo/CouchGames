---
title: Privacy policy
description: CouchPad has no accounts, no ads and no analytics. What stays on your TV and phone, what the web version sends, and how to delete it.
summary: No accounts, no ads, no analytics. We don’t collect, sell or share your personal data.
order: 1
facts: [No accounts, No ads, No analytics]
---

Last updated: {{updated}}

**Short version:** CouchPad has no accounts, no ads and no analytics. We do not collect, sell or share
your personal data. What the Android TV app stores stays on your TV or your phone.

This policy covers CouchPad for Android TV (package `com.tunisolutions.couch`), the controller page
that phones open after scanning the QR code, the web version at app.couchpad.tv, and this website.
“CouchPad”, “we” and “us” mean the developer of CouchPad, {{developer}}. Contact details are at the end.

## 1. Data we collect

From the Android TV app: none. It does not send personal data, usage statistics, crash reports or
device identifiers to us. We run no analytics, advertising or tracking SDKs in any part of CouchPad.

The web version and this website run on our server, so they work a little differently; see
sections 8 and 9.

## 2. Data stored on your devices

To work, the Android TV app keeps the following on your own devices. It never leaves them unless
section 3 says so.

| Data | Where | Why |
| --- | --- | --- |
| List of game files found in your game folders (file names only) | TV | Show your library |
| Copies of games from your game folders, made when you play them | TV (cache) | Emulators need a local file. Older copies are removed automatically |
| Save states, in-game saves, recently played | TV | Continue where you left off |
| Settings and CouchPad Pro purchase status | TV | Remember your choices; Pro works offline |
| Crash logs (device model, Android version, error details) | TV | Tell you which emulator crashed. Never uploaded |
| Latency history (only if you turn it on in Settings) | TV | Show connection quality. Contains no names or game titles |
| Player name and controller settings | Phone browser storage | Remember your name and pad layout |

Player names typed on phones are sent to the TV over your local network so they can be shown in the
lobby. They are kept in memory for the session only.

## 3. Connections to other services

Some features connect to services we do not run. They receive your IP address, like any website you visit.

- **Google Play** handles the CouchPad Pro purchase and payment. We only receive whether the
  purchase is valid. See [Google’s Privacy Policy](https://policies.google.com/privacy).
- **libretro thumbnails** (`thumbnails.libretro.com`): box art is loaded from this public server.
  The request contains the game’s title.
- **Your CouchPad server** (optional): if you enter the address of a CouchPad server, the app loads
  your games from it. That server is run by you or whoever gave you the address, not by us.

## 4. Phones and the local network

With the Android TV app, phones join by opening a page served by the TV itself on your Wi-Fi. Button
presses travel directly between the phone and the TV (WebRTC, which is encrypted, or a local
WebSocket). They do not pass through our servers.

The controller page may use the phone’s vibration and, only if you turn on tilt controls, its motion
sensors. It does not use the camera, microphone, location or contacts. Your phone’s own camera app
reads the QR code; the page never sees the camera.

## 5. Permissions on the TV

- **Internet, network state, Wi-Fi state:** let phones connect and show the join address.
- **Game folders:** on Android 11 and newer, CouchPad only reads the folders you pick with the
  system folder picker. You can remove a folder in Settings. On Android 8–10, CouchPad asks for the
  storage permission to find `roms` folders. Only game and BIOS files are read.
- **Vibrate:** rumble on game controllers.
- **TV home screen (EPG data):** add “Continue playing” entries to the Android TV home screen.

## 6. Children

CouchPad is not directed at children under 13, and it collects no personal data from anyone,
including children.

## 7. Keeping and deleting your data

Because the app keeps everything on your devices, you control it:

- **TV:** Settings → Apps → CouchPad → Clear data, or uninstall the app.
- **Phone:** clear the site data for the controller page in your browser.

We hold no copy, so there is nothing for us to delete. Purchase records are kept by Google Play.

## 8. The web version (app.couchpad.tv)

The web version runs the TV side in your browser and uses our server to connect phones to it:

- **Joining:** the server creates the 4-letter room code and passes connection details between the
  TV page and the phones. Player names pass through it for the session and are not stored.
- **Button presses** go straight from phone to TV when the network allows it (WebRTC). When it
  doesn’t, they are relayed through our server and are not stored.
- **Games you drag onto the page** stay in that browser. They are not uploaded.
- **Error reports:** if something crashes, a short report (error message, page path, browser type)
  is sent to our server so we can fix it. Anonymous latency summaries are sent only if you turn
  them on.

If you run your own CouchPad server instead, all of this goes to your server, not to us.

## 9. This website

couchpad.tv sets no cookies and runs no analytics or tracking. Fonts and images are served from
our own server. Like any web server, it may keep standard access logs (IP address, page, browser,
time) for security and troubleshooting.

## 10. Changes

If this policy changes, we will update this page and the date at the top.

## 11. Contact

Questions about privacy: [{{email}}](mailto:{{email}})
