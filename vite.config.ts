import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Nitro client assets: Vercel Build Output API vs Node `.output/public`. */
const pwaOutDir =
  process.env.VERCEL || process.env.NITRO_PRESET === 'vercel'
    ? '.vercel/output/static'
    : '.output/public'

/** Optional absolute API origin (split Vercel UI + VPS API). Used by PWA runtime cache. */
const apiBaseForSw = String(process.env.VITE_API_BASE || '')
  .trim()
  .replace(/\/$/, '')

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    allowedHosts: ['prcek.snapper-darter.ts.net', 'prcek.local'],
  },
  plugins: [
    devtools(),
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
    VitePWA({
      registerType: 'autoUpdate',
      // Emit a small register script into HTML so installability crawlers (PWA Builder) see the SW.
      injectRegister: 'script',
      // Must match Nitro static output or Workbox precaches an empty dist/.
      outDir: pwaOutDir,
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'favicon-96x96.png',
        'apple-touch-icon.png',
        'web-app-manifest-192x192.png',
        'web-app-manifest-512x512.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'screenshots/mobile.png',
        'site.webmanifest',
        'logo.svg',
      ],
      manifest: false,
      integration: {
        configureOptions(_viteConfig, options) {
          // Prefer whichever static dir already has client assets (late generateSW passes).
          const candidates = ['.vercel/output/static', '.output/public', pwaOutDir]
          const found = candidates.find((dir) =>
            existsSync(join(process.cwd(), dir, 'assets')),
          )
          if (found) {
            options.outDir = found
            if (options.workbox && typeof options.workbox === 'object') {
              options.workbox.globDirectory = join(process.cwd(), found)
            }
          }
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Never cache private/geo lookups; avoid SW fighting CORS on failures.
            urlPattern: ({ url }) => url.pathname === '/api/geo',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => {
              if (!url.pathname.startsWith('/api/')) return false
              if (url.pathname === '/api/geo') return false
              // Same-origin /api on the UI host
              if (url.origin === self.location.origin) return true
              if (!apiBaseForSw) return false
              try {
                return url.origin === new URL(apiBaseForSw).origin
              } catch {
                return false
              }
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'smirkpocasi-api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 12 },
            },
          },
          {
            urlPattern: /^https:\/\/(tile.openstreetmap.org|tilecache.rainviewer.com)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'smirkpocasi-map-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
})
