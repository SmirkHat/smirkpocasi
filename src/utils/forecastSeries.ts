/**
 * Slim hourly forecast payloads kept on consensus for multi-source charts.
 * Full provider `raw` stays off public sources / localStorage.
 */

function pickArray(hourly, ...keys) {
  for (const key of keys) {
    if (Array.isArray(hourly?.[key])) return hourly[key];
  }
  return null;
}

export function slimOpenMeteoHourly(hourly) {
  if (!hourly?.time?.length || hourly.time.length < 2) return null;
  return {
    time: hourly.time,
    temperature_2m: pickArray(hourly, 'temperature_2m'),
    precipitation: pickArray(hourly, 'precipitation'),
    precipitation_probability: pickArray(hourly, 'precipitation_probability'),
    wind_speed_10m: pickArray(hourly, 'wind_speed_10m', 'windspeed_10m'),
    wind_direction_10m: pickArray(hourly, 'wind_direction_10m', 'winddirection_10m'),
    weather_code: pickArray(hourly, 'weather_code', 'weathercode'),
  };
}

export function slimAladinForecast(raw) {
  const values = raw?.parameterValues;
  if (!values || !raw?.forecastTimeIso) return null;
  return {
    forecastTimeIso: raw.forecastTimeIso,
    forecastLength: raw.forecastLength,
    parameterValues: {
      PRECIPITATION_TOTAL: values.PRECIPITATION_TOTAL || [],
      TEMPERATURE: values.TEMPERATURE || [],
      WIND_SPEED: values.WIND_SPEED || [],
      WIND_DIRECTION: values.WIND_DIRECTION || [],
    },
  };
}

export function slimYrForecast(raw) {
  const series = raw?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) return null;

  const steps = series
    .filter((step) => step?.data?.next_1_hours)
    .map((step) => {
      const instant = step.data.instant?.details || {};
      const next1 = step.data.next_1_hours?.details || {};
      return {
        time: step.time,
        temperature: instant.air_temperature ?? null,
        windSpeed: instant.wind_speed ?? null,
        windDirection: instant.wind_from_direction ?? null,
        precipitation: next1.precipitation_amount ?? null,
        precipitationProbability: next1.probability_of_precipitation ?? null,
      };
    });

  return steps.length ? { steps } : null;
}

export function slimWttrForecast(raw) {
  const days = raw?.weather;
  if (!Array.isArray(days) || !days.length) return null;

  const steps = [];
  for (const day of days) {
    const date = day?.date;
    if (!date || !Array.isArray(day.hourly)) continue;
    for (const hour of day.hourly) {
      const hhmm = String(hour.time ?? '0').padStart(4, '0');
      const hh = hhmm.slice(0, 2);
      const mm = hhmm.slice(2, 4);
      steps.push({
        time: `${date}T${hh}:${mm}:00`,
        temperature: hour.tempC ?? null,
        precipitation: hour.precipMM ?? null,
        precipitationProbability: hour.chanceofrain ?? null,
        windSpeed: hour.windspeedKmph ?? null,
        windDirection: hour.winddirDegree ?? null,
      });
    }
  }

  return steps.length ? { steps } : null;
}

/** weather.com hourly block from /api/weathercom (`hourly` arrays). */
export function slimWeatherComForecast(raw) {
  const hourly = raw?.hourly;
  const times = hourly?.validTimeLocal || hourly?.validTimeUtc;
  if (!Array.isArray(times) || times.length < 2) return null;

  const steps = times.map((time, i) => ({
    time: typeof time === 'number' ? new Date(time * 1000).toISOString() : time,
    temperature: hourly.temperature?.[i] ?? null,
    precipitation: hourly.qpf?.[i] ?? hourly.qpfRain?.[i] ?? null,
    precipitationProbability: hourly.precipChance?.[i] ?? null,
    windSpeed: hourly.windSpeed?.[i] ?? null,
    windDirection: hourly.windDirection?.[i] ?? null,
  }));

  return { steps };
}

