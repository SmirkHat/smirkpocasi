# SmirkPočasí — React + Vite → TanStack Start migration plan

**Status:** decisions locked; **execution in progress / largely complete** (SSR Start app builds and serves).  
**Stack:** same-framework port (React → React 19 + TypeScript + TanStack Start).  
**Rendering:** **Full SSR** (not SPA mode). Radar uses `ssr: false` / `<ClientOnly>`.  
**Reference scaffold (disposable):** `/tmp/tanstack-start-scratch/tanstack-start-reference`  
**Docs index used:** https://tanstack.com/start/latest/llms.txt

---

## 1. Current-state inventory

| Area | Finding |
| --- | --- |
| **App type** | Client-only SPA (Vite `createRoot` in `src/main.jsx`). No SSR/SSG. Confirmed: no Start/Remix/Next server render path. |
| **Package manager** | **npm** (`package-lock.json` lockfileVersion 3). Not pnpm/yarn/bun. |
| **Runtime (local)** | Node v24.5.0, npm 11.12.1 (inventory machine). |
| **Language** | JavaScript (`.js` / `.jsx`). `jsconfig.json` path aliases only — **no TypeScript**. |
| **React / Vite** | React **18.3.1**, React DOM 18.3.1, Vite **5.4.11**, `@vitejs/plugin-react` 4.x. |
| **Routing** | **Custom** History API mini-router (`src/router.js` + `src/routes.js`). Not React Router, not Wouter. Four routes: `/`, `/radar/`, `/hydro/`, `/settings/` (trailing slashes enforced by `normalizePath`). |
| **Server state / data fetching** | **Plain `fetch` inside hooks** (`useWeather`, `useHydro`, `useWarnings`, `useAirQuality`, `usePlaceImage`, `useMeteostatHistory`, consensus hooks). **No** TanStack Query, SWR, or RTK Query. Client API wrappers live under `src/api/*`. |
| **Client state** | **Zustand** (`src/store/weatherStore.js`) + heavy `localStorage` use (favorites, weather cache, hydro cache, radar prefs, place-image cache). |
| **Styling / UI** | **Tailwind CSS v4** via `@tailwindcss/vite`; global `src/styles.css`. Local **coss / Base UI** primitives in `src/components/ui` (`@base-ui/react`, `components.json` registry `@coss`). `class-variance-authority`, `clsx`, `tailwind-merge`. Fonts: `@fontsource-variable/inter`, `geist`. Icons: `lucide-react`, `react-icons`. |
| **Maps / charts** | Leaflet + `react-leaflet`, Recharts, `react-day-picker`. |
| **Auth** | **None.** No Clerk/Supabase/Auth.js/session cookies. |
| **Backend / API** | Legacy Vercel-style `(req, res)` handlers live in repo-root `/handlers/*.ts` (not `/api` — Vercel Hobby treats `/api` as serverless functions). Wired via Start server routes in `src/routes/api/*` + `adaptVercelHandler`. HTTP paths remain `/api/...`. |
| **Env vars** | See `.env.example`. Client flags: `VITE_ENABLE_API_KEY_PROVIDERS`, `VITE_ENABLE_EXPERIMENTAL_SOURCES`, `VITE_ENABLE_OPEN_METEO_DEV_PROXY`, `VITE_OPEN_METEO_DEV_PROXY`. Server secrets (no `VITE_`): `WEATHERAPI_KEY`, `PIRATEWEATHER_KEY`, `OPENWEATHERMAP_KEY`, Netatmo trio, `WUNDERGROUND_KEY`, `METEOSTAT_KEY`, `OPENTRIPMAP_API_KEY`. Dev: `vite.config.js` `loadEnv(..., '')` merges **all** env into `process.env` for local API handlers. |
| **PWA** | `vite-plugin-pwa` (autoUpdate), `public/manifest.json`, Workbox runtime caching for `/api/*` and map tiles. Dev clears SW/caches in `index.html` + `main.jsx`. |
| **Path aliases** | `@/*` → `./src/*` (`jsconfig.json` + Vite `resolve.alias`). |
| **Lint / test / build** | ESLint 9 flat config (`eslint.config.js`). Scripts: `dev`, `build`, `preview`, `lint`, `test:weather-sources` (Node script, not a unit-test runner). **No** Vitest/Jest/Playwright app test suite. |
| **Deploy target** | **Vercel** (documented in README; `vercel.json` present). |
| **Size (rough)** | ~4 page components, ~10 hooks, ~60 UI primitives, 26 server API files, ~17k lines under `src/` + `api/`. Small route surface, large API/data surface. |

