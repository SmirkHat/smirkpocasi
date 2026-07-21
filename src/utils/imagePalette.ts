const SAMPLE_SIZE = 48;
const DEFAULT_COUNT = 5;

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

function toRgba([r, g, b], alpha) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

/** Push muddy midtones toward richer chroma without blowing highlights. */
function boostVivid([r, g, b]) {
  const mid = (r + g + b) / 3;
  const factor = 1.4;
  return [
    Math.min(255, Math.max(0, mid + (r - mid) * factor)),
    Math.min(255, Math.max(0, mid + (g - mid) * factor)),
    Math.min(255, Math.max(0, mid + (b - mid) * factor)),
  ];
}

/** Pull a few vivid colors from an image. Returns null if CORS/taint blocks reading pixels. */
export async function extractImagePalette(imageUrl, { count = DEFAULT_COUNT } = {}) {
  if (!imageUrl || typeof document === 'undefined') return null;

  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let pixels;
  try {
    pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null;
  }

  const buckets = new Map();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luminance = (r + g + b) / 3;
    if (luminance < 28 || luminance > 232) continue;

    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation < 0.16) continue;

    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    // Prefer saturated pixels when ranking buckets.
    const weight = 1 + saturation * 5 + (saturation > 0.35 ? 2 : 0);
    const existing = buckets.get(key);
    if (existing) {
      existing.weight += weight;
      existing.r += r * weight;
      existing.g += g * weight;
      existing.b += b * weight;
    } else {
      buckets.set(key, { weight, r: r * weight, g: g * weight, b: b * weight });
    }
  }

  const ranked = [...buckets.values()]
    .map((bucket) => [
      bucket.r / bucket.weight,
      bucket.g / bucket.weight,
      bucket.b / bucket.weight,
      bucket.weight
    ])
    .sort((left, right) => right[3] - left[3]);

  const picked = [];
  for (const candidate of ranked) {
    const rgb = boostVivid(candidate.slice(0, 3));
    if (picked.every((color) => colorDistance(color, rgb) > 38)) {
      picked.push(rgb);
      if (picked.length >= count) break;
    }
  }

  return picked.length ? picked : null;
}

/** Stable mesh blobs from palette + seed (image URL) — one layer per color for animation. */
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
