const SAMPLE_SIZE = 96;
const DEFAULT_COUNT = 5;
/**
 * Match WeatherHero `bg-cover bg-center` on a wide card
 * (≈ max-w-6xl × lg:min-h-112).
 */
export const HERO_COVER_ASPECT = 2.4;
/** Bump when extraction changes so in-memory caches refresh. */
export const PALETTE_VERSION = 11;

// Material Score–inspired knobs (HSL chroma stand-in for HCT).
const WEIGHT_PROPORTION = 0.7;
const TARGET_CHROMA = 0.42;
const WEIGHT_CHROMA_BELOW = 0.12;
const WEIGHT_CHROMA_ABOVE = 0.28;
const CUTOFF_CHROMA = 0.06;
const CUTOFF_PROPORTION = 0.012;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nepodařilo se načíst obrázek pro paletu.'));
    image.src = url;
  });
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hueDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function toRgba([r, g, b], alpha) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** RGB 0–255 → HSL with h in [0,360), s/l in [0,1]. */
export function rgbToHsl([r, g, b]) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return [h * 360, s, l];
}

function hueToChannel(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** HSL → RGB 0–255. */
export function hslToRgb(h, s, l) {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToChannel(p, q, hh + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, hh) * 255),
    Math.round(hueToChannel(p, q, hh - 1 / 3) * 255),
  ];
}

/** Closer to perceived chroma than raw HSL saturation. */
function approxChroma(saturation, lightness) {
  return saturation * (1 - Math.abs(2 * lightness - 1));
}

/**
 * Cool blue handling:
 * - muddy storm/slate (low chroma) → always weak
 * - clear saturated sky that dominates the crop → allow (Klatovy)
 * - blue as background next to warmer subjects → downrank (Beroun)
 */
function skySuitability(hue, chroma, lightness, coolSkyShare) {
  const coolBlue = hue >= 185 && hue <= 245;
  if (!coolBlue) return 1;

  if (chroma < 0.28) return 0.1;

  if (coolSkyShare >= 0.28 && chroma >= 0.28) {
    return lightness >= 0.32 ? 1 : 0.85;
  }

  if (lightness >= 0.5) return 0.12;
  if (lightness >= 0.38) return 0.22;
  return 0.4;
}

/** Prefer facade midtones over blown highlights / crushed shadows. */
function toneUsability(lightness) {
  if (lightness < 0.12 || lightness > 0.92) return 0.15;
  if (lightness < 0.2 || lightness > 0.82) return 0.4;
  if (lightness >= 0.28 && lightness <= 0.7) return 1;
  return 0.7;
}

/**
 * Merge fragmented buckets into hue sectors so cream facades beat
 * consolidated storm-gray clusters.
 */
function aggregateByHue(swatches, sectorSize = 15) {
  const sectors = new Map();

  for (const swatch of swatches) {
    const sector = Math.floor(swatch.hue / sectorSize) * sectorSize;
    const tone = toneUsability(swatch.lightness);
    const weight = swatch.population * tone * (0.35 + swatch.chroma);
    const existing = sectors.get(sector);
    if (existing) {
      existing.population += swatch.population;
      existing.weight += weight;
      existing.r += swatch.rgb[0] * weight;
      existing.g += swatch.rgb[1] * weight;
      existing.b += swatch.rgb[2] * weight;
    } else {
      sectors.set(sector, {
        population: swatch.population,
        weight,
        r: swatch.rgb[0] * weight,
        g: swatch.rgb[1] * weight,
        b: swatch.rgb[2] * weight,
      });
    }
  }

  return [...sectors.values()]
    .filter((sector) => sector.weight > 0)
    .map((sector) => {
      const rgb = [sector.r / sector.weight, sector.g / sector.weight, sector.b / sector.weight];
      const [hue, saturation, lightness] = rgbToHsl(rgb);
      return {
        rgb,
        hue,
        saturation,
        lightness,
        chroma: approxChroma(saturation, lightness),
        population: sector.population,
      };
    });
}

/**
 * Material Score–style ranking on hue aggregates.
 */
