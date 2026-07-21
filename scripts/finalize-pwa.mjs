/**
 * After Nitro/Vite finish, generate the service worker against the real static
 * output dir. vite-plugin-pwa often targets empty `dist/` under TanStack Start.
 */
import { generateSW } from 'workbox-build'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const staticDir = ['.vercel/output/static', '.output/public'].find((dir) =>
  existsSync(join(root, dir, 'assets')),
)

if (!staticDir) {
  console.warn('[finalize-pwa] skip — no static assets directory')
  process.exit(0)
}

const globDirectory = join(root, staticDir)

const { count, size, warnings } = await generateSW({
  globDirectory,
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
  globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js'],
  swDest: join(globDirectory, 'sw.js'),
  navigateFallback: undefined,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'smirkpocasi-api',
        networkTimeoutSeconds: 6,
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 12 },
      },
    },
    {
      urlPattern: /^https:\/\/(tile\.openstreetmap\.org|tilecache\.rainviewer\.com)\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'smirkpocasi-map-tiles',
        expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
  ],
})

for (const warning of warnings || []) {
  console.warn('[finalize-pwa]', warning)
}

console.log(
  `[finalize-pwa] precache ${count} entries (${(size / 1024).toFixed(2)} KiB) → ${staticDir}/sw.js`,
)

if (!count) {
  console.error('[finalize-pwa] refusing empty precache')
  process.exit(1)
}
