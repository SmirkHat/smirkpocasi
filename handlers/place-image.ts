const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const OPENVERSE_API_URL = 'https://api.openverse.org/v1/images/';
const OPENTRIPMAP_API_BASE = 'https://api.opentripmap.com/0.1';
const USER_AGENT = 'SmirkPocasi/1.0 (https://smirkhat.org; weather app)';
const SEARCH_RADIUS_METERS = 10000;
const OPENTRIPMAP_RADIUS_METERS = 15000;
const TITLE_MAX_DISTANCE_METERS = 15000;
const OPENTRIPMAP_MAX_DISTANCE_METERS = 15000;
const OPENTRIPMAP_LANG = 'en';
const THUMB_WIDTH = 1920;
/** In-process cache — survives warm instances; CDN also gets s-maxage below. */
const MEMORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEMORY_MAX_ENTRIES = 400;
const memoryCache = new Map();
const inFlight = new Map();

function memoryCacheKey(lat, lon, name) {
  const title = String(name || '')
    .split(',')[0]
    .trim()
    .toLocaleLowerCase('cs-CZ');
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}:${title}`;
}

function readMemoryCache(key) {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.at >= MEMORY_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  // Refresh LRU order.
  memoryCache.delete(key);
  memoryCache.set(key, cached);
  return cached.payload;
}

function writeMemoryCache(key, payload) {
  memoryCache.set(key, { at: Date.now(), payload });
  while (memoryCache.size > MEMORY_MAX_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
}

const WIKIMEDIA_PROJECTS = [
  { host: 'cs.wikipedia.org', source: 'Wikipedia (cs)' },
  { host: 'en.wikipedia.org', source: 'Wikipedia (en)' },
  { host: 'cs.wikivoyage.org', source: 'Wikivoyage (cs)' },
  { host: 'en.wikivoyage.org', source: 'Wikivoyage (en)' }
];

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .trim();
}

function hasPhotoExtension(value) {
  const path = String(value || '').split(/[?#]/u)[0].toLowerCase();
  return /\.(jpe?g|png|webp)$/u.test(path);
}

function hasBadPhotoToken(value) {
  const text = normalizeText(value);
  return /(coat[_ -]?of[_ -]?arms|wappen|(?:^|[_ -])herb(?:[_ -.]|$)|(?:^|[_ -])flag(?:[_ -.]|$)|vlajka|locator|location[_ -]?map|(?:^|[_ -\.])map(?:[_ -\.]|$)|mapa|(?:^|[_ -])seal(?:[_ -.]|$)|(?:^|[_ -])logo(?:[_ -.]|$)|montage|montaz|collage|kolaz|mosaic|mozaik|(?:red|blue|green)[_ -]?pog|pog\.png|map[_ -]?pin|map[_ -]?marker|(?:^|[_ -])pin(?:[_ -.]|$)|pointer|pictogram|(?:^|[_ -])symbol(?:[_ -.]|$)|(?:^|[_ -])icon(?:[_ -.]|$)|(?:^|[_ -])badge(?:[_ -.]|$)|(?:^|[_ -])button(?:[_ -.]|$)|commons[_ -]?logo|(?:^|[_ -])(?:film|movie|cinema|kino)(?:[_ -.]|$)|film[_ -]?poster|movie[_ -]?poster|theatrical[_ -]?poster|dvd[_ -]?cover|blu[_ -]?ray|bluray|cover[_ -]?art|box[_ -]?art|affiche|(?:^|[_ -])plakat(?:[_ -.]|$)|screenshot|screencap|screen[_ -]?capture|trailer|promotional[_ -]?still|movie[_ -]?still|film[_ -]?still|lobby[_ -]?card)/u.test(text);
}

/** Parentheticals that mean a creative work, not a geographic place. */
function isMediaOrWorkDisambiguator(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (/^(film|movie|movies|tv|televize|serial|serie|series|album|song|pisnick|singl|ep|kniha|book|novel|roman|divadlo|hra|game|videohra|software|aplikace|band|skupina|osobnost|herec|herecka|singer|zpev[aá]k)/u.test(text)) {
    return true;
  }
  return /\b(film|movie|album|song|novel|soundtrack|poster|dvd)\b/u.test(text);
}

function titleLooksLikePlace(candidateTitle, placeTitle) {
  const normalizedPlace = normalizeText(placeTitle);
  const normalizedTitle = normalizeText(candidateTitle);
  if (!normalizedPlace || !normalizedTitle) return false;

  const paren = String(candidateTitle).match(/\(([^)]+)\)\s*$/u);
  if (paren && isMediaOrWorkDisambiguator(paren[1])) return false;

  return normalizedTitle === normalizedPlace
    || normalizedTitle.startsWith(`${normalizedPlace} (`)
    || normalizedTitle.startsWith(`${normalizedPlace},`);
}

function isNonPlaceArticleTitle(title) {
  const paren = String(title || '').match(/\(([^)]+)\)\s*$/u);
  return Boolean(paren && isMediaOrWorkDisambiguator(paren[1]));
}

const MIN_IMAGE_EDGE_PX = 480;

function isDisambiguationPage(page) {
  if (page?.pageprops && Object.hasOwn(page.pageprops, 'disambiguation')) return true;
  const title = normalizeText(page?.title);
  return title.includes('rozcestnik')
    || title.includes('disambiguation')
    || /\(disambiguation\)$/u.test(title);
}

function stripFilePrefix(filename) {
  return String(filename || '').replace(/^(?:file|soubor|media):/iu, '').trim();
}

function isLikelyPhoto(filename) {
  const name = stripFilePrefix(filename);
  return hasPhotoExtension(name) && !hasBadPhotoToken(name);
}

function isLikelyPhotoRecord(record) {
  const filetype = String(record?.filetype || '').toLowerCase();
  const value = record?.url || record?.imageUrl || '';
  const searchable = [
    record?.url,
    record?.imageUrl,
    record?.title,
    record?.categories,
    record?.description,
  ].filter(Boolean).join(' ');
  if (hasBadPhotoToken(searchable)) return false;
  if (filetype && !['jpg', 'jpeg', 'png', 'webp'].includes(filetype)) return false;
  if (filetype && !/\.(jpe?g|png|webp)(?:[?#].*)?$/iu.test(String(value))) {
    return isLikelyPhoto(`${record?.title || 'image'}.${filetype}`);
  }
  return isLikelyPhoto(value);
}

function normalizeWikimediaThumbnailUrl(url) {
  const value = String(url || '');
  if (!value.includes('/thumb/')) return value || null;
  return value.replace(/\/\d+px-([^/?#]+)(?=([?#]|$))/u, `/${THUMB_WIDTH}px-$1`);
}

function pageDistance(page) {
  return page.coordinates?.[0]?.dist ?? Number.POSITIVE_INFINITY;
}

function coordinateDistanceMeters(latA, lonA, latB, lonB) {
  const firstLat = Number(latA);
  const firstLon = Number(lonA);
  const secondLat = Number(latB);
  const secondLon = Number(lonB);
  if (![firstLat, firstLon, secondLat, secondLon].every(Number.isFinite)) return null;

  const toRadians = (value) => value * Math.PI / 180;
  const radius = 6371000;
  const dLat = toRadians(secondLat - firstLat);
  const dLon = toRadians(secondLon - firstLon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(firstLat)) * Math.cos(toRadians(secondLat)) * Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pageCoordinateDistance(page, lat, lon) {
  const coordinate = page.coordinates?.[0];
  if (!coordinate) return null;
  return coordinateDistanceMeters(lat, lon, coordinate.lat, coordinate.lon);
}

function bestNearbyPage(pages) {
  return pages
    .filter((page) => page.pageimage && isLikelyPhoto(page.pageimage))
    .filter((page) => !isNonPlaceArticleTitle(page.title))
    .sort((a, b) => pageDistance(a) - pageDistance(b))[0] || null;
}

function titleCandidate(name) {
  const title = String(name || '').split(',')[0].trim();
  if (title.length < 2 || /^moje poloha$/iu.test(title)) return null;
  return title;
}

/** Build Wikipedia title guesses from "Hrádek, Klatovy, …" or "Hrádek (okres Klatovy)". */
function looksLikeDistrictName(part) {
  const text = normalizeText(part);
  if (!text || text.length > 40) return false;
  // Kraj / country must not become "(okres Plzeňský kraj)".
  if (/(kraj|oblast|republik|country|county|land|state|province|voivod|cesko|slovensko|poland|austria|germany|france)/u.test(text)) {
    return false;
  }
  return true;
}

/** GeoNames/Open-Meteo often miss or rename these; map to Wikipedia titles. */
const PLACE_TITLE_ALIASES = {
  chernobyl: ['Chernobyl', 'Černobyl', 'Chornobyl'],
  chornobyl: ['Chernobyl', 'Černobyl', 'Chornobyl'],
  cernobyl: ['Chernobyl', 'Černobyl', 'Chornobyl'],
  'chornobyl-2': ['Chernobyl', 'Černobyl', 'Chornobyl'],
  pripyat: ['Pripyat', 'Pripjať', 'Припʼять'],
  pripjat: ['Pripyat', 'Pripjať'],
};

function wikiTitleGuesses(name) {
  const parts = String(name || '')
    .split(',')
    .map(cleanText)
    .filter(Boolean);
  if (!parts.length) return [];

  const guesses = [];
  const head = parts[0];
  // Prefer the exact head title first (Klatovy, Praha, …).
  guesses.push(head);

  const bareMatch = head.match(/^(.*?)\s*\((?:okres\s+)?([^)]+)\)\s*$/iu);
  if (bareMatch) {
    guesses.push(cleanText(bareMatch[1]));
  } else if (parts.length >= 2 && looksLikeDistrictName(parts[1])) {
    const place = head;
    const district = parts[1].replace(/^okres\s+/iu, '');
    if (district && normalizeText(district) !== normalizeText(place)) {
      guesses.push(`${place} (okres ${district})`);
      guesses.push(`${place} (${district})`);
    }
  }

  // Famous places Open-Meteo/GeoNames miss or rename (Chornobyl-2, etc.).
  const aliasKey = normalizeText(head).replace(/\s+/gu, '');
  const aliasBase = aliasKey.replace(/-\d+$/u, '');
  const aliases = PLACE_TITLE_ALIASES[aliasKey] || PLACE_TITLE_ALIASES[aliasBase];
  if (aliases) guesses.push(...aliases);

  return [...new Set(guesses.filter(Boolean))];
}

/** True when Wikipedia article is the place the user asked for (not a nearby namesake). */
function isExactPlaceArticle(pageTitle, placeTitle) {
  const page = normalizeText(pageTitle);
  const place = normalizeText(placeTitle);
  const placeBase = place.replace(/-\d+$/u, '');
  if (!page || !place) return false;
  if (page === place || page === placeBase) return true;

  const groupKeys = [place, placeBase, page];
  for (const key of groupKeys) {
    const aliases = PLACE_TITLE_ALIASES[key];
    if (!aliases) continue;
    const group = new Set([key, ...aliases.map((item) => normalizeText(item))]);
    if (group.has(page) && (group.has(place) || group.has(placeBase))) return true;
  }
  return false;
}

/** GPS / pin mode — OpenTripMap nearby POIs are allowed. Named city search is not. */
function isGpsPlace(name) {
  return !titleCandidate(name);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.info || data?.error || `Upstream request failed: ${response.status}`);
  return data;
}

async function queryWikiTitlePages(host, titles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles,
    prop: 'coordinates|pageimages|info|pageprops',
    colimit: '20',
    piprop: 'thumbnail|name|original',
    pithumbsize: String(THUMB_WIDTH),
    ppprop: 'wikibase_item|disambiguation',
    inprop: 'url',
    redirects: '1',
    origin: '*'
  });
  const data = await fetchJson(`https://${host}/w/api.php?${params}`);
  // MediaWiki marks missing pages with missing: "" (falsy), so check the key / pageid.
  return Object.values(data.query?.pages || {}).filter(
    (page) => page && page.pageid > 0 && !Object.hasOwn(page, 'missing')
  );
}

