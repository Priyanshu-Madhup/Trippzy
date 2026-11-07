import { formatBytes, gradientFor, hashHue, initials, plural } from '@/lib/utils';

describe('utils', () => {
  it('derives a stable hue and gradient (same seed → same colours across devices)', () => {
    expect(hashHue('Paris')).toBe(hashHue('Paris'));
    expect(hashHue('Paris')).not.toBe(hashHue('Tokyo'));
    expect(hashHue('x')).toBeGreaterThanOrEqual(0);
    expect(hashHue('x')).toBeLessThan(360);
    const [a, b, c] = gradientFor('Paris');
    expect([a, b, c].every((s) => /^hsl\(\d+, \d+%, \d+%\)$/.test(s))).toBe(true);
    expect(gradientFor('')).toEqual(gradientFor('trip')); // empty seed falls back to "trip"
  });

  it('makes initials', () => {
    expect(initials('Alex Morgan')).toBe('AM');
    expect(initials('Madonna')).toBe('MA');
    expect(initials('  ')).toBe('?');
    expect(initials(null, '•')).toBe('•');
  });

  it('formats sizes and plurals', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(plural(1, 'booking')).toBe('1 booking');
    expect(plural(3, 'booking')).toBe('3 bookings');
  });
});
