/**
 * Capture PWA store screenshots (Praha default location).
 * Usage: node scripts/capture-pwa-screenshots.mjs [baseUrl]
 * Needs playwright available (npm i -D playwright && npx playwright install chromium).
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = require('/config/.nvm/versions/node/v25.9.0/lib/node_modules/playwright'))
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'screenshots')
const baseUrl = (process.argv[2] || 'http://localhost:3003').replace(/\/$/, '')

const PRAHA = { name: 'Praha', lat: 50.0755, lon: 14.4378 }

mkdirSync(outDir, { recursive: true })

const shots = [
  { name: 'mobile.png', width: 390, height: 844 },
  // Taller than 720 so the forecast chart card has room to paint.
  { name: 'desktop.png', width: 1280, height: 900 },
]

/** Wait until hero CSS background URL is set and the bitmap has finished decoding. */
async function waitForHeroPhoto(page) {
  // Credit line = place-image JSON applied in React.
  await page.getByText(/Foto:/i).first().waitFor({
    state: 'visible',
    timeout: 120_000,
  })

  // Sync predicate only — async waitForFunction resolves too early (Promise is truthy).
  await page.waitForFunction(() => {
    const hero = document.querySelector('section[aria-label^="Aktuální počasí"]')
    if (!hero) return false
    const bg = getComputedStyle(hero).backgroundImage || ''
    return /url\(["']?https?:\/\//.test(bg)
  }, { timeout: 60_000 })

  const src = await page.evaluate(() => {
    const hero = document.querySelector('section[aria-label^="Aktuální počasí"]')
    const bg = getComputedStyle(hero).backgroundImage || ''
    return bg.match(/url\(["']?(.*?)["']?\)/)?.[1] || ''
  })
  if (!src) throw new Error('Hero background URL missing after wait')

  // Decode the same URL the CSS uses (Wikimedia can take a while).
  await page.evaluate(
    (url) =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => reject(new Error(`Failed to decode hero image: ${url}`))
        img.src = url
      }),
    src,
  )

  // Give the browser time to paint the CSS background.
  await page.waitForTimeout(3000)
}

const browser = await chromium.launch({ headless: true })

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'cs-CZ',
  })

  await context.addInitScript((location) => {
    localStorage.setItem('smirkpocasi:selected-location', JSON.stringify(location))
    localStorage.setItem('smirkpocasi:favorites', JSON.stringify([location]))
    localStorage.setItem('smirkpocasi:install-dismissed', String(Date.now()))
  }, PRAHA)

  const page = await context.newPage()

  const placeImageResponse = page.waitForResponse(
    (res) => res.url().includes('/api/place-image') && res.ok(),
    { timeout: 120_000 },
  )

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page
    .addStyleTag({
      content: `
      [data-tsd], .tsqd-parent-container, #tanstack-devtools,
      iframe[src*="tanstack"], button[aria-label*="TanStack"] { display: none !important; }
    `,
    })
    .catch(() => {})

  await page.getByText('Praha', { exact: false }).first().waitFor({ timeout: 60_000 })
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || ''
      return /\d+\s*°/.test(text) && !/Načítám|Loading/i.test(text)
    },
    { timeout: 90_000 },
  )

  await placeImageResponse
  await waitForHeroPhoto(page)

  const tempTab = page.getByRole('tab', { name: /Teplota/i })
  if (await tempTab.count()) {
    await tempTab.first().click().catch(() => {})
  }
  await page
    .locator('.recharts-wrapper svg path, svg.recharts-surface path')
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 })
    .catch(() => {})
  await page.waitForTimeout(1500)

  const path = join(outDir, shot.name)
  await page.screenshot({ path, type: 'png' })

  const info = await page.evaluate(() => {
    const hero = document.querySelector('section[aria-label^="Aktuální počasí"]')
    return {
      hasFoto: /Foto:/i.test(document.body.innerText),
      bg: (hero ? getComputedStyle(hero).backgroundImage : '').slice(0, 100),
    }
  })
  console.log(
    `[screenshots] ${shot.name} (${shot.width}×${shot.height}) foto=${info.hasFoto} bg=${info.bg ? 'yes' : 'no'} → ${path}`,
  )
  await context.close()
}

await browser.close()
console.log('[screenshots] done')