### Current route map

| Path | Page | Notes |
| --- | --- | --- |
| `/` | `HomePage` | Weather consensus, charts, warnings, AQI |
| `/radar/` | `RadarPage` | Leaflet; ČHMÚ + RainViewer |
| `/hydro/` | `HydroPage` | ČHMÚ hydro; Czech-only nav item |
| `/settings/` | `SettingsPage` | Location search/favorites |

Navigation today: imperative `navigate('/radar/')` from `AppChrome` and pages — not `<Link>`.

---

## 2. Reference scaffold (what “current Start” looks like)

**Exact create command used (outside this repo):**

```bash
mkdir -p /tmp/tanstack-start-scratch
cd /tmp/tanstack-start-scratch
npx @tanstack/cli@latest create tanstack-start-reference --agent --package-manager npm --tailwind
```

Notes from the CLI run:

- `--package-manager npm` matches this repo.
- `--tailwind` is **deprecated and ignored**; Tailwind is always enabled in Start scaffolds.
- Scaffold location: `/tmp/tanstack-start-scratch/tanstack-start-reference` (disposable; not part of production tree).

**Resolved scaffold stack (npm lock, representative):**

| Package | Resolved |
| --- | --- |
| `@tanstack/react-start` | 1.168.32 |
| `@tanstack/react-router` | 1.170.18 |
| `vite` | 8.1.5 |
| `react` / `react-dom` | 19.2.7 |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.x |
| `typescript` | 6.0.3 |
| `vitest` | 4.1.10 |

**Layout conventions observed:**

```
src/
  router.tsx          # export function getRouter()
  routeTree.gen.ts    # generated — do not hand-edit
  styles.css
  routes/
    __root.tsx        # document shell: head, HeadContent, Scripts
    index.tsx
    about.tsx
  components/
vite.config.ts        # plugins: devtools(), tailwindcss(), tanstackStart(), viteReact()
tsr.config.json       # { "target": "react" }
package.json          # "imports": { "#/*": "./src/*" }, scripts: dev/build/preview/test/generate-routes
```

**Vite plugin order in scaffold:** `@tanstack/devtools-vite` first, then Tailwind, `tanstackStart()`, `@vitejs/plugin-react`. Path aliases via `resolve: { tsconfigPaths: true }` (Vite 8) + `tsconfig` paths `#/*` and `@/*`.

**Intent commands run inside the reference:**

```bash
cd /tmp/tanstack-start-scratch/tanstack-start-reference
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
```

Skills loaded for this plan (see also `AGENTS.md`):

- `@tanstack/start-client-core#start-core`
- `@tanstack/start-client-core#start-core/deployment` (SPA / selective SSR / hosting)
- `@tanstack/start-client-core#start-core/execution-model` (env boundaries, isomorphic default)
- `@tanstack/start-client-core#start-core/server-functions`
- `@tanstack/start-client-core#start-core/server-routes`
- `@tanstack/router-core#router-core`
- `@tanstack/router-core#router-core/data-loading`
- `@tanstack/router-core#router-core/navigation`
- `@tanstack/router-plugin#router-plugin`
- `@tanstack/react-start#react-start`
- `@tanstack/react-start#lifecycle/migrate-from-nextjs` (checklist structure only — source app is Vite SPA, not Next)

Guides consulted: Routing, SPA Mode, Environment Variables, Environment Functions (via execution-model skill), Server Routes, Tailwind Integration, Path Aliases, Hosting (Vercel → Nitro), CSS Styling, Next.js migrate guide (structure only). There is **no** dedicated “migrate from Vite SPA” guide; React Router migrate guide is **N/A** (app does not use React Router).

---

## 3. Target-state stack

