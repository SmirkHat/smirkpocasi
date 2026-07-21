# Agent rules — SmirkPočasí

## Code
- Add comments only when the code cannot explain the intent on its own. Explain why, not what.
- Avoid unnecessary abstractions. Prefer readability over DRY at any cost.
- Each function should do one thing.
- Do not commit unresolved task-marker comments. Fix the issue or open a tracked issue instead.

## Architecture
- App is **TanStack Start** (React 19 + TypeScript) with file routes in `src/routes`.
- Public HTTP APIs are Start **server routes** in `src/routes/api/*`, wrapping handlers in `/handlers` via `adaptVercelHandler`. Prefer Web `Request`/`Response` for new endpoints.
- Global state uses Zustand. Do not add Redux or React Context for global app data.
- Data fetching belongs in hooks (TanStack Query later). No classes and no HOCs for data.
- Browser-only UI (Leaflet maps) must use `<ClientOnly>` or `ssr: false` on the route.
- Read server secrets from `process.env` inside handlers only — never at module scope, never with a `VITE_` prefix.

## Dependencies
- Before adding a dependency, ask whether it can be written in 10 clear lines without it.
- Prefer dependencies with zero or minimal transitive dependencies.

## Git
- Commit messages may be Czech or English, but must be descriptive.
- Avoid vague messages like "fix", "update", or "changes". Explain what changed and why.

## Licensing
- Use only dependencies compatible with the MIT license.
- When using third-party data, verify usage terms and add attribution in the UI.

---

## TanStack Start migration

Full plan and decisions: **[MIGRATION_PLAN.md](./MIGRATION_PLAN.md)**.

### Decisions locked in

1. **SSR** (not SPA mode); maps via `ClientOnly` / `ssr: false` on `/radar`
2. **React 19**
3. **TypeScript** throughout
4. **Trailing slash: never**
5. **PWA required** (`vite-plugin-pwa` + `PwaRegister`)
6. **Multi-host:** Nitro → Vercel / Docker / Node; Cloudflare via `wrangler.jsonc` + CF Vite plugin (not both at once)
7. **TanStack Query:** later
8. **In-repo cutover** (this branch of work)

### Reference scaffold (disposable)

```bash
mkdir -p /tmp/tanstack-start-scratch && cd /tmp/tanstack-start-scratch
npx @tanstack/cli@latest create tanstack-start-reference --agent --package-manager npm --tailwind
```

### Intent

```bash
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/deployment
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/execution-model
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-routes
```

### Scripts

- `npm run dev` — Vite Start SSR dev server
- `npm run build` — client + Nitro server
- `npm run start` — `node .output/server/index.mjs`
- `npm run generate-routes` — TanStack Router codegen
