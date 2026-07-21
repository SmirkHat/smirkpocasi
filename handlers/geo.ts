/**
 * Approximate client location for "Moje poloha" when GPS is unavailable.
 * Prefer Vercel / Cloudflare edge geo headers, then public IP geolocation.
 */

const USER_AGENT = 'SmirkPocasi/1.0 (https://smirkhat.org; weather app)'

/** Country → approx capital coords when headers only expose a country code. */
const COUNTRY_FALLBACK = {
  CZ: { name: 'Praha', lat: 50.0755, lon: 14.4378 },
  SK: { name: 'Bratislava', lat: 48.1486, lon: 17.1077 },
  DE: { name: 'Berlín', lat: 52.52, lon: 13.405 },
  AT: { name: 'Vídeň', lat: 48.2082, lon: 16.3738 },
  PL: { name: 'Varšava', lat: 52.2297, lon: 21.0122 },
  HU: { name: 'Budapešť', lat: 47.4979, lon: 19.0402 },
  FR: { name: 'Paříž', lat: 48.8566, lon: 2.3522 },
  IT: { name: 'Řím', lat: 41.9028, lon: 12.4964 },
  ES: { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  GB: { name: 'Londýn', lat: 51.5074, lon: -0.1278 },
  US: { name: 'Washington, D.C.', lat: 38.9072, lon: -77.0369 },
  CA: { name: 'Ottawa', lat: 45.4215, lon: -75.6972 },
  CH: { name: 'Bern', lat: 46.948, lon: 7.4474 },
  NL: { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  BE: { name: 'Brusel', lat: 50.8503, lon: 4.3517 },
  SE: { name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
  NO: { name: 'Oslo', lat: 59.9139, lon: 10.7522 },
  DK: { name: 'Kodaň', lat: 55.6761, lon: 12.5683 },
  FI: { name: 'Helsinky', lat: 60.1699, lon: 24.9384 },
  IE: { name: 'Dublin', lat: 53.3498, lon: -6.2603 },
  PT: { name: 'Lisabon', lat: 38.7223, lon: -9.1393 },
  HR: { name: 'Záhřeb', lat: 45.815, lon: 15.9819 },
  SI: { name: 'Lublaň', lat: 46.0569, lon: 14.5058 },
  RO: { name: 'Bukurešť', lat: 44.4268, lon: 26.1025 },
  UA: { name: 'Kyjev', lat: 50.4501, lon: 30.5234 },
}

function header(req, name) {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  if (Array.isArray(raw)) return String(raw[0] || '').trim()
  return String(raw || '').trim()
}

function decodeHeaderValue(value) {
  if (!value) return ''
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function finiteNumber(value) {
  if (value == null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clientIp(req) {
  const forwarded = header(req, 'x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return (
    header(req, 'x-real-ip') ||
    header(req, 'cf-connecting-ip') ||
    header(req, 'x-vercel-forwarded-for').split(',')[0]?.trim() ||
    ''
  )
}

function isPrivateIp(ip) {
  if (!ip) return true
  if (ip === '::1' || ip === '127.0.0.1') return true
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  return false
}

function buildResult({ name, lat, lon, country, region, city, source, accuracy }) {
  const label = [city && city !== name ? city : null, region, country].filter(Boolean).join(' · ')
  return {
    name: name || city || 'Přibližná poloha',
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    ...(label ? { label } : {}),
    ...(country ? { country } : {}),
    source,
    accuracy,
  }
}

function fromEdgeHeaders(req) {
  const vercelLat = finiteNumber(header(req, 'x-vercel-ip-latitude'))
  const vercelLon = finiteNumber(header(req, 'x-vercel-ip-longitude'))
  const vercelCity = decodeHeaderValue(header(req, 'x-vercel-ip-city'))
  const vercelCountry = header(req, 'x-vercel-ip-country').toUpperCase()
  const vercelRegion = decodeHeaderValue(header(req, 'x-vercel-ip-country-region'))

  if (vercelLat != null && vercelLon != null) {
    return buildResult({
      name: vercelCity || 'Přibližná poloha',
      lat: vercelLat,
      lon: vercelLon,
      country: vercelCountry || null,
      region: vercelRegion || null,
      city: vercelCity || null,
      source: 'vercel',
      accuracy: 'ip',
    })
  }

  const cfLat = finiteNumber(header(req, 'cf-iplatitude'))
  const cfLon = finiteNumber(header(req, 'cf-iplongitude'))
  const cfCity = decodeHeaderValue(header(req, 'cf-ipcity'))
  const cfCountry = header(req, 'cf-ipcountry').toUpperCase()
  const cfRegion = decodeHeaderValue(header(req, 'cf-region'))

  if (cfLat != null && cfLon != null) {
    return buildResult({
      name: cfCity || 'Přibližná poloha',
      lat: cfLat,
      lon: cfLon,
      country: cfCountry || null,
      region: cfRegion || null,
      city: cfCity || null,
      source: 'cloudflare',
      accuracy: 'ip',
    })
  }

  const country = vercelCountry || cfCountry
  if (country && COUNTRY_FALLBACK[country]) {
    const fallback = COUNTRY_FALLBACK[country]
    return buildResult({
      name: vercelCity || cfCity || fallback.name,
      lat: fallback.lat,
      lon: fallback.lon,
      country,
      region: vercelRegion || cfRegion || null,
      city: vercelCity || cfCity || fallback.name,
      source: vercelCountry ? 'vercel-country' : 'cloudflare-country',
      accuracy: 'country',
    })
  }

  return null
}

async function fromGeoJs(ip) {
  const url = ip && !isPrivateIp(ip)
    ? `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`
    : 'https://get.geojs.io/v1/ip/geo.json'

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`geojs ${response.status}`)
  const data = await response.json()
  const lat = finiteNumber(data.latitude)
  const lon = finiteNumber(data.longitude)
  if (lat == null || lon == null) return null

  const city = clean(data.city)
  const region = clean(data.region)
  const country = clean(data.country) || clean(data.country_code)?.toUpperCase()

  return buildResult({
    name: city || 'Přibližná poloha',
    lat,
    lon,
    country: country || null,
    region: region || null,
    city: city || null,
    source: 'geojs',
    accuracy: 'ip',
  })
}

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'private, max-age=300')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const edge = fromEdgeHeaders(req)
    if (edge) {
      return res.status(200).json(edge)
    }

    const ip = clientIp(req)
    const ipGeo = await fromGeoJs(ip)
    if (ipGeo) {
      return res.status(200).json(ipGeo)
    }

    return res.status(404).json({
      error: 'Polohu z IP se nepodařilo odhadnout.',
    })
  } catch (error) {
    return res.status(502).json({
      error: error.message || 'Geo lookup failed',
    })
  }
}