async function searchWikiTitle(host, title) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    list: 'search',
    srsearch: title,
    srlimit: '8',
    srnamespace: '0',
    origin: '*'
  });
  const data = await fetchJson(`https://${host}/w/api.php?${params}`);
  return (data.query?.search || []).map((item) => item.title).filter(Boolean);
}

/** When "Hrádek" is a disambiguation page, pick the article nearest to the weather pin. */
async function resolveTitleNearCoordinates(host, title, lat, lon) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    list: 'geosearch',
    gscoord: `${lat}|${lon}`,
    gsradius: String(TITLE_MAX_DISTANCE_METERS),
    gslimit: '20',
    origin: '*'
  });
  const data = await fetchJson(`https://${host}/w/api.php?${params}`);
  const matches = (data.query?.geosearch || [])
    .filter((item) => titleLooksLikePlace(item.title, title))
    .sort((a, b) => (a.dist || 0) - (b.dist || 0));
  return matches[0]?.title || null;
}

async function searchWikimediaNearby(project, lat, lon) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: String(SEARCH_RADIUS_METERS),
    ggslimit: '20',
    prop: 'coordinates|pageimages|info',
    colimit: '20',
    piprop: 'thumbnail|name|original',
    pithumbsize: String(THUMB_WIDTH),
    inprop: 'url',
    redirects: '1',
    origin: '*'
  });
  const data = await fetchJson(`https://${project.host}/w/api.php?${params}`);
  const page = bestNearbyPage(Object.values(data.query?.pages || {}));
  if (!page) return null;

  return {
    source: project.source,
    title: page.title,
    pageUrl: page.fullurl,
    filename: page.pageimage,
    distanceMeters: pageDistance(page),
    titleMatch: false
  };
}

