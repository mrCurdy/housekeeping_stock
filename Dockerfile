# syntax=docker/dockerfile:1

# ---------- base ----------
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false

# ---------- build: install everything, compile server + client ----------
FROM base AS build
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY client client
RUN npm run build

# ---------- prod-deps: only the server's runtime dependencies ----------
FROM build AS prod-deps
RUN rm -rf node_modules */node_modules && npm ci --omit=dev --workspace=@app/server --include-workspace-root=false

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIST=/app/client/dist \
    DB_DRIVER=json \
    JSON_DB_PATH=/app/data/db.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
WORKDIR /app/server
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.js"]
