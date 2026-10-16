# ADR-002: Controller transport

- Status: **Accepted** (2026-10-16)
- Data: `packages/latency-lab/results/transport-*.json`, report in `docs/LATENCY.md`

## Context

Phones send controller state to the TV. Budget for our layer (brief §5), from touch to input visible to the core:
**p95 ≤ 20 ms and p99 ≤ 40 ms on 5 GHz**. Candidates:

1. WebRTC DataChannel, unordered with 0 retransmits, LAN P2P, signaled through a small server.
2. WebSocket to a server on the host device (the controller page is served by the host).
3. WebSocket via a cloud relay (worst case).
4. Native Android Bluetooth HID gamepad (optional).

## Method

- `packages/protocol`: one 18-byte binary INPUT packet, full state, seq + client timestamp. The host echoes each packet as INPUT_ECHO on the same path, and the phone computes RTT. We report **RTT/2**, which is close to one-way latency.
- `packages/net`: the production transport code (PhoneLink / HostLink), so the lab measures exactly what ships.
- `scripts/bench-phone.ts`: real phone (Galaxy S21, Chrome) → laptop over home Wi-Fi. 2,000 packets at 60 Hz per run. Wi-Fi band read from `dumpsys wifi`.
- `scripts/bench-transport.ts`: loopback across separate Chromium processes. This gives the software floor, 1 vs 4 simultaneous phones, and a cloud relay emulated by adding the measured WAN one-way delay (20 ms) at the relay.

## Results (one-way = RTT/2, ms)

| Path | Where | p50 | p95 | p99 | max | loss |
|---|---|---|---|---|---|---|
| WebRTC P2P | S21 on **5 GHz** | 4.95 | **6.75** | **9.80** | 109.7 | 0 % |
| WebSocket to host on LAN | S21 on **5 GHz** | 4.90 | **6.70** | **8.60** | 17.9 | 0 % |
| WebRTC P2P | S21 on **2.4 GHz** | 5.70 | 15.80 | 57.75 | 132.3 | 0.15 % |
| WebSocket to host on LAN | S21 on **2.4 GHz** | 5.65 | 21.80 | 78.80 | 95.6 | 0 % |
| WebRTC P2P | loopback, 1 phone | 0.40 | 0.50 | 0.65 | 1.3 | 0 % |
| WebRTC P2P | loopback, 4 phones (worst of 4) | 0.40 | 0.55 | 0.80 | 4.6 | 0 % |
| WebSocket LAN | loopback, 1 phone | 0.50 | 0.75 | 1.00 | 2.4 | 0 % |
| WebSocket LAN | loopback, 4 phones (worst of 4) | 0.60 | 1.20 | 2.05 | 209 | 0 % |
| WebSocket **cloud relay** (emulated, +20 ms each way) | loopback | 25.65 | 33.25 | 33.80 | 34.6 | 0 % |

Connection setup: WebSocket 28–64 ms; WebRTC ≈ 2.1 s (ICE + DTLS + SCTP).

**Our software adds < 1 ms** (loopback p95 ≤ 1.2 ms even with 4 phones). The radio is the budget.

Then add the frame-poll wait inside the emulator: 0–16.7 ms, mean 8.3 ms (ADR-001). That component isn't counted in the numbers above. It's inherent to any 60 Hz core and identical for every transport.

## Platform checks

| Question | Answer | How we know |
|---|---|---|
| RTCPeerConnection from a plain-HTTP LAN page, Android Chrome | ✅ Works (P2P selected, no TURN) | S21 run from `http://192.168.0.141:8787` |
| RTCPeerConnection from a plain-HTTP LAN page, iOS Safari | ⚪ Not measured (no iPhone). WebKit exposes RTCPeerConnection in insecure contexts, but mDNS host candidates and Safari behaviour must be verified | open item |
| Local Network Access (LNA) | Since Chrome 142 (fetch) and **147 (WebSocket/WebTransport, April 2026)**, a *public* origin connecting to a private IP gets a permission prompt, and must be HTTPS. Per Chrome's announcement, **WebRTC is still not gated**. A page served *from* the LAN is local-to-local and unaffected. | Chrome blink-dev "Intent to Ship: LNA for WebSockets"; Citrix/Sprinklr Chrome 147 notes. Re-verified 2026-10-16 |
| Mixed content | An HTTPS page **cannot** open `ws://` to a LAN IP at all, and `wss://` to a bare IP has no valid certificate. **So from a public HTTPS controller page, fallback 1 (WebSocket to the host on LAN) is impossible.** | Web platform rule; consequence for the brief's fallback chain |
| Secure-context-only features on a LAN HTTP page | Screen Wake Lock ✗, PWA install ✗, iOS motion permission ✗, `crossOriginIsolated` ✗. Vibration ✓, Fullscreen ✓, WebRTC ✓ | MDN / specs (secure-context gated APIs); not separately measured |
| Router client isolation | Not testable here. With isolation on, both LAN paths fail and only a cloud relay works | design handles it (below) |

