const DAY = 86_400_000;

/** Scene lighting follows the device clock; saved bonuses only advance growth/calendar. */
export function farmTime(realNow: number, timeShift: number, epoch: number) {
  const local = new Date(realNow);
  const hour = local.getHours();
  const period: 'morning' | 'noon' | 'evening' | 'night' = hour >= 6 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'noon' : hour >= 17 && hour < 19 ? 'evening' : 'night';
  const growthNow = realNow + timeShift;
  const day = Math.max(1, Math.floor((growthNow - epoch) / DAY) + 1);
  // Keep the weather steady for each three-hour window, including after reopening.
  const weatherWindow = Math.floor(realNow / 10_800_000);
  const weatherHash = Math.imul(weatherWindow ^ 0x5bd1e995, 0x45d9f3b);
  const weatherRoll = ((weatherHash ^ (weatherHash >>> 16)) >>> 0) % 100;
  const weather: 'clear' | 'rain' = weatherRoll < 30 ? 'rain' : 'clear';
  return {
    growthNow,
    day,
    season: Math.floor((day - 1) / 7) % 4,
    period,
    weather,
    night: hour >= 19 || hour < 6,
    clock: `${String(hour).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`,
  };
}