| Layer | Target | Notes |
| --- | --- | --- |
| Framework | TanStack Start (React) + TanStack Router file routes | Same React UI model |
| Bundler | Vite 8 + `tanstackStart()` (+ Nitro for Vercel) | Keep Vite family; upgrade major |
| Rendering | **Full SSR** (maps via ClientOnly / radar `ssr: false`) | PHP-like; confirmed by product decision |
| Data (client) | Keep hooks + `fetch` initially; optional TanStack Query later | Location-driven; not loader-first |
| Client state | Keep Zustand | Guard browser APIs if any SSR |
| Styling | Keep Tailwind v4 + coss UI tree | Align CSS import with Start `__root` `?url` pattern |
| Auth | None | No Start auth guide needed |
| API | Start **server routes** under `src/routes/api/*` | Replace Vercel `/api` + local Vite plugin |
| Package manager | npm | Unchanged |
| Language | **Open question** — JS-first with `allowJs`, or gradual TS | Scaffold is TS |
| React major | **Open question** — stay 18 vs move to 19 with Start | Scaffold is 19 |
| Lint | Keep ESLint; extend for `src/routes` | |
| Tests | Keep `test:weather-sources`; optional Vitest from scaffold | |
| Deploy | Vercel via **Nitro** Vite plugin (Start hosting guide) | Replace SPA-only `vercel.json` rewrites |

Preserve existing `src/components`, `src/hooks`, `src/api` (client wrappers), `src/store`, `src/utils`, `src/config` unless routing/entry/config force a move. Restructure primarily: entry (`main.jsx` / `index.html`), `router`/`routes`, `vite.config`, and `/api` → Start server routes.

---

## 4. Layer-by-layer mapping (nothing dropped silently)

### 4.1 Routing → TanStack Router file routes

| Today | Start |
| --- | --- |
| `src/routes.js` table | `src/routes/index.tsx`, `radar.tsx` (or `radar/index.tsx`), `hydro.tsx`, `settings.tsx` |
| `src/router.js` `navigate` / `useRoute` | `<Link to="...">`, `useNavigate()`, `useRouterState()` |
| `src/app.jsx` page switch | Router `<Outlet />` from `__root` / layout |
| Trailing `/radar/` | `createRouter({ trailingSlash: 'always' })` **or** normalize links to no slash (`'never'`, default) + redirects |

React Router migrate guide: **not applicable**. Map from custom History API instead (same end state: file routes + typed `Link`).

Suggested files:

```
src/routes/__root.tsx     # html shell, AppChrome chrome, ErrorBoundary
src/routes/index.tsx      # HomePage
src/routes/radar.tsx
src/routes/hydro.tsx
src/routes/settings.tsx
src/router.tsx            # getRouter()
```

### 4.2 Data fetching → hooks now; loaders/Query later

| Today | Start representation |
| --- | --- |
| `useWeather` → `fetch('/api/weather?...')` | **Keep** as client hook calling same URL (now a Start server route). |
| Route `loader` | **Poor first fit** for primary weather: lat/lon come from Zustand/`localStorage`/GPS — not URL. Optional later: encode location in **search params** + `loader`/`loaderDeps`. |
| TanStack Query | **Not present today.** Optional Phase 5+ for caching/deduping consensus fetches. Scaffold includes `@tanstack/react-router-ssr-query` but SPA mode + client hooks do not require it. |
| Direct third-party client fetches | Leave external unless secrets appear (none today on those paths). |

### 4.3 Client state → Zustand

| Today | Start |
| --- | --- |
| Zustand + `localStorage` at store init | Keep. If any SSR/`defaultSsr: true` is chosen: defer `localStorage` with `createClientOnlyFn` / `<ClientOnly>` / hydrate-after-mount (execution-model skill). SPA mode reduces this risk but module-level `localStorage` still fails if code runs during shell prerender. |

### 4.4 Styling → Start Tailwind v4 guide

| Today | Start |
| --- | --- |
| `@tailwindcss/vite` + `src/styles.css` imported from `main.jsx` | Keep plugin; import CSS from `__root` via `import appCss from '../styles.css?url'` and `links: [{ rel: 'stylesheet', href: appCss }]` (scaffold + Tailwind integration guide). |
| coss / Base UI / fonts / charts CSS | Unchanged paths under `src/`; Leaflet CSS stays client-side import (prefer map route `ssr: false` or `<ClientOnly>`). |

### 4.5 Auth