/** Shared step list used by SMHI / FMI / NWS / BMKG / Meteo AM / Accu / Tomorrow. */
export function slimStepsForecast(steps) {
  if (!Array.isArray(steps) || steps.length < 2) return null;
  return { steps };
}

export function slimSmhiForecast(raw) {
  const series = raw?.timeSeries;
  if (!Array.isArray(series) || series.length < 2) return null;
  const steps = series.map((item) => {
    const data = item?.data || {};
    return {
      time: item.time,
      temperature: data.air_temperature ?? null,
      precipitation: data.precipitation_amount_mean ?? data.precipitation_amount_max ?? null,
      precipitationProbability: data.probability_of_precipitation ?? null,
      windSpeed: data.wind_speed == null ? null : Number(data.wind_speed) * 3.6,
      windDirection: data.wind_from_direction ?? null,
    };
  });
  return slimStepsForecast(steps);
}

export function slimFmiForecast(raw) {
  const series = raw?.steps;
  if (!Array.isArray(series) || series.length < 2) return null;
  const steps = series.map((step) => ({
    time: step.time,
    temperature: step.Temperature ?? null,
    precipitation: step.Precipitation1h ?? null,
    precipitationProbability: step.PoP ?? null,
    windSpeed: step.WindSpeedMS == null ? null : Number(step.WindSpeedMS) * 3.6,
    windDirection: step.WindDirection ?? null,
  }));
  return slimStepsForecast(steps);
}

export function slimNwsForecast(raw) {
  const periods = raw?.hourly?.properties?.periods;
  if (!Array.isArray(periods) || periods.length < 2) return null;

  const compass = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };

  const steps = periods.map((period) => {
    const tempF = period.temperatureUnit === 'F';
    const temp = Number(period.temperature);
    const mphMatch = String(period.windSpeed || '').match(/([\d.]+)/);
    const mph = mphMatch ? Number(mphMatch[1]) : null;
    return {
      time: period.startTime,
      temperature: Number.isFinite(temp) ? (tempF ? ((temp - 32) * 5) / 9 : temp) : null,
      precipitation: null,
      precipitationProbability: period.probabilityOfPrecipitation?.value ?? null,
      windSpeed: mph == null || !Number.isFinite(mph) ? null : mph * 1.60934,
      windDirection: compass[String(period.windDirection || '').toUpperCase()] ?? null,
    };
  });
  return slimStepsForecast(steps);
}

export function slimBmkgForecast(raw) {
  const days = raw?.forecast?.data?.[0]?.cuaca;
  if (!Array.isArray(days)) return null;
  const steps = [];
  for (const day of days) {
    if (!Array.isArray(day)) continue;
    for (const hour of day) {
      steps.push({
        time: hour.datetime || hour.utc_datetime,
        temperature: hour.t ?? null,
        precipitation: hour.tp ?? null,
        precipitationProbability: null,
        windSpeed: hour.ws == null ? null : Number(hour.ws) * 3.6,
        windDirection: hour.wd_deg ?? null,
      });
    }
  }
  return slimStepsForecast(steps);
}

export function slimMeteoamForecast(raw) {
  const times = raw?.forecast?.timeseries;
  const ds = raw?.forecast?.datasets?.['0'];
  if (!Array.isArray(times) || !ds || times.length < 2) return null;

  const temp = ds['0'] || {};
  const pop = ds['3'] || {};
  const wdir = ds['4'] || {};
  const wkmh = ds['7'] || {};

  const steps = times.map((time, i) => {
    const key = String(i);
    const dirRaw = wdir[key];
    const dir = dirRaw === 'VRB' || dirRaw == null ? null : Number(dirRaw);
    return {
      time,
      temperature: temp[key] ?? null,
      precipitation: null,
      precipitationProbability: pop[key] ?? null,
      windSpeed: wkmh[key] ?? null,
      windDirection: Number.isFinite(dir) ? dir : null,
    };
  });
  return slimStepsForecast(steps);
}