async function searchWikimediaTitlePage(project, lat, lon, name) {
  const title = titleCandidate(name);
  if (!title) return null;

  const guesses = wikiTitleGuesses(name);
  let page = null;

  for (const guess of guesses) {
    const pages = await queryWikiTitlePages(project.host, guess).catch(() => []);
    const candidate = pages.find((item) => !isDisambiguationPage(item) && !isNonPlaceArticleTitle(item.title));
    if (!candidate) continue;

    const distance = pageCoordinateDistance(candidate, lat, lon);
    const exact = isExactPlaceArticle(candidate.title, guess) || isExactPlaceArticle(candidate.title, title);
    // Exact title match (Chernobyl) must win even when the pin is a nearby alias like Chornobyl-2.
    if (distance != null && distance > TITLE_MAX_DISTANCE_METERS && !exact) continue;

    page = candidate;
    break;
  }

  // Exact title is often a disambiguation page — pick the village nearest the pin.
  if (!page) {
    const nearTitle = await resolveTitleNearCoordinates(project.host, title.replace(/\s*\([^)]*\)\s*$/u, '').trim() || title, lat, lon).catch(() => null);
    if (nearTitle && !isNonPlaceArticleTitle(nearTitle)) {
      const pages = await queryWikiTitlePages(project.host, nearTitle).catch(() => []);
      page = pages.find((item) => !isDisambiguationPage(item) && !isNonPlaceArticleTitle(item.title)) || null;
      if (page) {
        const distance = pageCoordinateDistance(page, lat, lon);
        const exact = isExactPlaceArticle(page.title, title);
        if (distance != null && distance > TITLE_MAX_DISTANCE_METERS && !exact) page = null;
      }
    }
  }

  if (!page) {
    const bareTitle = title.replace(/\s*\([^)]*\)\s*$/u, '').trim() || title;
    const searchHits = await searchWikiTitle(project.host, bareTitle).catch(() => []);
    for (const hit of searchHits.filter((item) => titleLooksLikePlace(item, bareTitle))) {
      const pages = await queryWikiTitlePages(project.host, hit).catch(() => []);
      const candidate = pages.find((item) => !isDisambiguationPage(item) && !isNonPlaceArticleTitle(item.title));
      if (!candidate) continue;
      const distance = pageCoordinateDistance(candidate, lat, lon);
      const exact = isExactPlaceArticle(candidate.title, bareTitle);
      if (distance == null || distance <= TITLE_MAX_DISTANCE_METERS || exact) {
        page = candidate;
        break;
      }
    }
  }

  if (!page || isDisambiguationPage(page) || isNonPlaceArticleTitle(page.title)) return null;

  const distance = pageCoordinateDistance(page, lat, lon);
  const exact = isExactPlaceArticle(page.title, title);
  if (distance != null && distance > TITLE_MAX_DISTANCE_METERS && !exact) return null;

  return {
    source: project.source,
    title: page.title,
    pageUrl: page.fullurl,
    pageimage: page.pageimage || null,
    wikibaseItem: page.pageprops?.wikibase_item || null,
    distanceMeters: distance,
    titleMatch: true
  };
}

