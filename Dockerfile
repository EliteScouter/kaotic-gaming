# Kaotic Gaming site: accounts, saves, high scores, shop, admin page, and the games listed in games.json
# (downloaded from their own GitHub repos into the data volume). Plain Node.js (built-in SQLite), no npm packages.
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8088 \
    KG_DATA_DIR=/data

WORKDIR /app
COPY server.js games.json ./
COPY public ./public

# run as the unprivileged "node" user; it must own the data folder
# (and the downloaded games' folder, its own volume so game servers can read it without seeing player data)
RUN mkdir -p /data /games && chown node:node /data /games
USER node

EXPOSE 8088
VOLUME ["/data", "/games"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8088) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