export function slimAccuweatherForecast(raw) {
  const hourly = raw?.hourly;
  if (!Array.isArray(hourly) || hourly.length < 2) return null;
  const steps = hourly.map((hour) => ({
    time: hour.EpochDateTime ? new Date(hour.EpochDateTime * 1000).toISOString() : hour.DateTime,
    temperature: hour.Temperature?.Value ?? null,
    precipitation: hour.Rain?.Value ?? hour.TotalLiquid?.Value ?? null,
    precipitationProbability: hour.PrecipitationProbability ?? null,
    windSpeed: hour.Wind?.Speed?.Value ?? null,
    windDirection: hour.Wind?.Direction?.Degrees ?? null,
  }));
  return slimStepsForecast(steps);
}

export function slimMeteosourceForecast(raw) {
  const series = raw?.hourly?.data;
  if (!Array.isArray(series) || series.length < 2) return null;
  const steps = series.map((hour) => ({
    time: hour.date,
    temperature: hour.temperature ?? null,
    precipitation: hour.precipitation?.total ?? null,
    precipitationProbability: hour.probability?.precipitation ?? null,
    // metric units: wind.speed is m/s
    windSpeed: hour.wind?.speed == null ? null : Number(hour.wind.speed) * 3.6,
    windDirection: hour.wind?.angle ?? null,
  }));
  return slimStepsForecast(steps);
}

export function slimWeatherbitForecast(raw) {
  // Free tier has no hourly — only include series when paid hourly is present.
  const hourly = raw?.hourly;
  if (!Array.isArray(hourly) || hourly.length < 2) return null;
  const steps = hourly.map((hour) => ({
    time: hour.timestamp
      ? new Date(hour.timestamp * 1000).toISOString()
      : hour.datetime
        ? `${String(hour.datetime).replace(' ', 'T')}:00Z`
        : null,
    temperature: hour.temp ?? null,
    precipitation: hour.precip ?? null,
    precipitationProbability: hour.pop ?? null,
    windSpeed: hour.wind_spd == null ? null : Number(hour.wind_spd) * 3.6,
    windDirection: hour.wind_dir ?? null,
  }));
  return slimStepsForecast(steps);
}

export function slimXweatherForecast(raw) {
  const periods = raw?.forecast?.periods;
  if (!Array.isArray(periods) || periods.length < 2) return null;
  const steps = periods.map((period) => ({
    time: period.dateTimeISO || (period.timestamp ? new Date(period.timestamp * 1000).toISOString() : null),
    temperature: period.tempC ?? period.avgTempC ?? null,
    precipitation: period.precipMM ?? null,
    precipitationProbability: period.pop ?? null,
    windSpeed: period.windSpeedKPH ?? null,
    windDirection: period.windDirDEG ?? null,
  }));
  return slimStepsForecast(steps);
}

export function slimTomorrowioForecast(raw) {
  const hourly = raw?.timelines?.hourly;
  if (!Array.isArray(hourly) || hourly.length < 2) return null;
  const steps = hourly.map((hour) => {
    const v = hour.values || {};
    const rain = Number(v.rainIntensity) || 0;
    const snow = Number(v.snowIntensity) || 0;
    const sleet = Number(v.sleetIntensity) || 0;
    const freezing = Number(v.freezingRainIntensity) || 0;
    const precip =
      v.precipitationIntensity != null
        ? v.precipitationIntensity
        : rain + snow + sleet + freezing;
    return {
      time: hour.time,
      temperature: v.temperature ?? null,
      precipitation: precip,
      precipitationProbability: v.precipitationProbability ?? null,
      windSpeed: v.windSpeed == null ? null : Number(v.windSpeed) * 3.6,
      windDirection: v.windDirection ?? null,
    };
  });
  return slimStepsForecast(steps);
}

/**
 * OpenWeatherMap: prefer One Call hourly (48h), else expand 5-day/3h forecast
 * into hourly steps (precip ≈ rain.3h / 3).
 */
