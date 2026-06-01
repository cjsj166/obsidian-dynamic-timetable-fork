// Pure date helpers operating on `YYYY-MM-DD` strings.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: string): boolean {
  return ISO_RE.test(s.trim());
}

/** Construct a local Date at midnight from a `YYYY-MM-DD` string. */
function toDate(iso: string): Date {
  const m = iso.trim().match(ISO_RE);
  if (!m) {
    throw new Error(`invalid date: ${iso}`);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Return a new `YYYY-MM-DD` shifted by `n` days (may be negative). */
export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return formatISO(d);
}

/** Whole-day difference b - a (a, b are `YYYY-MM-DD`). */
export function diffDays(a: string, b: string): number {
  const ms = toDate(b).getTime() - toDate(a).getTime();
  return Math.round(ms / 86400000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Short display label, e.g. "Mon 6/2". */
export function formatShort(iso: string): string {
  const d = toDate(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** Today's date as `YYYY-MM-DD` in local time. */
export function todayISO(now: Date = new Date()): string {
  return formatISO(now);
}
