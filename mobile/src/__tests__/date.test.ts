import { daysBetween, durationLabel, formatLong, formatRange, formatShort, greeting, minutesLabel, parseDate, relativeDay, toISO } from '@/utils/date';

describe('dates', () => {
  afterEach(() => jest.useRealTimers());

  it('parses YYYY-MM-DD as a local date (no UTC off-by-one)', () => {
    const d = parseDate('2026-10-12')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 12]);
    expect(toISO(d)).toBe('2026-10-12');
    expect(parseDate('nope')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it('formats like Trippy', () => {
    expect(formatShort('2026-10-12')).toBe('12 Oct');
    expect(formatLong('2026-10-12')).toBe('12 Oct 2026');
    expect(formatRange('2026-10-12', '2026-10-19')).toBe('12 Oct — 19 Oct 2026');
    expect(formatRange('2026-12-30', '2027-01-03')).toBe('30 Dec 2026 — 3 Jan 2027');
    expect(formatRange('2026-10-12', '2026-10-12')).toBe('12 Oct 2026');
    expect(formatRange(null, '2026-10-12')).toBe('Until 12 Oct 2026');
    expect(formatRange(null, null)).toBe('');
  });

  it('counts days across month ends', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween(null, '2026-11-02')).toBeNull();
  });

  it('describes days relative to today', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 12, 9, 0));
    expect(relativeDay('2026-10-12')).toBe('Today');
    expect(relativeDay('2026-10-13')).toBe('Tomorrow');
    expect(relativeDay('2026-10-11')).toBe('Yesterday');
    expect(relativeDay('2026-10-18')).toBe('In 6 days');
    expect(relativeDay('2026-11-12')).toBe('In 4 weeks');
    expect(relativeDay('2026-08-01')).toBe('2 months ago');
  });

  it('greets by time of day (night counts as evening, like Trippy)', () => {
    expect(greeting(new Date(2026, 0, 1, 3))).toBe('Good evening');
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 20))).toBe('Good evening');
  });

  it('labels durations', () => {
    expect(minutesLabel(270)).toBe('4h 30m');
    expect(minutesLabel(120)).toBe('2h');
    expect(minutesLabel(45)).toBe('45m');
    expect(minutesLabel(null)).toBeNull();
    expect(minutesLabel(99999)).toBeNull(); // implausible
    // same-zone ground transport: overnight arrival
    expect(durationLabel('2026-10-12', '22:00', '2026-10-13', '06:30')).toBe('8h 30m');
    expect(durationLabel('2026-10-12', null, null, null)).toBeNull();
  });
});
