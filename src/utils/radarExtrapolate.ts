import { RAINVIEWER_RECOLOR_SOURCE_SCHEME } from '../config/rainviewer';

const MOTION_ZOOM = 4;
const TILE_SIZE = 256;
const GRID = 3;
const CORR_SIZE = 128;
const MAX_OFFSET = 28;
const FORECAST_LEADS_MIN = [10, 20, 30, 40, 50, 60];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return {
    x: clamp(x, 0, n - 1),
    y: clamp(y, 0, n - 1)
  };
}

function loadTileImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function tileUrl(frame, z, x, y) {
  return `${frame.host}${frame.path}/256/${z}/${x}/${y}/${RAINVIEWER_RECOLOR_SOURCE_SCHEME}/1_1.png`;
}

async function stitchFramePatch(frame, centerLat, centerLon) {
  const centerTile = latLonToTile(centerLat, centerLon, MOTION_ZOOM);
  const half = Math.floor(GRID / 2);
  const originX = centerTile.x - half;
  const originY = centerTile.y - half;
  const size = GRID * TILE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, size, size);

  const jobs = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const x = originX + col;
      const y = originY + row;
      jobs.push(
        loadTileImage(tileUrl(frame, MOTION_ZOOM, x, y)).then((image) => {
          if (image) context.drawImage(image, col * TILE_SIZE, row * TILE_SIZE);
        })
      );
    }
  }
  await Promise.all(jobs);

  const small = document.createElement('canvas');
  small.width = CORR_SIZE;
  small.height = CORR_SIZE;
  const smallContext = small.getContext('2d', { willReadFrequently: true });
  smallContext.drawImage(canvas, 0, 0, CORR_SIZE, CORR_SIZE);
  return smallContext.getImageData(0, 0, CORR_SIZE, CORR_SIZE);
}

function toLuma(data, index) {
  const alpha = data[index + 3];
  if (alpha < 8) return 0;
  return (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) * (alpha / 255);
}

function countEchoPixels(imageData) {
  let count = 0;
  for (let index = 0; index < imageData.data.length; index += 16) {
    if (toLuma(imageData.data, index) >= 8) count += 1;
  }
  return count;
}

function correlationScore(prev, next, dx, dy) {
  const size = CORR_SIZE;
  const margin = MAX_OFFSET;
  let sum = 0;
  let count = 0;

  for (let y = margin; y < size - margin; y += 2) {
    for (let x = margin; x < size - margin; x += 2) {
      const a = toLuma(prev.data, (y * size + x) * 4);
      const b = toLuma(next.data, ((y + dy) * size + (x + dx)) * 4);
      if (a < 4 && b < 4) continue;
      const diff = a - b;
      sum += diff * diff;
      count += 1;
    }
  }

  if (count < 40) return Number.POSITIVE_INFINITY;
  return sum / count;
}

function estimatePixelShift(prev, next) {
  let best = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY };

  for (let dy = -MAX_OFFSET; dy <= MAX_OFFSET; dy += 2) {
    for (let dx = -MAX_OFFSET; dx <= MAX_OFFSET; dx += 2) {
      const score = correlationScore(prev, next, dx, dy);
      if (score < best.score) best = { dx, dy, score };
    }
  }

  for (let dy = best.dy - 1; dy <= best.dy + 1; dy += 1) {
    for (let dx = best.dx - 1; dx <= best.dx + 1; dx += 1) {
      if (dx === best.dx && dy === best.dy) continue;
      if (Math.abs(dx) > MAX_OFFSET || Math.abs(dy) > MAX_OFFSET) continue;
      const score = correlationScore(prev, next, dx, dy);
      if (score < best.score) best = { dx, dy, score };
    }
  }

  return best;
}

