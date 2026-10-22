# Google Play submission notes

## Public pages

Static pages in `apps/host-web/public/`, served by the CouchPad server (the Coolify deploy, see `DEPLOY.md`):

| Play Console field | URL |
|---|---|
| Privacy policy (required) | `https://couchpad.tv/privacy.html` |
| Website | `https://couchpad.tv/legal.html` |
| Terms (optional, linked from the listing) | `https://couchpad.tv/terms.html` |
| Support / data deletion info | `https://couchpad.tv/support.html` (`#delete-data`) |

Before publishing, replace `YOUR_EMAIL@example.com` in `privacy.html`, `terms.html` and `support.html`, and check the
developer name "Tuni Solutions" (taken from the package id). If the app's data handling changes, update
`privacy.html` and its "Last updated" date in the same commit.

## Data safety form

Based on the code as of 2026-10-19:

- **Does your app collect or share any of the required user data types?** No.
  - No accounts, analytics, ads or crash upload. Crash logs and latency history stay on the TV (`Diagnostics.kt`).
  - Player names go phone → TV over the LAN and are not sent to us.
  - Play Billing is handled by Google and doesn't need to be declared by the app.
  - Box-art requests to `thumbnails.libretro.com` contain game titles. This is content fetching, not user data collection.
- **Account deletion URL:** not needed (no accounts). `/support.html#delete-data` explains how to clear local data.

## Other Play Console items

- **Content rating** (IARC questionnaire): no user-generated content shared with others, no chat, no purchases of
  random items. The app includes no games, so the rating covers the app itself.
- **Target audience:** 13+ (keeps the app out of the Families policy).
- **Ads:** no.
- **App access:** no login needed.

## Policy risks to fix before review

1. ~~**Downloading cores at runtime.**~~ Fixed: cores are bundled in the app (ADR-004 update). Per-device Play
   download is about 40 MB (armeabi-v7a) to 47 MB (arm64-v8a).
2. ~~**`MANAGE_EXTERNAL_STORAGE`.**~~ Fixed: removed. Android 11+ uses the system folder picker ("Add game folder");
   `READ_EXTERNAL_STORAGE` is limited to Android 8–10 (`maxSdkVersion=29`). No permission declaration form is needed.
   Some Android TV builds have no folder picker: CouchPad then explains the no-permission app folder on USB drives.
3. **Cleartext traffic.** Allowed, but the LAN WebSocket and `http://` CouchPad servers are not encrypted. The privacy
   policy doesn't claim otherwise.
