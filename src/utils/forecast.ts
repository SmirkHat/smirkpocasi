export function firstDailyValue(daily, key) {
  const values = daily?.[key];
  return Array.isArray(values) ? values[0] : null;
}

export function nextHourlyValue(hourly, key) {
  const times = hourly?.time;
  const values = hourly?.[key];
  if (!Array.isArray(times) || !Array.isArray(values)) return null;

  const now = Date.now();
  const index = times.findIndex((time, itemIndex) => {
    const value = values[itemIndex];
    return value !== null && value !== undefined && new Date(time).getTime() >= now;
  });

  return index === -1 ? null : values[index];
}

export function firstAvailable(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}