function pixelShiftToDegrees(dx, dy, centerLat) {
  const scale = (GRID * TILE_SIZE) / CORR_SIZE;
  const dxFull = dx * scale;
  const dyFull = dy * scale;
  const metersPerPixel = (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / 2 ** MOTION_ZOOM;
  const dLat = -(dyFull * metersPerPixel) / 111_320;
  const dLon = (dxFull * metersPerPixel) / (111_320 * Math.cos((centerLat * Math.PI) / 180) || 1);
  return { dLat, dLon };
}

function motionFromDisplacement(dLat, dLon, dtMinutes, centerLat, method) {
  const latPerMin = dLat / dtMinutes;
  const lonPerMin = dLon / dtMinutes;
  const speedKmH =
    Math.hypot(dLat * 111.32, dLon * 111.32 * Math.cos((centerLat * Math.PI) / 180)) / (dtMinutes / 60);
  return { latPerMin, lonPerMin, speedKmH, dtMinutes, method };
}

/** Mid-level wind as steering when local radar echo is too weak to track. */
async function estimateWindSteeringMotion(centerLat, centerLon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(centerLat));
  url.searchParams.set('longitude', String(centerLon));
  url.searchParams.set('hourly', 'wind_speed_700hPa,wind_direction_700hPa');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'UTC');

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const speeds = data?.hourly?.wind_speed_700hPa || [];
  const dirs = data?.hourly?.wind_direction_700hPa || [];
  const times = data?.hourly?.time || [];
  const now = Date.now();
  let index = 0;
  for (let i = 0; i < times.length; i += 1) {
    if (Date.parse(times[i]) <= now) index = i;
  }

  const speedKmH = Number(speeds[index]);
  const fromDeg = Number(dirs[index]);
  if (!Number.isFinite(speedKmH) || !Number.isFinite(fromDeg) || speedKmH < 1) return null;

  // Meteorological direction = where wind comes FROM; advection moves toward +180°.
  const towardRad = ((fromDeg + 180) * Math.PI) / 180;
  const kmPerMin = speedKmH / 60;
  const latPerMin = (kmPerMin * Math.cos(towardRad)) / 111.32;
  const lonPerMin = (kmPerMin * Math.sin(towardRad)) / (111.32 * Math.cos((centerLat * Math.PI) / 180) || 1);

  return {
    latPerMin,
    lonPerMin,
    speedKmH,
    dtMinutes: 10,
    method: 'wind700'
  };
}

/**
 * Estimate echo motion between the last two RainViewer past frames near a point.
 * Always returns a usable motion object (radar / wind / persistence) so forecast frames can be built.
 */
export async function estimateRainviewerMotion(prevFrame, lastFrame, centerLat, centerLon) {
  const persistence = {
    latPerMin: 0,
    lonPerMin: 0,
    speedKmH: 0,
    dtMinutes: 10,
    method: 'persistence'
  };

  if (!prevFrame?.path || !lastFrame?.path) {
    return (await estimateWindSteeringMotion(centerLat, centerLon).catch(() => null)) || persistence;
  }
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) return persistence;

  const dtMinutes = (Number(lastFrame.timeMs) - Number(prevFrame.timeMs)) / 60000;
  if (!(dtMinutes > 0) || dtMinutes > 30) {
    return (await estimateWindSteeringMotion(centerLat, centerLon).catch(() => null)) || persistence;
  }

  try {
    const [prevPatch, lastPatch] = await Promise.all([
      stitchFramePatch(prevFrame, centerLat, centerLon),
      stitchFramePatch(lastFrame, centerLat, centerLon)
    ]);

    const echo = Math.max(countEchoPixels(prevPatch), countEchoPixels(lastPatch));
    const shift = estimatePixelShift(prevPatch, lastPatch);

    if (echo >= 30 && Number.isFinite(shift.score)) {
      const { dLat, dLon } = pixelShiftToDegrees(shift.dx, shift.dy, centerLat);
      const radarMotion = motionFromDisplacement(dLat, dLon, dtMinutes, centerLat, 'radar');
      // Near-zero means nothing useful to track — fall through to wind.
      if (radarMotion.speedKmH >= 2 && radarMotion.speedKmH <= 140) {
        return radarMotion;
      }
    }
  } catch {
    // Fall through to wind / persistence.
  }

  return (await estimateWindSteeringMotion(centerLat, centerLon).catch(() => null)) || persistence;
}

export function buildExtrapolatedRainviewerFrames(lastFrame, motion, leads = FORECAST_LEADS_MIN) {
  if (!lastFrame || !motion) return [];

  return leads.map((lead) => ({
    ...lastFrame,
    id: `rv-extrap-${lead}`,
    kind: 'nowcast',
    extrapolated: true,
    lead,
    timeMs: Number(lastFrame.timeMs) + lead * 60000,
    shiftLat: motion.latPerMin * lead,
    shiftLon: motion.lonPerMin * lead,
    motionMethod: motion.method,
    motionSpeedKmH: motion.speedKmH
  }));
}
