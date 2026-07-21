# SmirkPočasí

Open-source Czech weather PWA for the SmirkHat.org community. The UI is Czech; code, comments, and project documentation are English.

## Stack

- React 19 + TypeScript + TanStack Start (SSR) + TanStack Router
- Tailwind CSS v4
- Local coss UI-style primitives in `src/components/ui`
- Vite 7 + Nitro (Node server output)
- Server routes under `src/routes/api/*` (legacy handlers in `/api` adapted)
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

TanStack Start builds a Nitro server (`.output/`). Same build can be published to several hosts:

### Vercel

Import the repo; build command `npm run build`. Nitro emits a Vercel-compatible output. Keep env vars from `.env.example` in the Vercel project.

### Docker / Node

```bash
docker build -t smirkpocasi .
docker run -p 3000:3000 --env-file .env smirkpocasi
```

Or after `npm run build`: `npm run start`.

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