async function fetchWikidataP18(entityId) {
  if (!entityId) return null;
  const params = new URLSearchParams({
    action: 'wbgetentities',
    format: 'json',
    ids: entityId,
    props: 'claims',
    origin: '*'
  });
  const data = await fetchJson(`${WIKIDATA_API_URL}?${params}`);
  const claims = data.entities?.[entityId]?.claims?.P18;
  const filename = claims?.[0]?.mainsnak?.datavalue?.value;
  return filename ? stripFilePrefix(filename) : null;
}

async function listArticlePhotos(host, title) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'images',
    titles: title,
    gimlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    iiurlwidth: String(THUMB_WIDTH),
    origin: '*'
  });
  const data = await fetchJson(`https://${host}/w/api.php?${params}`);
  return Object.values(data.query?.pages || {})
    .map((page) => ({
      title: stripFilePrefix(page.title),
      width: page.imageinfo?.[0]?.width || 0,
      height: page.imageinfo?.[0]?.height || 0,
      mime: page.imageinfo?.[0]?.mime || ''
    }))
    .filter((item) => item.title && isLikelyPhoto(item.title))
    .filter((item) => !item.mime || item.mime.startsWith('image/'))
    .filter((item) => Math.max(item.width, item.height) >= MIN_IMAGE_EDGE_PX)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