export function slimOpenWeatherMapForecast(raw) {
  const onecallHourly = raw?.onecall?.hourly;
  if (Array.isArray(onecallHourly) && onecallHourly.length > 1) {
    const steps = onecallHourly.map((hour) => ({
      time: new Date((hour.dt || 0) * 1000).toISOString(),
      temperature: hour.temp ?? null,
      precipitation: (Number(hour.rain?.['1h']) || 0) + (Number(hour.snow?.['1h']) || 0),
      precipitationProbability:
        hour.pop == null || !Number.isFinite(Number(hour.pop)) ? null : Number(hour.pop) * 100,
      windSpeed: hour.wind_speed == null ? null : Number(hour.wind_speed) * 3.6,
      windDirection: hour.wind_deg ?? null,
    }));
    return { steps };
  }

  const list = raw?.forecast?.list;
  if (!Array.isArray(list) || !list.length) return null;

  const steps = [];
  for (const item of list) {
    const end = new Date((item.dt || 0) * 1000);
    if (Number.isNaN(end.getTime())) continue;
    const precip3 =
      (Number(item.rain?.['3h']) || 0) + (Number(item.snow?.['3h']) || 0);
    const precipHour = precip3 / 3;
    const pop =
      item.pop == null || !Number.isFinite(Number(item.pop)) ? null : Number(item.pop) * 100;
    const windKmh = item.wind?.speed == null ? null : Number(item.wind.speed) * 3.6;
    // OWM 3h step → three hourly slots ending at dt.
    for (let back = 2; back >= 0; back -= 1) {
      const time = new Date(end.getTime() - back * 60 * 60 * 1000);
      steps.push({
        time: time.toISOString(),
        temperature: item.main?.temp ?? null,
        precipitation: precipHour,
        precipitationProbability: pop,
        windSpeed: windKmh,
        windDirection: item.wind?.deg ?? null,
      });
    }
  }

  return steps.length ? { steps } : null;
}

/**
 * Build a chart-ready forecast series from a settled provider result.
 * Observations are skipped — they have no forecast horizon.
 */
export function extractForecastSeries(provider, value, observationIds) {
  if (!provider?.id || !value || observationIds?.has(provider.id)) return null;
  if (provider.weight === 0) return null;

  const weight = Number(provider.weight);
  const base = {
    id: provider.id,
    name: provider.name,
    weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
  };

  if (provider.id === 'aladin') {
    const data = slimAladinForecast(value.raw);
    return data ? { ...base, kind: 'aladin', data } : null;
  }

  if (provider.id === 'yr') {
    const data = slimYrForecast(value.raw);
    return data ? { ...base, kind: 'yr', data } : null;
  }

  if (provider.id === 'wttr') {
    const data = slimWttrForecast(value.raw);
    return data ? { ...base, kind: 'wttr', data } : null;
  }

  if (provider.id === 'weathercom') {
    const data = slimWeatherComForecast(value.raw);
    return data ? { ...base, kind: 'weathercom', data } : null;
  }

  if (provider.id === 'openweathermap') {
    const data = slimOpenWeatherMapForecast(value.raw);
    return data ? { ...base, kind: 'openweathermap', data } : null;
  }

  const stepsProviders = {
    smhi: slimSmhiForecast,
    fmi: slimFmiForecast,
    nws: slimNwsForecast,
    bmkg: slimBmkgForecast,
    meteoam: slimMeteoamForecast,
    accuweather: slimAccuweatherForecast,
    tomorrowio: slimTomorrowioForecast,
    meteosource: slimMeteosourceForecast,
    xweather: slimXweatherForecast,
    weatherbit: slimWeatherbitForecast,
  };
  const slimFn = stepsProviders[provider.id];
  if (slimFn) {
    const data = slimFn(value.raw);
    return data ? { ...base, kind: 'steps', data } : null;
  }

  const hourly = slimOpenMeteoHourly(value.raw?.hourly);
  if (hourly) {
    return { ...base, kind: 'openmeteo', data: hourly };
  }

  return null;
}
