const DAY = 86_400_000;

/** Parse YYYY-MM-DD as a *local* date (avoids the UTC off-by-one). */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

// Hermes ships Intl.DateTimeFormat on Android; en-GB gives Trippy's "12 Oct 2026" ordering.
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', options);
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const dayMonthYear = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const weekday = fmt({ weekday: 'short' });
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long' });

/** 12 Oct */
export function formatShort(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? dayMonth.format(d) : '';
}

/** 12 Oct 2026 */
export function formatLong(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? dayMonthYear.format(d) : '';
}

/** 12 OCT 2026 — boarding-pass style */
export function formatPass(value: string | null | undefined): string {
  return formatLong(value).toUpperCase();
}

/** Mon */
export function formatWeekday(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? weekday.format(d) : '';
}

/** Monday 12 October */
export function formatFull(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? longDate.format(d) : '';
}

/** "12 Oct — 19 Oct 2026", "12 Oct 2026", or "" */
export function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s && e) {
    if (start === end) return dayMonthYear.format(s);
    if (s.getFullYear() === e.getFullYear()) return `${dayMonth.format(s)} — ${dayMonthYear.format(e)}`;
    return `${dayMonthYear.format(s)} — ${dayMonthYear.format(e)}`;
  }
  if (s) return dayMonthYear.format(s);
  if (e) return `Until ${dayMonthYear.format(e)}`;
  return '';
}

export function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / DAY);
}

/** "Today", "Tomorrow", "In 6 days", "3 weeks ago" … */
export function relativeDay(value: string | null | undefined): string {
  const diff = daysBetween(todayISO(), value);
  if (diff === null) return '';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const abs = Math.abs(diff);
  const unit = abs >= 60 ? `${Math.round(abs / 30)} months` : abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} days`;
  return diff > 0 ? `In ${unit}` : `${unit} ago`;
}

export function formatUploaded(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dayMonthYear.format(d);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "4h 30m" from a minute count (null when unknown or implausible). */
export function minutesLabel(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0 || minutes > 30 * 60) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/**
 * Duration from local times. Only valid when both ends share a time zone (trains, buses).
 * Flights carry `duration_minutes` computed on the server with real zones — prefer that.
 */
export function durationLabel(
  startDate: string | null,
  startTime: string | null,
  endDate: string | null,
  endTime: string | null,
): string | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const dayDiff = daysBetween(startDate, endDate) ?? 0;
  let minutes = dayDiff * 1440 + (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0 && !endDate) minutes += 1440;
  if (minutes <= 0 || minutes > 4 * 1440) return null;
  return minutesLabel(minutes);
}