/** Prefer Wikidata main image (P18), then pageimage, then largest usable article photo. */
async function resolveArticlePhoto(project, page) {
  if (page.wikibaseItem) {
    const p18 = await fetchWikidataP18(page.wikibaseItem).catch(() => null);
    if (p18 && isLikelyPhoto(p18)) return p18;
  }

  if (page.pageimage && isLikelyPhoto(page.pageimage)) {
    return stripFilePrefix(page.pageimage);
  }

  const photos = await listArticlePhotos(project.host, page.title).catch(() => []);
  return photos[0]?.title || null;
}

function imageMetadata(filePage) {
  const image = filePage?.imageinfo?.[0] || {};
  const meta = image.extmetadata || {};
  const categories = cleanText(meta.Categories?.value);
  const description = cleanText(meta.ImageDescription?.value || meta.ObjectName?.value);
  const title = stripFilePrefix(filePage?.title);

  return {
    imageUrl: normalizeWikimediaThumbnailUrl(image.thumburl) || image.url || null,
    fileUrl: image.descriptionurl || null,
    author: cleanText(meta.Artist?.value || meta.Credit?.value),
    license: cleanText(meta.LicenseShortName?.value || meta.UsageTerms?.value),
    licenseUrl: meta.LicenseUrl?.value || null,
    width: Number(image.width) || 0,
    height: Number(image.height) || 0,
    timestamp: image.timestamp || null,
    categories,
    description,
    title: title || null,
  };
}

function isUsablePlacePhoto(image) {
  if (!image?.imageUrl) return false;
  return isLikelyPhotoRecord({
    url: image.imageUrl,
    title: [image.fileTitle, image.title].filter(Boolean).join(' '),
    categories: image.categories,
    description: image.description,
  });
}

async function fetchCommonsMetadata(filename) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    titles: `File:${stripFilePrefix(filename)}`,
    iiprop: 'url|extmetadata|size|timestamp',
    iiurlwidth: String(THUMB_WIDTH),
    origin: '*'
  });
  const data = await fetchJson(`${COMMONS_API_URL}?${params}`);
  const filePage = Object.values(data.query?.pages || {})[0];
  return imageMetadata(filePage);
}

async function searchCommons(lat, lon) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: String(SEARCH_RADIUS_METERS),
    ggslimit: '20',
    ggsnamespace: '6',
    prop: 'coordinates|imageinfo',
    colimit: '20',
    iiprop: 'url|extmetadata|size|timestamp',
    iiurlwidth: String(THUMB_WIDTH),
    origin: '*'
  });
  const data = await fetchJson(`${COMMONS_API_URL}?${params}`);
  const pages = Object.values(data.query?.pages || {})
    .filter((page) => isLikelyPhoto(page.title))
    .sort((a, b) => pageDistance(a) - pageDistance(b));

  const page = pages.find((item) => imageMetadata(item).imageUrl);
  if (!page) return null;

  return {
    title: page.title.replace(/^File:/u, ''),
    pageUrl: imageMetadata(page).fileUrl,
    distanceMeters: pageDistance(page),
    titleMatch: false,
    ...imageMetadata(page)
  };
}