None today → none in target. Do not add Clerk/Auth.js. If auth is added later, use Start auth guides then.

### 4.6 Backend `/api` → Start server routes (preferred)

| Today | Start |
| --- | --- |
| `/api/weather.js` Vercel handler | `src/routes/api/weather.ts` (or `.js`) with `createFileRoute('/api/weather')({ server: { handlers: { GET: ... }}})` |
| Vite `localApiPlugin` | **Remove** — Start serves server routes in `vite dev`. |
| Vercel `/api` filesystem convention | **Cannot keep as-is** once Start owns the server. Closest alternative: Start server routes (same public URLs). Shared logic extracted to `src/server/weather/...` callable from handlers. |
| `(req, res)` + `req.query` | Adapt to Web `Request` / `URLSearchParams` / `Response.json`. Thin adapter per handler or one shared `adaptVercelHandler(handler)`. |
| `createServerFn` | Optional for app-internal RPC later; **keep HTTP `/api/*`** first so existing client `fetch('/api/...')` and PWA NetworkFirst rules stay valid. |
| Cache-Control `s-maxage=...` | Set via `Response` headers / `setResponseHeader` in handlers (same semantics). |

Server routes skill: use for endpoints called from outside / as raw HTTP — matches this app’s design.

### 4.7 Environment variables

| Today | Start (Vite) |
| --- | --- |
| `import.meta.env.VITE_*` in client | **Same** — public client vars keep `VITE_` prefix. |
| Secrets in `process.env` inside `/api` | **Same names**, but read **inside** handler / `createServerFn` `.handler()`, not at module top-level (execution-model + env guide; edge runtimes + bundle safety). |
| `vite.config.js` `loadEnv(..., '')` into `process.env` | Start auto-loads `.env*`. Prefer not re-implementing blanket env injection; configure Vercel project env the same as today. |
| `VITE_ENABLE_OPEN_METEO_DEV_PROXY` | Remains client/dev flag; proxy implementation moves into server route or Start middleware, not Vite custom middleware. |

**Concrete env follow-up (execution checklist):**

1. Keep `.env.example` keys; document which are client (`VITE_`) vs server-only.
2. On Vercel: re-enter the same server secrets for the Nitro/Start deployment (not only legacy Serverless `/api`).
3. Audit every `api/*.js` for module-scope `process.env.X` — move reads into the request handler.
4. Do **not** rename secrets to `VITE_*`.
5. After cutover, verify client bundle does not contain API keys (build grep / source maps check).
6. Restart `vite dev` after any `.env` change (unchanged Vite behavior).

### 4.8 Deployment → Vercel + Nitro

| Today | Start |
| --- | --- |
| Vite static build + Vercel serverless `/api` + SPA rewrite | Install `nitro` (`nitro/vite` plugin) per Hosting guide “Vercel = follow Nitro”. |
| `vercel.json` rewrite `/(.*) → /index.html` | Replace with Start/Nitro output + SPA shell rules: allow `/api/*` (and `/_serverFn/*` if server functions used), rewrite other 404s to SPA shell (`/_shell.html` when `spa.enabled`). |
| Official partners (Cloudflare/Netlify) | Optional later; not required if staying on Vercel. |

### 4.9 PWA (`vite-plugin-pwa`)

| Today | Start |
| --- | --- |
| `VitePWA` in Vite config | **Preserve intent**, but **verify compatibility** with Start/Nitro client output paths and SPA shell. Closest alternative if incompatible: Workbox injectManifest against `dist/client`, or `@vite-pwa/assets` + manual SW. Flagged as risk / open question. |
| `manifest.json` / icons in `public/` | Keep under `public/` (Start serves static assets). |
| Dev SW nuke | Re-express in client entry or root shell script. |

### 4.10 Tooling

| Today | Start |
| --- | --- |
| ESLint flat config | Keep; add ignores for `routeTree.gen.ts`; optional TS parser if adopting TS. |
| No unit tests | Optional adopt Vitest from scaffold — not required for parity. |
| `test:weather-sources` | Keep as Node script; point at shared normalizers/server helpers after API move. |
| Path alias `@` | Keep; scaffold also has `#/*` — pick one public alias (`@`) to avoid dual conventions. |