function scoreSwatches(swatches, totalPopulation) {
  if (!swatches.length || totalPopulation <= 0) return [];

  const aggregates = aggregateByHue(swatches);

  let coolSkyPopulation = 0;
  const huePopulation = new Array(360).fill(0);
  for (const swatch of aggregates) {
    huePopulation[Math.floor(swatch.hue) % 360] += swatch.population;
    if (swatch.hue >= 185 && swatch.hue <= 245 && swatch.chroma >= 0.22) {
      coolSkyPopulation += swatch.population;
    }
  }
  const coolSkyShare = coolSkyPopulation / totalPopulation;

  const hueExcited = new Array(360).fill(0);
  for (let hue = 0; hue < 360; hue += 1) {
    const proportion = huePopulation[hue] / totalPopulation;
    for (let offset = -14; offset <= 15; offset += 1) {
      const neighbor = (hue + offset + 360) % 360;
      hueExcited[neighbor] += proportion;
    }
  }

  const scored = [];
  for (const swatch of aggregates) {
    const hue = Math.round(swatch.hue) % 360;
    const proportion = hueExcited[hue];
    if (swatch.chroma < CUTOFF_CHROMA || proportion <= CUTOFF_PROPORTION) continue;

    const proportionScore = proportion * 100 * WEIGHT_PROPORTION;
    const chromaWeight =
      swatch.chroma < TARGET_CHROMA ? WEIGHT_CHROMA_BELOW : WEIGHT_CHROMA_ABOVE;
    const chromaScore = (swatch.chroma - TARGET_CHROMA) * chromaWeight * 100;
    const sky = skySuitability(swatch.hue, swatch.chroma, swatch.lightness, coolSkyShare);
    const score = (proportionScore + chromaScore) * sky;
    scored.push({ ...swatch, score, proportion });
  }

  scored.sort((left, right) => right.score - left.score || right.population - left.population);
  return scored;
}

/** Pick distinct hues (Material: try 90° spacing down to 15°). */
function pickDistinct(scored, count) {
  for (let gap = 90; gap >= 15; gap -= 15) {
    const chosen = [];
    for (const candidate of scored) {
      if (chosen.every((item) => hueDistance(item.hue, candidate.hue) >= gap)) {
        chosen.push(candidate);
        if (chosen.length >= count) return chosen;
      }
    }
    if (chosen.length >= Math.min(count, 2)) return chosen;
  }
  return scored.slice(0, count);
}

/** Soft lift for dark UI — keeps hue, nudges sat/light into a readable range. */
export function toneForBackdrop(rgb, alpha = 1) {
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  const sat = clamp(s * 1.06, 0.18, 0.65);
  const light = clamp(Math.max(l, 0.36), 0.36, 0.58);
  return toRgba(hslToRgb(h, sat, light), alpha);
}

/**
 * One dominant seed → cohesive aurora tones (tonal family, not unrelated hues).
 */
export function backdropThemeFromDominant(rgb) {
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  const sat = clamp(s * 1.08, 0.2, 0.62);
  const light = clamp(Math.max(l, 0.38), 0.38, 0.56);

  return {
    c1: toRgba(hslToRgb(h, sat, light), 0.95),
    c2: toRgba(hslToRgb(h, clamp(sat * 0.92, 0.16, 0.55), clamp(light + 0.1, 0.42, 0.64)), 0.78),
    c3: toRgba(hslToRgb(h + 14, clamp(sat * 0.85, 0.14, 0.5), clamp(light + 0.02, 0.36, 0.56)), 0.7),
    c4: toRgba(hslToRgb(h - 12, clamp(sat * 0.78, 0.12, 0.46), clamp(light - 0.04, 0.32, 0.5)), 0.55),
  };
}

