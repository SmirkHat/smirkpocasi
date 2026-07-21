const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'SmirkPocasi/1.0 (https://smirkhat.org; weather app)';

/** Prefer inhabited places over peaks / admin-only hits. */
const FEATURE_PRIORITY = {
  PPLC: 0,
  PPLA: 1,
  PPLA2: 2,
  PPLA3: 3,
  PPLA4: 4,
  PPL: 5,
  PPLX: 6,
  ADM2: 7,
  ADM3: 8,
  ADM4: 9
};

/** Soft geo bonus (added to population). Never filters results out. */
const NEIGHBOR_COUNTRIES = new Set(['SK', 'PL', 'AT', 'DE']);
const EUROPE_COUNTRIES = new Set([
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GB', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT', 'LU',
  'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI',
  'SJ', 'SK', 'SM', 'UA', 'VA', 'XK'
]);

/** Transliteration variants Open-Meteo / Photon miss under one spelling. */
const QUERY_ALIASES = {
  chernobyl: ['Chornobyl', 'Černobyl'],
  chornobyl: ['Chernobyl', 'Černobyl'],
  cernobyl: ['Chernobyl', 'Chornobyl'],
  pripyat: ['Prypiat', 'Pripyat'],
  prypiat: ['Pripyat', 'Prypiat'],
};
function geoPopulationBonus(countryCode) {
  const code = cleanText(countryCode).toUpperCase();
  if (code === 'CZ') return 500_000;
  if (NEIGHBOR_COUNTRIES.has(code)) return 300_000;
  if (EUROPE_COUNTRIES.has(code)) return 100_000;
  return 0;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('cs-CZ');
}