### 4.11 Integrations that stay as libraries

Unchanged packages (install + import paths only): Zustand, Leaflet/react-leaflet, Recharts, Base UI / coss UI, lucide/react-icons, fontsource/geist, CVA/clsx/tailwind-merge, `node-html-parser` (server-side scrapers).

**Cannot preserve as-is:**

| Item | Why | Closest alternative |
| --- | --- | --- |
| Custom `src/router.js` | Replaced by TanStack Router | File routes + `Link` / `useNavigate` |
| Root `/api` Vercel handlers + `localApiPlugin` | Different server runtime | Start server routes + Nitro |
| Vite 5-only config / no `tanstackStart` | Start requires its Vite plugin (and Vite 6+/8 in practice) | Adopt scaffold plugin set |
| `index.html` → `/src/main.jsx` CSR entry | Start owns document shell via `__root` | `__root.tsx` + Start client entry conventions |
| Assuming `vercel.json` SPA rewrite alone | Nitro/Start change output + server | Hosting guide + SPA redirects |

---

## 5. Rendering shape decision

**Recommendation: SPA mode** (`spa: { enabled: true }`), still using **server routes** for `/api/*`.

Why this fits SmirkPočasí better than default full SSR:

1. Source app is already a client-only PWA with geolocation, `localStorage`, and Leaflet.
2. SEO is secondary (logged-in-to-location weather UI; Czech community PWA).
3. SPA Mode docs explicitly allow pairing with server routes / server functions.
4. Avoids hydration fights with maps, theme, and Zustand/`localStorage` init.
5. Shell prerender still gives a real HTML document + pending fallback.

**Alternatives (do not default without a product decision):**

| Shape | When to choose |
| --- | --- |
| **SPA mode (recommended)** | Parity with today; maps/PWA first. |
| **Hybrid** (`defaultSsr: false` or per-route `ssr: false` on radar/home) | Want SSR later for marketing/SEO pages only. |
| **Full SSR** | Explicit SEO/TTFB goals and willingness to ClientOnly-wrap maps + fix store hydration. |

**Open question OQ-1** must confirm this before implementation.

---

## 6. Phased migration strategy

App size: small route count, large API surface → **feature-branch incremental**, not a multi-app side-by-side forever. Rollback = stay on `main` (current Vite SPA) until cutover; revert Vercel deploy if preview fails.

### Phase 0 — Decisions (no code)

- Resolve open questions in §8 (especially rendering, React major, trailing slashes, PWA, TS).
- Freeze API URL contract: public paths `/api/<name>` stay stable.

**Checkpoint:** Written answers in this doc or a short ADR.

### Phase 1 — Start shell on a branch (foundation)

- Add Start dependencies + `tanstackStart()` / Tailwind / React plugin (match reference order; add Nitro for Vercel).
- Introduce `src/router.tsx`, `src/routes/__root.tsx`, replace CSR `index.html`/`main.jsx` entry with Start conventions.
- Enable **SPA mode**.
- Port **one** route (e.g. Settings) + AppChrome shell; leave other paths temporarily redirecting or stubbed.
- Keep calling existing APIs: either temporarily retain Vercel `/api` in preview **or** migrate one trivial handler first (`/api/geocode` or `/api/weather`).

**Parity checks:** `npm run dev` loads shell; `/settings` navigates; lint passes.  
**Rollback:** abandon branch.

### Phase 2 — All four UI routes

- File routes for `/`, `/radar`, `/hydro`, `/settings`.
- Replace `navigate()` with `Link` / `useNavigate`.
- Configure `trailingSlash` to match decision.
- Wrap Leaflet (`RadarMap`) with `<ClientOnly>` and/or `ssr: false` on radar route.
- Move document meta (title, theme-color, manifest link) into `__root` `head`.

**Parity checks:** Manual click-through of all four pages; bottom nav active states; deep-link refresh works with SPA shell rewrite.

### Phase 3 — API → server routes (bulk of risk)

- For each of 26 handlers: extract pure logic → Start `server.handlers.GET` (etc.).
- Delete `localApiPlugin` once all routes work under `vite dev`.
- Preserve query params, status codes, JSON errors, Cache-Control.
- Secrets: handler-scoped `process.env`.

