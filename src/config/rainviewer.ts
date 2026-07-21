export const RAINVIEWER_RECOLOR_SOURCE_SCHEME = 2;
export const SMIRKHAT_RAINVIEWER_COLOR_SCHEME = {
  value: 'smirkhat',
  name: 'SmirkHat.org',
  stops: [
    [-32, 0, 0, 0, 0],
    [-10, 85, 110, 132, 74],
    [0, 56, 189, 248, 118],
    [5, 34, 211, 238, 150],
    [10, 45, 212, 191, 184],
    [18, 52, 211, 153, 218],
    [25, 163, 230, 53, 232],
    [32, 250, 204, 21, 240],
    [40, 251, 146, 60, 248],
    [48, 239, 68, 68, 252],
    [56, 190, 18, 60, 255],
    [64, 127, 29, 29, 255],
    [72, 185, 28, 28, 255],
    [82, 255, 245, 235, 255],
    [95, 255, 255, 255, 255]
  ],
  snowStops: [
    [-32, 0, 0, 0, 0],
    [-10, 132, 204, 255, 90],
    [0, 125, 211, 252, 135],
    [10, 186, 230, 253, 185],
    [25, 219, 234, 254, 220],
    [45, 239, 246, 255, 242],
    [65, 255, 255, 255, 252],
    [95, 255, 255, 255, 255]
  ]
};

/** Official ČHMÚ scl-dbz-mmh.png discrete colors → dBZ. */
export const CHMI_RADAR_SOURCE_COLORS = [
  [4, 56, 0, 112],
  [8, 48, 0, 168],
  [12, 0, 0, 252],
  [16, 0, 108, 192],
  [20, 0, 160, 0],
  [24, 0, 188, 0],
  [28, 52, 216, 0],
  [32, 156, 220, 0],
  [36, 224, 220, 0],
  [40, 252, 176, 0],
  [44, 252, 132, 0],
  [48, 252, 88, 0],
  [52, 252, 0, 0],
  [56, 160, 0, 0],
  [60, 252, 252, 252]
];

function interpolateChannel(start, end, ratio) {
  return Math.round(start + (end - start) * ratio);
}

function colorForDbz(stops, dbz) {
  if (dbz <= stops[0][0]) return stops[0].slice(1);

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];
    if (dbz > next[0]) continue;

    const range = next[0] - previous[0] || 1;
    const ratio = (dbz - previous[0]) / range;
    return [
      interpolateChannel(previous[1], next[1], ratio),
      interpolateChannel(previous[2], next[2], ratio),
      interpolateChannel(previous[3], next[3], ratio),
      interpolateChannel(previous[4], next[4], ratio)
    ];
  }

  return stops[stops.length - 1].slice(1);
}

export function createRainviewerColorTable(scheme = SMIRKHAT_RAINVIEWER_COLOR_SCHEME) {
  const table = new Uint8ClampedArray(256 * 4);

  for (let rawValue = 0; rawValue <= 255; rawValue += 1) {
    const tableIndex = rawValue * 4;
    if (rawValue === 0 || rawValue === 128) {
      table[tableIndex + 3] = 0;
      continue;
    }

    const dbz = (rawValue & 127) - 32;
    const snow = (rawValue & 128) === 128;
    const [red, green, blue, alpha] = colorForDbz(snow ? scheme.snowStops : scheme.stops, dbz);

    table[tableIndex] = red;
    table[tableIndex + 1] = green;
    table[tableIndex + 2] = blue;
    table[tableIndex + 3] = alpha;
  }

  return table;
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;
  return { h: hue * 360, s: saturation, l: lightness };
}

function hueDistance(a, b) {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

/**
 * Map a ČHMÚ MAX_Z PNG pixel to reflectivity (dBZ).
 * Returns null for background / grey mask pixels.
 */
export function estimateDbzFromChmi(red, green, blue) {
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  if (maxChannel < 16) return null;
  if (maxChannel - minChannel < 18 && maxChannel > 35 && maxChannel < 220) return null;
  if (red > 245 && green > 245 && blue > 245) return { dbz: 60, exact: true };

  for (const [dbz, sourceRed, sourceGreen, sourceBlue] of CHMI_RADAR_SOURCE_COLORS) {
    if (red === sourceRed && green === sourceGreen && blue === sourceBlue) {
      return { dbz, exact: true };
    }
  }

  const hsl = rgbToHsl(red, green, blue);
  if (hsl.s < 0.12) return null;

  let bestDbz = null;
  let bestScore = Infinity;

  for (const [dbz, sourceRed, sourceGreen, sourceBlue] of CHMI_RADAR_SOURCE_COLORS) {
    if (dbz === 60) continue;
    const target = rgbToHsl(sourceRed, sourceGreen, sourceBlue);
    const score =
      hueDistance(hsl.h, target.h) ** 2 * 4 +
      Math.abs(hsl.s - target.s) * 80 +
      Math.abs(hsl.l - target.l) * 40;
    if (score < bestScore) {
      bestScore = score;
      bestDbz = dbz;
    }
  }

  if (bestDbz == null || bestScore > 900) return null;
  return { dbz: bestDbz, exact: false };
}

export function colorizeChmiRadar(imageData, colorTable = createRainviewerColorTable()) {
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const sourceAlpha = pixels[index + 3];
    if (sourceAlpha < 10) {
      pixels[index + 3] = 0;
      continue;
    }

    const estimate = estimateDbzFromChmi(pixels[index], pixels[index + 1], pixels[index + 2]);
    if (!estimate) {
      pixels[index + 3] = 0;
      continue;
    }

    const { dbz, exact } = estimate;
    const tableIndex = Math.max(0, Math.min(127, dbz + 32)) * 4;
    const alphaScale = exact ? 1 : 0.78;

    pixels[index] = colorTable[tableIndex];
    pixels[index + 1] = colorTable[tableIndex + 1];
    pixels[index + 2] = colorTable[tableIndex + 2];
    pixels[index + 3] = Math.round(colorTable[tableIndex + 3] * alphaScale);
  }
}
