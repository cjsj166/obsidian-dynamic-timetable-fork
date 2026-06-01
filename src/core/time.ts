// Pure time helpers. All durations/clocks are represented as integer minutes.

/**
 * Parse a duration token into minutes. Accepts both `H:MM` (e.g. "1:30") and a
 * plain integer count of minutes (e.g. "90"). Returns null for anything else
 * (decimals, "1:5", empty, ...).
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim();
  const hmm = s.match(/^(\d+):(\d{2})$/);
  if (hmm) {
    return Number(hmm[1]) * 60 + Number(hmm[2]);
  }
  if (/^\d+$/.test(s)) {
    return Number(s);
  }
  return null;
}

/** Format minutes as `H:MM` (hours not zero-padded). e.g. 90 -> "1:30". */
export function formatDuration(min: number): string {
  const sign = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

/**
 * Parse a wall-clock time (`HH:MM` or `HHMM`) into minutes-of-day [0, 1440).
 * Returns null when out of range or malformed.
 */
export function parseClock(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) {
    return null;
  }
  return h * 60 + mm;
}

/** Format minutes-of-day as zero-padded 24h `HH:MM`. */
export function formatClock(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