function imageScore(image, locationName) {
  let score = 0;

  if (image.titleMatch) score += 80;

  if (image.width > 0 && image.height > 0) {
    const ratio = image.width / image.height;
    if (ratio >= 1.5) score += 30;
    else if (ratio >= 1.2) score += 15;
    else if (ratio >= 0.9) score += 5;
  }

  if (image.timestamp) {
    const ageDays = (Date.now() - new Date(image.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 365) score += 25;
    else if (ageDays < 1095) score += 15;
    else if (ageDays < 3650) score += 5;
  }

  if (image.distanceMeters != null) {
    if (image.distanceMeters < 500) score += 20;
    else if (image.distanceMeters < 2000) score += 12;
    else if (image.distanceMeters < 8000) score += 4;
  }

  const title = titleCandidate(locationName);
  if (title && image.title) {
    const normalizedTitle = normalizeText(image.title);
    const normalizedName = normalizeText(title);
    if (normalizedTitle === normalizedName) score += 15;
    else if (normalizedTitle.includes(normalizedName) || normalizedName.includes(normalizedTitle)) score += 8;
  }

  if (image.source) {
    const source = String(image.source).toLowerCase();
    if (source.includes('wikipedia')) score += 10;
    else if (source.includes('wikivoyage')) score += 5;
  }

  return score;
}

function selectBestImage(candidates, locationName) {
  return candidates
    .filter((candidate) => isUsablePlacePhoto(candidate))
    .sort((a, b) => imageScore(b, locationName) - imageScore(a, locationName))[0] || null;
}

async function pushWikiCandidate(candidates, page, filename) {
  if (!filename || !isLikelyPhoto(filename)) return;
  if (isNonPlaceArticleTitle(page?.title)) return;
  const image = await fetchCommonsMetadata(filename).catch(() => null);
  if (!image?.imageUrl || !isUsablePlacePhoto(image)) return;
  if (Math.max(image.width, image.height) > 0 && Math.max(image.width, image.height) < MIN_IMAGE_EDGE_PX) {
    return;
  }

  candidates.push({
    ...image,
    source: page.source,
    title: page.title,
    fileTitle: image.title,
    pageUrl: page.pageUrl || image.fileUrl,
    distanceMeters: page.distanceMeters,
    titleMatch: Boolean(page.titleMatch),
  });
}

/** Named places: only article title match (Wikidata P18 / page photo). No nearby POI fishing. */
async function wikimediaTitleImage(lat, lon, name) {
  const candidates = [];

  for (const project of WIKIMEDIA_PROJECTS) {
    let page = null;
    try {
      page = await searchWikimediaTitlePage(project, lat, lon, name);
    } catch {
      continue;
    }
    if (!page) continue;

    const filename = await resolveArticlePhoto(project, page).catch(() => null);
    await pushWikiCandidate(candidates, page, filename);
  }

  return selectBestImage(candidates, name);
}

/** GPS pin: nearest Wikimedia / Commons photos around coordinates. */
async function wikimediaNearbyImage(lat, lon, name) {
  const candidates = [];

  for (const project of WIKIMEDIA_PROJECTS) {
    let page = null;
    try {
      page = await searchWikimediaNearby(project, lat, lon);
    } catch {
      continue;
    }
    if (!page) continue;
    await pushWikiCandidate(candidates, page, page.filename);
  }

  const commons = await searchCommons(lat, lon).catch(() => null);
  if (commons && isUsablePlacePhoto(commons)) {
    candidates.push({
      source: 'Wikimedia Commons',
      ...commons
    });
  }

  return selectBestImage(candidates, name);
}

function sortedOpenTripMapCandidates(items, name) {
  const title = normalizeText(titleCandidate(name));

  return items
    .filter((item) => item?.xid)
    .filter((item) => item.dist == null || item.dist <= OPENTRIPMAP_MAX_DISTANCE_METERS)
    .sort((a, b) => {
      const aDist = a.dist || Number.POSITIVE_INFINITY;
      const bDist = b.dist || Number.POSITIVE_INFINITY;
      if (Math.abs(aDist - bDist) > 1000) return aDist - bDist;

      const aName = normalizeText(a.name);
      const bName = normalizeText(b.name);
      const aMatch = title && aName === title ? 0 : title && aName.includes(title) ? 1 : 2;
      const bMatch = title && bName === title ? 0 : title && bName.includes(title) ? 1 : 2;
      if (aMatch !== bMatch) return aMatch - bMatch;
      if ((b.rate || 0) !== (a.rate || 0)) return (b.rate || 0) - (a.rate || 0);
      return aDist - bDist;
    });
}

function openTripMapApiKey() {
  return process.env.OPENTRIPMAP_API_KEY || '';
}

async function openTripMapGet(lang, method, params) {
  const key = openTripMapApiKey();
  if (!key) return null;

  const query = new URLSearchParams({ ...params, apikey: key });
  return fetchJson(`${OPENTRIPMAP_API_BASE}/${lang}/places/${method}?${query}`);
}

function openTripMapItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.features)) return data.features.map((feature) => feature.properties || feature);
  return [];
}

function uniqueOpenTripMapItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.xid || seen.has(item.xid)) return false;
    seen.add(item.xid);
    return true;
  });
}

async function openTripMapCandidates(lat, lon, name) {
  const title = titleCandidate(name);
  const params = {
    radius: String(OPENTRIPMAP_RADIUS_METERS),
    lon: String(lon),
    lat: String(lat),
    limit: '20',
    rate: '1',
    format: 'json'
  };

  const nearby = await openTripMapGet(OPENTRIPMAP_LANG, 'radius', params).catch(() => null);
  const suggested = title
    ? await openTripMapGet(OPENTRIPMAP_LANG, 'autosuggest', { ...params, name: title }).catch(() => null)
    : null;

  return uniqueOpenTripMapItems([
    ...openTripMapItems(nearby),
    ...openTripMapItems(suggested)
  ]);
}