## Options considered

1. **WebRTC unordered/0-retransmit**: best 2.4 GHz tail (p99 58 vs 79 ms), no head-of-line blocking, works from a public HTTPS origin without an LNA prompt (today). Slow to connect (≈2 s). Rare tail spikes on 5 GHz (one 110 ms burst in 2,000).
2. **WebSocket to host on LAN**: equal on clean 5 GHz, fastest to connect, simplest. TCP head-of-line blocking shows on lossy 2.4 GHz (p95 21.8 ms, misses the budget). Only possible from a LAN-served page.
3. **Cloud relay**: always reachable, but adds 2 × WAN (≈20 ms each way here). p95 33 ms: playable for turn-based or slow games, not for action games.
4. **Bluetooth HID (native companion app)**: not built in M0. It removes Wi-Fi from the loop, but needs an app install (kills the zero-install moment), is Android-only, and Android's BT HID latency is typically 8–15 ms + host polling. **Deferred** as an optional power-user feature after M6.

## Decision

**Hybrid, as already implemented in `@couch/net`:**

1. The phone **connects over WebSocket first** (≈50 ms) so it can play immediately. In parallel it negotiates **WebRTC** (unordered, 0 retransmits for input, reliable for control) and switches to it the moment the DataChannel opens. If ICE fails, it stays on WebSocket and retries WebRTC in the background. The switch is invisible to the player because every packet carries full state.
2. **Where the controller page comes from:**
   - **LAN mode (default now; works offline)**: the host serves `/c/` over HTTP on its LAN IP. Both WebRTC and WebSocket-to-host work; no internet needed. Wake Lock is replaced by a no-sleep video fallback.
   - **Public mode (later; needs a deployed HTTPS origin + signaling)**: QR points to `https://<our-domain>/c/?r=CODE`. WebRTC LAN P2P through cloud signaling. Fallback is the **cloud relay only** (mixed content forbids LAN WebSocket), shown as "High latency" on TV and phone. This mode gives PWA install, Wake Lock and iOS gyro.
3. Input never queues: if a DataChannel's or socket's `bufferedAmount` exceeds 256 B, the packet is dropped. The next one (≤ 16.7 ms later) carries the full state.
4. The TV shows per-player transport, RTT, one-way p50/p95, jitter and loss (clock-synced, NTP-style every 2 s). The phone shows its own echo-RTT in the hidden debug overlay.

## Consequences

- The brief's fallback chain ("public HTTPS page → WebRTC → **WebSocket to host on LAN** → relay") is not possible as written. See `docs/DEVIATIONS.md` §2.
- Public mode needs the owner to pick a domain and hosting (Cloudflare Workers + Durable Objects, or a small VPS). **Owner decision, not blocking M1–M6** (LAN mode covers everything).
- 2.4 GHz misses the p99 target on both paths (radio retries and Wi-Fi power save). The TV lobby warns when a player's one-way p95 exceeds 20 ms ("weak Wi-Fi: move closer or use 5 GHz").
- CI keeps the loopback benchmark as a regression test (`e2e/couch.spec.ts`, "latency regression"). It fails if loopback p95 exceeds 5 ms.

## Open measurements

- [ ] iOS Safari: RTCPeerConnection from a LAN HTTP page, mDNS candidates, switch-checkbox haptics.
- [ ] 4 real phones at once on Wi-Fi (loopback covered; radio contention not measured).
- [ ] Real cloud relay from a deployed region (emulated here with measured WAN delay).
- [ ] Router with client isolation enabled.