function uniqueParts(parts) {
  const seen = new Set();
  return parts
    .map(cleanText)
    .filter(Boolean)
    .filter((part) => {
      const key = normalizeText(part);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function featureLabel(code) {
  if (!code) return null;
  if (code.startsWith('PPL')) return 'obec';
  if (code.startsWith('ADM')) return 'území';
  if (code === 'MT') return 'vrchol';
  return null;
}

/** Czech villages often share a name — bake okres into the label (matches Wikipedia titles). */
function disambiguatedPlaceName(item) {
  const name = cleanText(item.name);
  const featureCode = cleanText(item.feature_code);
  const country = cleanText(item.country_code).toUpperCase();
  const districtRaw = cleanText(item.admin2);
  const district = districtRaw.replace(/^okres\s+/iu, '');

  if (!name || !district || normalizeText(district) === normalizeText(name)) return name;
  if (!featureCode.startsWith('PPL') || featureCode === 'PPLC' || featureCode === 'PPLA') return name;

  if (country === 'CZ') return `${name} (okres ${district})`;
  return `${name} (${districtRaw})`;
}

function formatOpenMeteoItem(item) {
  const lat = Number(item?.latitude);
  const lon = Number(item?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const baseName = cleanText(item.name);
  if (!baseName) return null;

  const name = disambiguatedPlaceName(item) || baseName;
  const adminParts = uniqueParts([item.admin3, item.admin2, item.admin1, item.country]);
  // Compare against bare name only — okres in "(okres X)" must stay in subtitle for UI
  // after formatPlaceName strips the parenthetical from the title line.
  const subtitleParts = adminParts.filter((part) => {
    const key = normalizeText(part);
    return key !== normalizeText(baseName) && !normalizeText(baseName).includes(key);
  });
  const label = featureLabel(item.feature_code);
  const fullName = uniqueParts([name, ...subtitleParts]).join(', ');

  return {
    id: String(item.id || `${lat.toFixed(6)}:${lon.toFixed(6)}:${normalizeText(fullName)}`),
    name,
    label,
    subtitle: subtitleParts.length ? subtitleParts.join(', ') : null,
    fullName,
    lat,
    lon,
    type: cleanText(item.feature_code) || 'place',
    source: 'Open-Meteo',
    population: Number(item.population) || 0,
    countryCode: cleanText(item.country_code).toUpperCase(),
    featureCode: cleanText(item.feature_code),
    baseName,
  };
}

/** Skip streets, stops, POIs — weather suggest wants settlements. */
const PHOTON_PLACE_VALUES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'suburb',
  'borough',
  'neighbourhood',
  'neighborhood',
  'locality',
  'quarter',
  'province',
  'county',
  'district',
  'region',
  'state',
]);

function isUsefulPhotonFeature(props) {
  const key = cleanText(props?.osm_key).toLowerCase();
  const value = cleanText(props?.osm_value).toLowerCase();
  if (!key) return false;
  if (key === 'place') return PHOTON_PLACE_VALUES.has(value);
  if (key === 'boundary' && (value === 'administrative' || value === 'historic')) return true;
  // Chernobyl plant / exclusion zone etc. when searching that name.
  if (key === 'landuse' && /industrial|military/u.test(value)) return true;
  if (key === 'military') return true;
  return false;
}

function photonFeatureCode(props) {
  const value = cleanText(props?.osm_value).toLowerCase();
  const type = cleanText(props?.type).toLowerCase();
  // Prefer OSM value — Photon's `type=city` is also used for towns/municipalities.
  if (value === 'city') return 'PPLA';
  if (value === 'town' || value === 'municipality') return 'PPL';
  if (value === 'village' || value === 'hamlet' || value === 'locality') return 'PPL';
  if (value === 'suburb' || value === 'borough' || value === 'neighbourhood') return 'PPLX';
  if (type === 'city') return 'PPLA';
  if (type === 'locality') return 'PPL';
  if (type === 'district') return 'PPLX';
  if (props?.osm_key === 'boundary') return 'ADM3';
  if (props?.osm_key === 'landuse' || props?.osm_key === 'military') return 'ADM3';
  return 'PPL';
}

function formatPhotonItem(feature) {
  const props = feature?.properties || {};
  if (!isUsefulPhotonFeature(props)) return null;

  const coords = feature?.geometry?.coordinates;
  const lon = Number(coords?.[0]);
  const lat = Number(coords?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const baseName = cleanText(props.name);
  if (!baseName) return null;

  const countryCode = cleanText(props.countrycode).toUpperCase();
  const country = cleanText(props.country);
  const admin1 = cleanText(props.state);
  const admin2 = cleanText(props.county || props.district);
  const featureCode = photonFeatureCode(props);

  const synthetic = {
    name: baseName,
    feature_code: featureCode,
    country_code: countryCode,
    admin2,
  };
  const name = disambiguatedPlaceName(synthetic) || baseName;
  const adminParts = uniqueParts([admin2, admin1, country]);
  const subtitleParts = adminParts.filter((part) => {
    const key = normalizeText(part);
    return key !== normalizeText(baseName) && !normalizeText(baseName).includes(key);
  });
  const fullName = uniqueParts([name, ...subtitleParts]).join(', ');
  const osmId = props.osm_id != null ? `${props.osm_type || 'n'}${props.osm_id}` : null;

  return {
    id: String(osmId || `${lat.toFixed(6)}:${lon.toFixed(6)}:${normalizeText(fullName)}`),
    name,
    label: featureLabel(featureCode),
    subtitle: subtitleParts.length ? subtitleParts.join(', ') : null,
    fullName,
    lat,
    lon,
    type: featureCode,
    source: 'Photon',
    population: 0,
    countryCode,
    featureCode,
    baseName,
  };
}

function nominatimFeatureCode(item) {
  const type = cleanText(item.type).toLowerCase();
  const cls = cleanText(item.class).toLowerCase();
  if (type === 'city' || type === 'municipality') return 'PPLA';
  if (type === 'town') return 'PPL';
  if (type === 'village' || type === 'hamlet' || type === 'locality') return 'PPL';
  if (type === 'administrative' || cls === 'boundary') return 'ADM3';
  if (type === 'suburb' || type === 'neighbourhood') return 'PPLX';
  return 'PPL';
}

function formatNominatimItem(item) {
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const address = item.address || {};
  const baseName = cleanText(
    item.name
    || address.city
    || address.town
    || address.village
    || address.municipality
    || address.hamlet
    || String(item.display_name || '').split(',')[0]
  );
  if (!baseName) return null;

  const countryCode = cleanText(address.country_code || item.country_code).toUpperCase();
  const country = cleanText(address.country || item.country);
  const admin1 = cleanText(address.state || address.region || address.county);
  const admin2 = cleanText(address.county || address.district || address.state_district);
  const featureCode = nominatimFeatureCode(item);

  const synthetic = {
    name: baseName,
    feature_code: featureCode,
    country_code: countryCode,
    admin2,
  };
  const name = disambiguatedPlaceName(synthetic) || baseName;
  const adminParts = uniqueParts([admin2, admin1, country]);
  const subtitleParts = adminParts.filter((part) => {
    const key = normalizeText(part);
    return key !== normalizeText(baseName) && !normalizeText(baseName).includes(key);
  });
  const fullName = uniqueParts([name, ...subtitleParts]).join(', ');

  return {
    id: String(item.place_id || `${lat.toFixed(6)}:${lon.toFixed(6)}:${normalizeText(fullName)}`),
    name,
    label: featureLabel(featureCode),
    subtitle: subtitleParts.length ? subtitleParts.join(', ') : null,
    fullName,
    lat,
    lon,
    type: featureCode,
    source: 'Nominatim',
    population: Number(item.extratags?.population) || 0,
    countryCode,
    featureCode,
    baseName,
  };
}

function rankSuggestion(item, queryNorms) {
  const nameNorm = normalizeText(item.baseName || item.name);
  const exactName = [...queryNorms].some((q) => nameNorm === q)
    ? 0
    : [...queryNorms].some((q) => nameNorm.startsWith(q) || q.startsWith(nameNorm))
      ? 1
      : 2;
  const featureRank = FEATURE_PRIORITY[item.featureCode || item.type] ?? 50;
  const population = Number(item.population) || 0;
  // Exact foreign hits (Chernobyl/UA) must beat soft CZ population bonus on weak local namesakes.
  const exactForeignBoost = exactName === 0 && item.countryCode && item.countryCode !== 'CZ' ? 2_000_000 : 0;
  // Prefer Open-Meteo population data, then Photon settlements, then Nominatim.
  const sourceBoost = item.source === 'Open-Meteo' ? 50_000 : item.source === 'Photon' ? 25_000 : 0;
  const effectivePopulation = population + geoPopulationBonus(item.countryCode) + exactForeignBoost + sourceBoost;
  return exactName * 1e14 + featureRank * 1e9 - effectivePopulation;
}

function dedupeSuggestions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.lat.toFixed(3)}:${item.lon.toFixed(3)}:${normalizeText(item.baseName || item.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publicSuggestion(item) {
  return {
    id: item.id,
    name: item.name,
    label: item.label,
    subtitle: item.subtitle,
    fullName: item.fullName,
    lat: item.lat,
    lon: item.lon,
    type: item.type,
    source: item.source,
  };
}

async function fetchOpenMeteoSuggestions(query) {
  const params = new URLSearchParams({
    name: query,
    count: '40',
    language: 'cs',
    format: 'json'
  });

  const response = await fetch(`${OPEN_METEO_GEOCODE_URL}?${params}`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.reason || data?.error || `Open-Meteo geocoding ${response.status}`);
    error.statusCode = response.status;
    error.detail = data;
    throw error;
  }

  return (data.results || []).map(formatOpenMeteoItem).filter(Boolean);
}

async function fetchPhotonSuggestions(query) {
  // Photon public instance: lang cs is unsupported (default/de/en/fr only).
  const params = new URLSearchParams({
    q: query,
    lang: 'en',
    limit: '12',
  });

  const response = await fetch(`${PHOTON_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || `Photon ${response.status}`);
    error.statusCode = response.status;
    error.detail = data;
    throw error;
  }

  return (data?.features || []).map(formatPhotonItem).filter(Boolean);
}

async function fetchNominatimSuggestions(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    extratags: '1',
    limit: '8',
    'accept-language': 'cs',
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`Nominatim ${response.status}`);
    error.statusCode = response.status;
    error.detail = data;
    throw error;
  }

  return (Array.isArray(data) ? data : []).map(formatNominatimItem).filter(Boolean);
}

function isSettlementFeature(item) {
  return cleanText(item.featureCode || item.type).startsWith('PPL');
}

function aliasQueriesFor(query) {
  const key = normalizeText(query).replace(/\s+/gu, '');
  return QUERY_ALIASES[key] || [];
}

function queryMatchNorms(query) {
  return new Set([
    normalizeText(query),
    ...aliasQueriesFor(query).map((alias) => normalizeText(alias)),
  ]);
}

function nameMatchesAnyQuery(nameNorm, queryNorms) {
  for (const queryNorm of queryNorms) {
    if (nameNorm === queryNorm || nameNorm.startsWith(queryNorm) || queryNorm.startsWith(nameNorm)) {
      return true;
    }
  }
  return false;
}

/** Settlement with exact/prefix name — not just a military zone or street-adjacent hit. */
function hasStrongSettlementMatch(items, queryNorms) {
  return items.some((item) => {
    if (!isSettlementFeature(item)) return false;
    const nameNorm = normalizeText(item.baseName || item.name);
    return nameMatchesAnyQuery(nameNorm, queryNorms);
  });
}

async function expandWithAliases(fetchFn, query, primary) {
  const aliases = aliasQueriesFor(query);
  if (!aliases.length) return primary;
  const extras = await Promise.all(aliases.map((alias) => fetchFn(alias).catch(() => [])));
  return dedupeSuggestions([...primary, ...extras.flat()]);
}

export default async function handler(req, res) {
  const query = String(req.query.q || '').trim();

  if (query.length < 2) {
    res.status(400).json({ error: 'Zadej alespoň 2 znaky.' });
    return;
  }

  try {
    const queryNorms = queryMatchNorms(query);
    const [openMeteoResult, photonResult] = await Promise.allSettled([
      fetchOpenMeteoSuggestions(query),
      fetchPhotonSuggestions(query),
    ]);

    let openMeteo = openMeteoResult.status === 'fulfilled' ? openMeteoResult.value : [];
    let photon = photonResult.status === 'fulfilled' ? photonResult.value : [];

    // Known transliterations (Chernobyl ↔ Chornobyl) when the typed spelling is weak.
    if (!hasStrongSettlementMatch([...openMeteo, ...photon], queryNorms)) {
      [openMeteo, photon] = await Promise.all([
        expandWithAliases(fetchOpenMeteoSuggestions, query, openMeteo),
        expandWithAliases(fetchPhotonSuggestions, query, photon),
      ]);
    }

    let merged = dedupeSuggestions([...openMeteo, ...photon]);

    // Nominatim only when both primary sources miss a settlement name hit (rate-limited).
    if (merged.length === 0 || !hasStrongSettlementMatch(merged, queryNorms)) {
      const nominatim = await fetchNominatimSuggestions(query).catch(() => []);
      merged = dedupeSuggestions([...merged, ...nominatim]);
    }

    if (
      openMeteoResult.status === 'rejected'
      && photonResult.status === 'rejected'
      && merged.length === 0
    ) {
      throw openMeteoResult.reason || photonResult.reason || new Error('Geocoding unavailable.');
    }

    const ranked = [...merged]
      .sort((a, b) => rankSuggestion(a, queryNorms) - rankSuggestion(b, queryNorms))
      .map(publicSuggestion)
      .slice(0, 8);

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(ranked);
  } catch (error) {
    res.status(error.statusCode || 502).json({
      error: error.message || 'Našeptávání lokací je nedostupné.',
      ...(error.detail ? { detail: error.detail } : {})
    });
  }
}
