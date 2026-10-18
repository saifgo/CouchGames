# Deploying Couch (Docker / Coolify): public HTTPS mode

One container serves everything on port 8787:

| Path | What |
|---|---|
| `/` | TV web host (open this on the TV/laptop browser) |
| `/c/` | Phone controller (the QR code points here) |
| `/ws` | Signaling + WebSocket input relay |
| `/api/*`, `/roms/*`, `/test-roms/*`, `/bios/*` | ROM library |
| `/cores/*` | libretro WebAssembly cores (downloaded at image build time) |

The server speaks plain HTTP. HTTPS comes from the reverse proxy (Coolify's Traefik, Caddy, nginx…).
All client URLs come from `location.origin` (`https` → `wss`), so no domain is configured in the app.

## Coolify

1. Push this repo to a Git remote Coolify can reach (GitHub/GitLab/Gitea, private is fine).
2. In Coolify: **New Resource → Public/Private Repository → Build Pack: Docker Compose**
   (it picks up `docker-compose.yml`). The **Dockerfile** build pack also works: set the port to `8787`
   and add the two volumes below by hand.
3. On the `couch` service, set **Domains** to your domain with the port, e.g. `https://couch.example.com:8787`
   (Coolify routes 443 → container 8787 and issues the Let's Encrypt cert). WebSockets pass through
   Traefik with no extra config.
4. Deploy. The first build takes a few minutes because it downloads ~165 MB of cores and ~55 MB of
   homebrew ROMs. The healthcheck is `GET /api/health`.
5. Add your games to the `couch-roms` volume (see below), then open `https://couch.example.com` on the TV.

### Getting ROMs into the container

ROMs and BIOS are never baked into the image. Layout inside the volume: `<system>/<file>`, BIOS in `bios/`.

```sh
# on the Coolify server
docker ps --filter name=couch                    # find the container name
docker cp ./snes/. <container>:/app/roms/snes/   # or copy straight into the volume's _data dir
```

Or swap the named volume for a bind mount in `docker-compose.yml` (`- /srv/couch/roms:/app/roms:ro`)
and drop files into that folder over SFTP. The library rescans automatically (5 s cache), or press
*Refresh library* on the TV. You can also drag files onto the TV page, which keeps them in that browser only.

### ROMs from an S3 bucket

Instead of the volume, the server can read the library from S3 or any S3-compatible service
(Cloudflare R2, MinIO, Backblaze B2, Wasabi). Set `S3_BUCKET` and the server lists and streams
objects from there. Keys use the same layout under `S3_PREFIX`:

```
s3://my-games/couch/roms/snes/Super Mario World (USA).sfc   ← S3_PREFIX=couch/roms/
s3://my-games/couch/roms/psx/Game.cue + Game (Track 1).bin
s3://my-games/couch/roms/pce/Bonk's Adventure (USA).pce
s3://my-games/couch/roms/bios/scph5501.bin                  ← served as /bios/
```

Rules: one folder per system directly under the prefix, files directly inside it (no sub-folders),
folder names **lower-case** (S3 keys are case-sensitive, so `SNES/` is not `snes/`). Folder names:
`nes snes genesis gb gbc gba psx n64 psp nds ps2 atari2600 pce`, plus `bios/`. The accepted file
extensions per system are in `roms/README.md`. A disc's `.cue` and its track files sit side by side.

**Checking the connection.** The library footer on the TV has a storage chip (green: connected,
amber: connected but some files are in the wrong place, red: not connected). Select it for the
bucket, prefix, region, whether listing and reading work, games per system, BIOS files found, a
plain-language error (wrong secret key, wrong region, missing permission...), and every file that
is not picked up with the reason. *Test again* re-checks after you change the bucket. The same
report is at `GET /api/storage` (`?fresh` to skip the 30 s cache), and the server logs
`ROM storage …: connected, N games` or `NOT CONNECTED: …` at startup.

**Offering the Android TV app on the TV page.** Upload the APK to `apps/` in the ROM storage, e.g.
`s3://couche-roms/apps/CoucheTV-0.4.0-release.apk` (or `roms/apps/` with the volume). The TV page
then shows an *Android TV app* button with a download link and QR code (`/download/<file>`), and
the "games hidden" hint links to it. With several APKs it offers the release build with the highest
version. Or set `APK_URL` to an external link (e.g. a GitHub release). Without either, the button
is hidden. Local runs from the repo pick up `apps/host-android-tv/app/build/outputs/apk/release/`.

**On the Android TV app.** In the app, open *Settings → Couch server* and enter the address of the
TV page (e.g. `https://couch.example.com`). The server's games (folder or S3) then show up next to
the ones on the TV box, and a status chip in the hint bar shows the connection. A game downloads
through the server into the app's cache the first time it's played (up to 8 GB are kept; the
least recently played are removed first), and the system's BIOS files from `bios/` come along.
The TV never gets the S3 keys. Instead of typing on the remote, set the address over adb:
`adb shell am start -a android.intent.action.VIEW -d "couch://server?url=https://couch.example.com"`.

The TV still loads `/roms/...` from the Couch server, which proxies the bytes (Range requests
included). The bucket can stay **private** and needs no CORS rules. Every ROM load costs the server
the egress from S3 to itself and from itself to the TV. A bucket in the same region as the server
keeps that fast and cheap; R2 has no egress fees.

Credentials come from the standard AWS chain: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, an
instance role, or `AWS_PROFILE`. The key only needs read access:

```json
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::my-games",
    "Condition": { "StringLike": { "s3:prefix": "couch/roms/*" } } },
  { "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::my-games/couch/roms/*" } ] }
```

Upload with `aws s3 sync ./roms s3://my-games/couch/roms/`. New objects appear after you press
**⟳ Refresh** on the TV page or in the Android app. The library loads one console at a time, and
both the server and each TV keep the list until someone presses Refresh, because listing a bucket is
slow and the files rarely change. In Coolify, set the variables on the service's
**Environment Variables** tab, and mark the secret key as secret. When S3 is on, the `couch-roms`
volume is not used. With `METADATA=1` the server downloads each cartridge ROM (≤ 64 MB) once to
compute its CRC. The result is cached in `couch-cache`.

## Plain Docker

```sh
docker compose up -d --build              # or:
docker build -t couch . && docker run -d -p 8787:8787 -v couch-roms:/app/roms -v couch-cache:/app/.cache couch
```

Open the TV page through the machine's LAN IP or domain, not `localhost`. On `localhost`, the QR code
points at the container's internal IP.

## Settings

| Env | Default (image) | Meaning |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `COI` | `1` | COOP/COEP headers → `crossOriginIsolated`, needed by threaded cores (PSP). Requires HTTPS or localhost |
| `STUN` | `1` | Hand out a public STUN server so WebRTC can go peer-to-peer across NATs |
| `METADATA` | `1` | `0` disables No-Intro name lookups (they download DAT files) |
| `TELEMETRY_URL` | unset | Forward opt-in latency summaries (add `TELEMETRY_URL: ${TELEMETRY_URL}` under `environment:` in the compose file) |
| `RELAY_DELAY_MS` | `0` | Artificial relay delay (testing only) |
| `S3_BUCKET` | unset | Read ROMs + BIOS from this bucket instead of `roms/` (see above) |
| `S3_PREFIX` | empty | Key prefix of the library, e.g. `couch/roms/` |
| `S3_REGION` | `us-east-1` | Bucket region (`auto` for R2) |
| `S3_ENDPOINT` | unset | S3-compatible endpoint, e.g. `https://<account>.r2.cloudflarestorage.com` |
| `S3_FORCE_PATH_STYLE` | `0` | `1` for MinIO and other path-style services |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | unset | Read-only credentials (or use an instance role) |
| `APK_URL` | unset | External download link for the Android TV app, instead of `apps/` in the ROM storage |

| Build arg | Default | |
|---|---|---|
| `WITH_CORES` | `1` | Download web cores (needed to play) |
| `WITH_TEST_ROMS` | `1` | Download the free homebrew demo games. Set `0` for a library with only your own games |

## What changes compared with LAN mode

- **Latency.** Input goes phone → WebRTC peer-to-peer → TV whenever ICE succeeds, which is usual on the
  same Wi-Fi and often across the internet thanks to STUN. When it fails (symmetric NAT, strict
  mobile carriers), input falls back to the WebSocket relay **through your server**, so latency includes
  the round trip to the server. There is no TURN server. If relay play feels laggy, host the
  container close to the players, or add a TURN server (coturn) and extend `iceServers` in
  `apps/signaling/src/main.ts`.
- **The library is public.** Anyone who knows the URL can list and download what's in `roms/`.
  Keep it to games you're allowed to share, or put the site behind Coolify's basic-auth middleware
  or an IP allowlist. The phone controller only needs `/c/` and `/ws`.
- **`/api/crash` and `/api/telemetry` accept unauthenticated POSTs** (64 KB each) and append them to
  `/app/.cache/logs`. That's fine for a personal instance. Rate-limit those paths at the proxy if the URL is widely shared.
- The Android TV app is unaffected. It remains a self-contained LAN host.
