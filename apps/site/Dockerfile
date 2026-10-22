# couchpad.tv: the static marketing site, served by nginx. Build from the repo root:
#
#   docker build -f apps/site/Dockerfile -t couchpad-site .
#   docker run -p 8080:80 couchpad-site
#
# In Coolify: Dockerfile build pack, Dockerfile location apps/site/Dockerfile, port 80,
# domain https://couchpad.tv. The app itself (apps/signaling) stays on app.couchpad.tv.
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/site/package.json apps/site/
RUN pnpm install --frozen-lockfile --filter @couch/site...
COPY apps/site apps/site
RUN pnpm --filter @couch/site build

FROM nginx:1.27-alpine
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/site/dist /usr/share/nginx/html