async function openTripMapImage(lat, lon, name) {
  const candidates = sortedOpenTripMapCandidates(await openTripMapCandidates(lat, lon, name), name);

  for (const candidate of candidates.slice(0, 12)) {
    if (candidate.dist != null && candidate.dist > OPENTRIPMAP_MAX_DISTANCE_METERS) continue;

    const detail = await openTripMapGet(OPENTRIPMAP_LANG, `xid/${encodeURIComponent(candidate.xid)}`, {});
    const imageUrl = normalizeWikimediaThumbnailUrl(detail?.preview?.source) || detail?.image || null;
    if (!imageUrl || !isLikelyPhotoRecord({ url: imageUrl, title: detail?.name })) continue;

    return {
      source: 'OpenTripMap',
      title: detail.name || candidate.name || titleCandidate(name),
      pageUrl: detail.otm || detail.wikipedia || null,
      imageUrl,
      fileUrl: detail.image || detail.otm || detail.wikipedia || imageUrl,
      author: detail.sources?.geometry || null,
      license: 'OpenTripMap',
      licenseUrl: 'https://dev.opentripmap.org/product',
      distanceMeters: candidate.dist ?? null
    };
  }

  return null;
}

function openLicenseName(license, version) {
  const slug = String(license || '').toLowerCase();
  const suffix = version ? ` ${version}` : '';
  if (slug === 'cc0') return `CC0${suffix}`;
  if (slug === 'pdm') return `Public Domain${suffix}`;
  if (slug.startsWith('by')) return `CC ${slug.toUpperCase()}${suffix}`;
  return license ? `${license}${suffix}` : null;
}

async function searchOpenverse(query) {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    page_size: '12',
    mature: 'false',
    license: 'by,by-sa,cc0,pdm',
    aspect_ratio: 'wide',
    size: 'large'
  });
  return fetchJson(`${OPENVERSE_API_URL}?${params}`);
}

function openverseSearchQuery(name) {
  const parts = String(name || '')
    .split(',')
    .map(cleanText)
    .filter(Boolean);

  return parts.length > 1 ? parts.slice(0, 3).join(', ') : titleCandidate(name);
}

function openverseTitleMatchesPlace(imageTitle, placeTitle) {
  const normalizedImageTitle = normalizeText(imageTitle);
  const normalizedPlaceTitle = normalizeText(placeTitle);
  return normalizedImageTitle === normalizedPlaceTitle
    || normalizedImageTitle.startsWith(`${normalizedPlaceTitle} `)
    || normalizedImageTitle.startsWith(`${normalizedPlaceTitle},`)
    || normalizedImageTitle.startsWith(`${normalizedPlaceTitle}.`)
    || normalizedImageTitle.startsWith(`${normalizedPlaceTitle}-`);
}

async function openverseImage(name) {
  const title = titleCandidate(name);
  if (!title) return null;

  const data = await searchOpenverse(openverseSearchQuery(name));
  const image = (data.results || [])
    .filter((item) => !item.mature && isLikelyPhotoRecord(item))
    .filter((item) => openverseTitleMatchesPlace(item.title, title))
    .filter((item) => !hasBadPhotoToken([item.title, item.tags?.join?.(' '), item.category].filter(Boolean).join(' ')))
    .sort((a, b) => {
      const aLandscape = (a.width > a.height) ? 1 : 0;
      const bLandscape = (b.width > b.height) ? 1 : 0;
      if (aLandscape !== bLandscape) return bLandscape - aLandscape;

      const aExact = normalizeText(a.title) === normalizeText(title) ? 0 : 1;
      const bExact = normalizeText(b.title) === normalizeText(title) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      return (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0);
    })[0];

  if (!image?.url) return null;

  return {
    source: `Openverse${image.source ? ` (${image.source})` : ''}`,
    title: image.title || title,
    pageUrl: image.foreign_landing_url || image.detail_url || null,
    imageUrl: image.url,
    fileUrl: image.foreign_landing_url || image.url,
    author: image.creator || null,
    license: openLicenseName(image.license, image.license_version),
    licenseUrl: image.license_url || null
  };
}

/**
 * Last-resort web image search (DuckDuckGo i.js → Bing thumbnail).
 * Used only when Wikimedia/Openverse fail.
 */
const WEB_SEARCH_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function isBlockedWebImageHost(url) {
  const text = String(url || '').toLowerCase();
  return /(artstation|deviantart|midjourney|civitai|lexica\.art|playgroundai|nightcafe|craiyon|dreamstudio|leonardo\.ai|openart|tensor\.art|shutterstock|istockphoto|gettyimages|depositphotos|stock\.adobe|123rf|dreamstime|alamy|pinterest\.|pornhub|xvideos|onlyfans)/u.test(text);
}

async function fetchDuckDuckGoVqd(query) {
  const body = new URLSearchParams({ q: query });
  const response = await fetch('https://duckduckgo.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': WEB_SEARCH_UA,
    },
    body,
  });
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/vqd[=:]["'\s]*([\d-]+)/u);
  return match?.[1] || null;
}

