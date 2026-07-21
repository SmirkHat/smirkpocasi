import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

/** Where vite-plugin-pwa / Nitro may have written the SW. */
const sourceCandidates = [
  join(root, '.vercel', 'output', 'static'),
  join(root, '.output', 'public'),
  join(root, 'dist'),
]

const fromDir = sourceCandidates.find((dir) => existsSync(join(dir, 'sw.js')))

/** Deploy static dirs that should serve the SW at /sw.js. */
const targets = [
  join(root, '.vercel', 'output', 'static'),
  join(root, '.output', 'public'),
].filter((dir) => existsSync(dir))

if (!fromDir || !targets.length) {
  console.warn('[copy-pwa] skip — sw.js or static output dir missing')
  process.exit(0)
}

const files = ['sw.js']
for (const file of readdirSync(fromDir)) {
  if (file.startsWith('workbox-') && file.endsWith('.js')) files.push(file)
}

for (const toDir of targets) {
  if (toDir === fromDir) {
    console.log('[copy-pwa] already in place:', toDir)
    continue
  }
  mkdirSync(toDir, { recursive: true })
  for (const file of files) {
    cpSync(join(fromDir, file), join(toDir, file))
    console.log('[copy-pwa]', file, '→', toDir)
  }
}