**Parity checks:** `scripts/weather-source-test.js` (adapted if needed); spot-check weather, geocode, hydro, chmi-radar, rainviewer, warnings, place-image; confirm key providers with flags off/on.  
**Rollback:** branch revert; production still on old `/api`.

### Phase 4 — PWA + Vercel cutover

- Reintegrate PWA plugin or approved alternative; verify SW does not cache HTML shell incorrectly over API.
- Nitro build; configure Vercel; replace `vercel.json` as needed.
- Preview deploy; compare Network panel `/api/*` vs production.

**Parity checks:** Lighthouse installability; offline last-weather behavior; API cache headers on CDN.  
**Rollback:** point Vercel back to previous deployment / `main`.

### Phase 5 — Cleanup & optional upgrades

- Remove dead `src/router.js`, `src/routes.js`, `src/app.jsx`, old `main.jsx` if unused.
- Optional: TanStack Query for consensus waterfall; search-param location; selective SSR experiment.
- Optional: gradual TypeScript for `src/routes` and server handlers only.

**Parity checks:** bundle size sanity; no secret leakage; attribution UI still present.

---

## 7. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Leaflet / browser-only code under isomorphic default | High | SPA mode + `ClientOnly` / `ssr: false` on map routes |
| Zustand `localStorage` at module load during prerender | High | Lazy-read storage after mount; SPA mode |
| Vercel deploy shape change (static+functions → Nitro) | High | Follow Hosting skill; preview project before production |
| `vite-plugin-pwa` vs Start output | Medium | Spike in Phase 1/4; fallback Workbox plan |
| 26 API handlers × req/res adapter bugs | Medium | Shared adapter + weather-source script + checklist |
| React 18 vs 19 / react-leaflet peers | Medium | Decide OQ-2; pin compatible `react-leaflet` major |
| Trailing-slash URL break bookmarks | Low–Med | `trailingSlash: 'always'` or permanent redirects |
| Vite 5 → 8 plugin churn | Medium | Copy reference `vite.config.ts`; drop obsolete local plugin carefully |
| Accidental secret exposure via `VITE_` or module-scope env | High | Env audit in Phase 3; execution-model rules |

---

## 8. Open questions — DECIDED (2026-07-19)

1. **OQ-1 — Rendering:** **Full SSR** (PHP-like server render). Map-heavy routes use `ssr: false` / `<ClientOnly>` where needed. Not SPA mode.
2. **OQ-2 — React major:** **React 19** (newest).
3. **OQ-3 — TypeScript:** **TypeScript all the way.**
4. **OQ-4 — Trailing slashes:** **`never`** (Router default). Nav uses `/radar`, `/hydro`, `/settings`; old trailing-slash URLs normalize away.
5. **OQ-5 — PWA:** **Required** — keep installable PWA behavior through cutover.
6. **OQ-6 — Host:** **Multi-target** — Cloudflare, Vercel, and Docker/Node via Nitro (+ Cloudflare Vite plugin path documented).
7. **OQ-7 — TanStack Query:** **Later** — not part of this execution pass.
8. **OQ-8 — Cutover style:** **Execute in-repo** — migrate the real app; no dual long-running apps.

---

## 9. Follow-up / setup steps when execution starts

1. Answer §8 open questions; update this plan’s “Recommendation” if needed.
2. Create branch `migrate/tanstack-start` (do not overwrite `main` wholesale).
3. Keep disposable reference at `/tmp/tanstack-start-scratch/tanstack-start-reference` (or re-scaffold with the same command) as a layout oracle.
4. Re-run Intent in the **real** app once Start deps exist: `npx @tanstack/intent@latest install && list`, load skills before coding patterns.
5. Add Nitro + SPA mode to Vite config; port `__root` + one route.
6. Migrate `/api` handlers to `src/routes/api/*`; remove `localApiPlugin`.
7. Configure Vercel env (same keys as `.env.example`); preview deploy; then production cutover.
8. Update README deploy section; keep attribution requirements from existing `AGENTS.md`.

---

## 10. Out of scope for this planning pass

- Editing production `src/`, `api/`, or `vite.config.js` for the migration itself.
- Rewriting weather providers or UI design.
- Adding authentication.
- Committing the disposable reference scaffold into this repository.