export function toHex([r, g, b]) {
  return `#${[r, g, b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function relativeLuminance([r, g, b]) {
  const toLinear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * UI accent from photo seed — keep hue, push sat/light so primary reads clearly on dark chrome.
 */
export function uiThemeFromDominant(rgb) {
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  const sat = clamp(Math.max(s, 0.28) * 1.35, 0.42, 0.78);
  const primary = hslToRgb(h, sat, clamp(Math.max(l, 0.55), 0.55, 0.68));
  const accent = hslToRgb(h, clamp(sat * 0.9, 0.28, 0.58), 0.3);
  const chart2 = hslToRgb(h + 14, clamp(sat * 0.92, 0.35, 0.7), 0.58);
  const chart3 = hslToRgb(h - 12, clamp(sat * 0.85, 0.3, 0.62), 0.46);
  const chart4 = hslToRgb(h + 26, clamp(sat * 0.8, 0.28, 0.58), 0.6);
  const chart5 = hslToRgb(h - 22, clamp(sat * 0.75, 0.26, 0.52), 0.38);
  const foreground = relativeLuminance(primary) > 0.45 ? '#000000' : '#ffffff';
  const accentForeground = toHex(hslToRgb(h, clamp(sat * 0.55, 0.2, 0.42), 0.9));

  const primaryHex = toHex(primary);
  return {
    '--primary': primaryHex,
    '--primary-foreground': foreground,
    '--ring': primaryHex,
    '--accent': toHex(accent),
    '--accent-foreground': accentForeground,
    '--sidebar-primary': primaryHex,
    '--sidebar-primary-foreground': foreground,
    '--sidebar-ring': primaryHex,
    '--chart-1': primaryHex,
    '--chart-2': toHex(chart2),
    '--chart-3': toHex(chart3),
    '--chart-4': toHex(chart4),
    '--chart-5': toHex(chart5),
  };
}

/** @deprecated Use toneForBackdrop / backdropThemeFromDominant */
export function boostBackdropColor(rgb, alpha = 1) {
  return toneForBackdrop(rgb, alpha);
}

/** Dominant seed from palette (index 0 after Material-style ranking). */
export function paletteAccentColor(palette, alpha = 1) {
  if (!palette?.length) return null;
  return toneForBackdrop(palette[0], alpha);
}

/** @deprecated Prefer paletteAccentColor — vivid ≠ dominant. */
export function paletteVividColor(palette, alpha = 1) {
  return paletteAccentColor(palette, alpha);
}

/**
 * CSS `background-size: cover; background-position: center` source rect.
 */
export function coverCropRect(imageWidth, imageHeight, boxAspect = HERO_COVER_ASPECT) {
  if (!imageWidth || !imageHeight || boxAspect <= 0) {
    return { sx: 0, sy: 0, sw: imageWidth || 0, sh: imageHeight || 0 };
  }
  const imageAspect = imageWidth / imageHeight;
  if (imageAspect > boxAspect) {
    const sw = imageHeight * boxAspect;
    return { sx: (imageWidth - sw) / 2, sy: 0, sw, sh: imageHeight };
  }
  const sh = imageWidth / boxAspect;
  return { sx: 0, sy: (imageHeight - sh) / 2, sw: imageWidth, sh };
}

/**
 * Extract a Material You–like seed palette from the hero-visible crop
 * (same region as `bg-cover bg-center` on the weather card).
 */
export async function extractImagePalette(
  imageUrl,
  { count = DEFAULT_COUNT, aspectRatio = HERO_COVER_ASPECT } = {},
) {
  if (!imageUrl || typeof document === 'undefined') return null;

  const image = await loadImage(imageUrl);
  const crop = coverCropRect(image.naturalWidth || image.width, image.naturalHeight || image.height, aspectRatio);

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    SAMPLE_SIZE,
    SAMPLE_SIZE,
  );

  let pixels;
  try {
    pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null;
  }

  // 6-bit RGB buckets.
  const buckets = new Map();
  let sampled = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 250) continue;

    const pixelIndex = index / 4;
    const x = pixelIndex % SAMPLE_SIZE;
    const y = Math.floor(pixelIndex / SAMPLE_SIZE);
    const cx = (x + 0.5) / SAMPLE_SIZE - 0.5;
    const cy = (y + 0.5) / SAMPLE_SIZE - 0.5;
    // Mild center bias within the already-cropped hero frame.
    const weight = Math.max(0.4, 1 - Math.sqrt(cx * cx + cy * cy) * 1.05);

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const key = `${r >> 2},${g >> 2},${b >> 2}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.population += weight;
      existing.r += r * weight;
      existing.g += g * weight;
      existing.b += b * weight;
    } else {
      buckets.set(key, {
        population: weight,
        r: r * weight,
        g: g * weight,
        b: b * weight,
      });
    }
    sampled += weight;
  }

  if (!sampled) return null;

  const swatches = [...buckets.values()].map((bucket) => {
    const rgb = [
      bucket.r / bucket.population,
      bucket.g / bucket.population,
      bucket.b / bucket.population,
    ];
    const [hue, saturation, lightness] = rgbToHsl(rgb);
    return {
      rgb,
      hue,
      saturation,
      lightness,
      chroma: approxChroma(saturation, lightness),
      population: bucket.population,
    };
  });

  // Aggregate tiny cream/roof buckets by hue before scoring — otherwise
  // consolidated storm-gray clusters always beat fragmented facades.
  const scored = scoreSwatches(swatches, sampled);
  const chosen = pickDistinct(scored, count);

  if (!chosen.length) {
    const byPop = [...swatches].sort((a, b) => b.population - a.population);
    return byPop[0] ? [byPop[0].rgb] : null;
  }

  return chosen.map((item) => item.rgb);
}

/** Stable mesh blobs from palette + seed (image URL). */
export function buildMeshBlobs(palette, seed = '') {
  if (!palette?.length) return [];

  const random = seededRandom(hashString(String(seed)));

  return palette.map((rgb, index) => {
    const x = Math.round(10 + random() * 80);
    const y = Math.round(10 + random() * 80);
    const size = Math.round(58 + random() * 52);
    const alpha = 0.72 - index * 0.08;
    return {
      backgroundImage: `radial-gradient(${size}% ${size}% at ${x}% ${y}%, ${toRgba(rgb, alpha)} 0%, transparent 70%)`,
    };
  });
}

/** Stable “random” mesh from palette + seed (image URL). */
export function buildMeshGradient(palette, seed = '') {
  const blobs = buildMeshBlobs(palette, seed);
  return blobs.length ? blobs.map((blob) => blob.backgroundImage).join(', ') : null;
}
