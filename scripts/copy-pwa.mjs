import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const fromDir = join(root, 'dist')
const toDir = join(root, '.output', 'public')

if (!existsSync(fromDir) || !existsSync(toDir)) {
  console.warn('[copy-pwa] skip — dist or .output/public missing')
  process.exit(0)
}

mkdirSync(toDir, { recursive: true })

const sw = join(fromDir, 'sw.js')
if (existsSync(sw)) {
  cpSync(sw, join(toDir, 'sw.js'))
  console.log('[copy-pwa] sw.js')
}

for (const file of readdirSync(fromDir)) {
  if (file.startsWith('workbox-') && file.endsWith('.js')) {
    cpSync(join(fromDir, file), join(toDir, file))
    console.log('[copy-pwa]', file)
  }
}