async function duckDuckGoImageResults(query, limit = 8) {
  const vqd = await fetchDuckDuckGoVqd(query);
  if (!vqd) return [];

  const params = new URLSearchParams({
    l: 'wt-wt',
    o: 'json',
    q: query,
    vqd,
    f: ',,,',
    p: '1',
  });
  const response = await fetch(`https://duckduckgo.com/i.js?${params}`, {
    headers: {
      Accept: 'application/json',
      Referer: 'https://duckduckgo.com/',
      'User-Agent': WEB_SEARCH_UA,
    },
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];

  return results
    .map((item) => ({
      imageUrl: item.image || null,
      pageUrl: item.url || null,
      title: cleanText(item.title),
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
    }))
    .filter((item) => item.imageUrl && /^https:\/\//u.test(item.imageUrl))
    .filter((item) => hasPhotoExtension(item.imageUrl) || /\.(jpe?g|png|webp)(?:[?#]|$)/iu.test(item.imageUrl))
    .filter((item) => !isBlockedWebImageHost(item.imageUrl))
    .filter((item) => isLikelyPhotoRecord({ url: item.imageUrl, title: item.title }))
    .slice(0, limit);
}

function bingThumbnailUrl(query) {
  return `https://tse2.mm.bing.net/th?q=${encodeURIComponent(query)}&w=${THUMB_WIDTH}&h=${Math.round(THUMB_WIDTH * 0.5625)}&c=7&rs=1&pid=Api&mkt=cs-CZ&adlt=moderate`;
}

async function webSearchPlaceImage(name) {
  const title = titleCandidate(name);
  if (!title) return null;

  // Prefer outdoor / city photos; nudge away from film posters.
  const queries = [
    `${title} město panorama -film -movie -poster -plakát`,
    `${title} cityscape -film -movie -poster`,
    `${title} panorama`,
  ];

  for (const query of queries) {
    const results = await duckDuckGoImageResults(query, 10).catch(() => []);
    const ranked = [...results].sort((a, b) => {
      const aLandscape = a.width > 0 && a.height > 0 && a.width >= a.height * 1.2 ? 1 : 0;
      const bLandscape = b.width > 0 && b.height > 0 && b.width >= b.height * 1.2 ? 1 : 0;
      if (aLandscape !== bLandscape) return bLandscape - aLandscape;
      return b.width * b.height - a.width * a.height;
    });
    const pick = ranked[0];
    if (!pick?.imageUrl) continue;

    return {
      source: 'DuckDuckGo (web)',
      title: pick.title || title,
      pageUrl: pick.pageUrl,
      imageUrl: pick.imageUrl,
      fileUrl: pick.pageUrl || pick.imageUrl,
      author: null,
      license: 'Webové vyhledávání',
      licenseUrl: null,
      width: pick.width,
      height: pick.height,
    };
  }

  // Absolute last resort: Bing thumbnail CDN.
  const thumb = bingThumbnailUrl(`${title} město`);
  return {
    source: 'Bing (web)',
    title,
    pageUrl: null,
    imageUrl: thumb,
    fileUrl: thumb,
    author: null,
    license: 'Webové vyhledávání',
    licenseUrl: null,
  };
}

async function placeImage(lat, lon, name) {
  // Named city → Wikipedia/Wikidata, then Openverse, then web search.
  // GPS / current location → nearby OpenTripMap, Wikimedia geosearch, then web search if named.
  const loaders = isGpsPlace(name)
    ? [
      () => openTripMapImage(lat, lon, name),
      () => wikimediaNearbyImage(lat, lon, name),
    ]
    : [
      () => wikimediaTitleImage(lat, lon, name),
      () => openverseImage(name),
      () => webSearchPlaceImage(name),
    ];

  for (const load of loaders) {
    try {
      const image = await load();
      if (image?.imageUrl) return image;
    } catch {
      // Ignore individual fallback failures; the endpoint can still use the next source.
    }
  }

  return null;
}

export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const name = String(req.query.name || '');

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'Chybí platné lat nebo lon.' });
    return;
  }

  const key = memoryCacheKey(lat, lon, name);
  const cached = readMemoryCache(key);
  if (cached) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Place-Image-Cache', 'HIT');
    res.status(200).json(cached);
    return;
  }

  try {
    let pending = inFlight.get(key);
    if (!pending) {
      pending = placeImage(lat, lon, name).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    const image = await pending;
    const payload = image || { imageUrl: null };
    writeMemoryCache(key, payload);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Place-Image-Cache', 'MISS');
    res.status(200).json(payload);
  } catch (error) {
    res.status(502).json({ error: 'Obrázek místa se nepodařilo načíst.', detail: error.message });
  }
}
