import legal from '@/lib/legal.json';
import { needsTerms } from '@/services/terms';

jest.mock('@/services/api', () => ({ apiFetch: jest.fn() }));

describe('needsTerms', () => {
  it('asks a user who has never agreed', () => {
    expect(needsTerms({ terms_accepted_version: null, terms_current_version: '2026-11-08' })).toBe(true);
  });
  it('asks again when the terms moved on', () => {
    expect(needsTerms({ terms_accepted_version: '2026-01-01', terms_current_version: '2026-11-08' })).toBe(true);
  });
  it('lets through someone on the current version', () => {
    expect(needsTerms({ terms_accepted_version: '2026-11-08', terms_current_version: '2026-11-08' })).toBe(false);
  });
  it('never blocks while the profile is unknown', () => {
    expect(needsTerms(undefined)).toBe(false);
    expect(needsTerms({ terms_accepted_version: null, terms_current_version: null })).toBe(false);
  });
});

describe('legal text', () => {
  it('has a version and names a country for every kind of data', () => {
    expect(legal.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(legal.locations.length).toBeGreaterThan(3);
    for (const l of legal.locations) expect(l.where.length).toBeGreaterThan(2);
  });
  it('does not name the technology behind the app', () => {
    const all = JSON.stringify(legal).toLowerCase();
    for (const word of ['clerk', 'mongo', 'cloudflare', 'openrouter', 'railway', 'qwen', 'tomtom', 'expo', 'fastapi']) expect(all).not.toContain(word);
  });
});
