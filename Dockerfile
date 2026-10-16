# Couch server in one container: TV web host (/), phone controller (/c/), signaling +
# WebSocket relay (/ws), ROM library API and the web emulator cores.
#
# Deploy behind an HTTPS reverse proxy (Coolify/Traefik, Caddy, nginx) for public mode;
# the server itself speaks plain HTTP on $PORT. See docs/DEPLOY.md.
#
#   docker build -t couch .
#   docker run -p 8787:8787 -v ./roms:/app/roms couch
#
# Build args:
#   WITH_CORES=1       download the libretro WebAssembly cores (required to play; ~165 MB)
#   WITH_TEST_ROMS=1   download the free homebrew test ROMs (demo games; ~55 MB)

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app

# ---------------------------------------------------------------- build
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

ARG WITH_CORES=1
ARG WITH_TEST_ROMS=1
RUN if [ "$WITH_CORES" = "1" ]; then pnpm cores; fi \
 && mkdir -p apps/host-web/cores
RUN if [ "$WITH_TEST_ROMS" = "1" ]; then pnpm test-roms; fi \
 && mkdir -p test-roms

# Workspace manifests only, so the runtime stage can do a filtered production install.
RUN mkdir /manifests \
 && find . -name package.json -not -path '*/node_modules/*' -not -path './apps/host-android-tv/*' \
    | xargs -I{} cp --parents {} /manifests

# ---------------------------------------------------------------- runtime
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=build /manifests/ ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @couch/signaling...

# Server sources (run with tsx) and the workspace packages it imports.
COPY --from=build /app/apps/signaling/src apps/signaling/src
COPY --from=build /app/packages/protocol/src packages/protocol/src
COPY --from=build /app/packages/systems/src packages/systems/src
# Built web apps, cores and demo ROMs.
COPY --from=build /app/apps/host-web/dist apps/host-web/dist
COPY --from=build /app/apps/controller-web/dist apps/controller-web/dist
COPY --from=build /app/apps/host-web/cores apps/host-web/cores
COPY --from=build /app/test-roms test-roms

RUN mkdir -p roms/bios .cache \
 && chown -R node:node roms .cache

# Defaults for public HTTPS mode behind a TLS-terminating proxy:
#   COI=1   cross-origin isolation, so threaded cores (PSP) run on HTTPS
#   STUN=1  lets WebRTC punch through NAT when the phone is off the TV's Wi-Fi
ENV PORT=8787 COI=1 STUN=1
EXPOSE 8787
VOLUME ["/app/roms", "/app/.cache"]

USER node
WORKDIR /app/apps/signaling
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "--import", "tsx", "src/main.ts"]
