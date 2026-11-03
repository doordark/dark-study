const DAY = 86_400_000;

/** Scene lighting follows the device clock; saved bonuses only advance growth/calendar. */
export function farmTime(realNow: number, timeShift: number, epoch: number) {
  const local = new Date(realNow);
  const hour = local.getHours();
  const growthNow = realNow + timeShift;
  const day = Math.max(1, Math.floor((growthNow - epoch) / DAY) + 1);
  return {
    growthNow,
    day,
    season: Math.floor((day - 1) / 7) % 4,
    night: hour >= 19 || hour < 6,
    clock: `${String(hour).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`,
  };
}
