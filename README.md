# SmirkPočasí

Open-source Czech weather PWA for the SmirkHat.org community. The UI is Czech; code, comments, and project documentation are English.

## Stack

- React 19 + TypeScript + TanStack Start (SSR) + TanStack Router
- Tailwind CSS v4
- Local coss UI-style primitives in `src/components/ui`
- Vite 7 + Nitro (Node server output)
- Server routes under `src/routes/api/*` (legacy handlers in `/handlers` adapted)
- Leaflet + react-leaflet 5
- vite-plugin-pwa
- Zustand

## Features in the MVP

- Current weather and forecast from Open-Meteo through `/api/weather`
- City autocomplete through Open-Meteo Geocoding via `/api/geocode`
- Favorite locations stored in `localStorage`
- RainViewer radar layer and Blitzortung lightning layer
- ČHMÚ radar OpenData (MAX_Z) as the default Czech radar source, with RainViewer toggle
- ČHMÚ hydrology overview through `/api/hydro`
- PWA manifest and service worker cache strategies
- Offline fallback to last stored weather and hydro data

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run start   # Node: node .output/server/index.mjs
```

## Deployment

TanStack Start builds a Nitro server (`.output/`). **One repo, one build** — the same artifact runs on Vercel and on a VPS.

### Modes

| Mode | Where UI runs | Where `/api` runs | Config |
| --- | --- | --- | --- |
| All-in-one (default) | Vercel or VPS | same host | leave `VITE_API_BASE` empty |
| Split | Vercel | VPS (`api.pocasi…` or `pocasi-api…`) | set `VITE_API_BASE` on **Vercel build**; set `CORS_ORIGINS` on VPS |

Client calls go through `apiUrl()` (`src/lib/apiBase.ts`). Health check: `GET /api/health`.

**Home page data:** one request `GET /api/home?lat=&lon=` returns weather + warnings + AQI + multi-provider consensus. Server fans out upstreams in-process, keeps a ~90s memory cache, and sets `Cache-Control: public, s-maxage=90`. The browser no longer fans out dozens of `/api/*` calls on load.

### Vercel

Import the repo; build command `npm run build`. Nitro emits a Vercel-compatible output. Keep env vars from `.env.example` in the Vercel project.

For split mode, add on Vercel (build-time):

```bash
VITE_API_BASE=https://api.pocasi.smht.eu
```

(Use a flat subdomain like `pocasi-api.smht.eu` if free Cloudflare SSL blocks nested `api.pocasi…` behind orange-cloud proxy; DNS-only + Let’s Encrypt on the VPS also works.)

### Docker / Node (VPS)

Lightweight path (no panel): Docker Compose + Caddy + cron that pulls git when `main` moves.

```bash
# on a fresh VPS
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker "$USER"   # re-login after

sudo mkdir -p /opt/smirkpocasi && sudo chown "$USER":"$USER" /opt/smirkpocasi
git clone https://github.com/OWNER/pocasi.git /opt/smirkpocasi
cd /opt/smirkpocasi
cp deploy/env.vps.example .env   # set CORS_ORIGINS
# edit deploy/Caddyfile hostnames, point DNS A/AAAA here (CF grey-cloud for nested subs)
docker compose up -d --build

sudo cp deploy/update.sh /usr/local/bin/smirkpocasi-update
sudo chmod +x /usr/local/bin/smirkpocasi-update
# every 5 minutes — no-op if HEAD unchanged
echo '*/5 * * * * REPO_DIR=/opt/smirkpocasi /usr/local/bin/smirkpocasi-update >> /var/log/smirkpocasi-update.log 2>&1' | sudo tee /etc/cron.d/smirkpocasi
```

Or one-off without Compose: `docker build -t smirkpocasi . && docker run -p 3000:3000 --env-file .env smirkpocasi`.

On the API VPS (split mode): `CORS_ORIGINS=https://pocasi.smht.eu`. On Vercel set `VITE_API_BASE` to this host.

### Cloudflare Workers

Use the Cloudflare Vite plugin path from [Start hosting docs](https://tanstack.com/start/latest/docs/framework/react/guide/hosting). A starter `wrangler.jsonc` is included. Swap the Vite Cloudflare plugin in for Nitro when targeting Workers (do not run both plugins at once).

Migration details: [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md).

Keep private values in `.env`; use `.env.example` as the public template.

## Data attribution

- Weather forecast: Open-Meteo
- Optional experimental forecast: Počasí.cz / Seznam.cz, described by Seznam as using data from Windy.com
- Maps: OpenStreetMap contributors
- Radar: ČHMÚ OpenData (MAX_Z), optional RainViewer tiles
- Lightning data: Blitzortung
- Warnings: ČHMÚ CAP bulletins
- Air quality: ČHMÚ IMIS (OpenData), fallback Open-Meteo CAMS
- Hydrology (rivers): ČHMÚ, In-počasí, SHMÚ, PEGELONLINE, Hub'Eau, EA, USGS, IMGW, OPW, WSC, BAFU
- Sea temperature: Open-Meteo Marine (Copernicus SST)
- Neighbor observations: SHMÚ, GeoSphere Austria, IMGW-PIB
- Optional station aggregate: In-počasí
- Location search: Open-Meteo Geocoding (GeoNames)
- Place photos: Wikimedia projects, optionally OpenTripMap and Openverse

## License

MIT
