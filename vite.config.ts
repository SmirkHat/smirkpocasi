import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
    ...VitePWA({
      registerType: 'autoUpdate',
      // Registration is an inline <script> in __root.tsx (PWABuilder needs it in HTML, not React).
      injectRegister: false,
      filename: 'sw.js',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'favicon-96x96.png',
        'apple-touch-icon.png',
        'web-app-manifest-192x192.png',
        'web-app-manifest-512x512.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'site.webmanifest',
        'logo.svg',
      ],
      manifest: false,
      integration: {
        configureOptions(viteConfig, options) {
          // Nitro picks the static dir per preset (.output/public, .vercel/output/static).
          options.outDir = viteConfig.environments.client.build.outDir
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Only answers that do not age. Weather stays out on purpose: the hooks stamp whatever
            // a fetch returns as fresh, so a cached copy would pass for current weather.
            urlPattern: ({ url }) => url.pathname === '/api/geocode' || url.pathname === '/api/place-image',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'smirkpocasi-api',
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
      },
    }).map((plugin) => ({
      ...plugin,
      // Nitro records each public file's size after the client build and serves exactly that many
      // bytes, so regenerating sw.js in a later environment would reach the browser truncated.
      applyToEnvironment: (environment) => environment.name === 'client',
    })),
  ],
})
