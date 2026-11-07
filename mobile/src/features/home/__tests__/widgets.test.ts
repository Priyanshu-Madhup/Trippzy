import { DEFAULT_ORDER, normalizeOrder } from '../widgets';

describe('normalizeOrder', () => {
  it('uses the default order when nothing is saved', () => {
    expect(normalizeOrder(null)).toEqual(DEFAULT_ORDER);
    expect(normalizeOrder(undefined)).toEqual(DEFAULT_ORDER);
  });

  it('keeps the saved order, drops unknown ids and duplicates, and appends widgets added later', () => {
    expect(normalizeOrder(['news', 'bogus', 'weather', 'news'])).toEqual(['hero', 'news', 'weather', 'note', 'essentials', 'about', 'upcoming']);
  });

  it('always pins the locked widget first, even if it was saved elsewhere', () => {
    expect(normalizeOrder(['weather', 'hero', 'note'])[0]).toBe('hero');
    expect(normalizeOrder(['weather', 'hero', 'note'])).toHaveLength(DEFAULT_ORDER.length);
  });
});
