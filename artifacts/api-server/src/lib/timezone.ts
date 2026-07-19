/**
 * Small timezone helpers built on Intl (no external dependency needed —
 * Node ships full ICU by default). Handles DST correctly for any IANA zone.
 */

/** Converts a wall-clock date+time in `timeZone` to the correct UTC instant. */
export function localWallClockToUtc(dateStr: string, hhmm: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);

  // Guess the instant by treating the wall-clock values as UTC, then measure
  // how far that guess actually lands from the target zone's wall clock, and
  // correct for the difference (this naturally accounts for DST).
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(guessUtcMs)).map((p) => [p.type, p.value]),
  );
  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs);
}

/** The current wall-clock hour/minute in `timeZone`. */
export function getWallClockTime(date: Date, timeZone: string): { hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), minute: Number(parts.minute) };
}
