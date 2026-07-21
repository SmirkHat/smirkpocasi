# Multi-stage image for SmirkPočasí (TanStack Start + Nitro Node)
# Dokploy: Build type = Dockerfile, Port = 3000, Health = /api/health

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Lockfile was generated with npm 11; image default npm 10 fails `npm ci`.
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
