import type { TripNote } from '@/types';
import { canReuse, distanceKm, ticketSignature, type StoredNote } from '@/utils/noteCache';

const note = (over: Partial<TripNote> = {}) => ({ state: 'ok', fresh_for_s: 1800, ...over }) as TripNote;
const stored = (over: Partial<StoredNote> = {}): StoredNote => ({ note: note(), sig: 'a', lat: 23.34, lng: 85.31, at: 1_000_000, ...over });
const near = { lat: 23.341, lng: 85.311 };

describe('canReuse', () => {
  it('reuses an unchanged, recent note when you have not moved', () => {
    expect(canReuse(stored(), 'a', near, 1_000_000 + 60_000)).toBe(true);
  });
  it('asks again when a ticket changed', () => {
    expect(canReuse(stored(), 'b', near, 1_000_000 + 60_000)).toBe(false);
  });
  it('asks again once the note has aged out', () => {
    expect(canReuse(stored(), 'a', near, 1_000_000 + 1_800_001)).toBe(false);
  });
  it('asks again when you moved about a kilometre or more', () => {
    expect(canReuse(stored(), 'a', { lat: 23.36, lng: 85.31 }, 1_000_000 + 60_000)).toBe(false);
  });
  it('asks when there is no position or no saved note', () => {
    expect(canReuse(stored(), 'a', null, 1_000_000)).toBe(false);
    expect(canReuse(null, 'a', near, 1_000_000)).toBe(false);
  });
  it('holds "no upcoming trip" for ten minutes', () => {
    const s = stored({ note: note({ state: 'no_departure', fresh_for_s: undefined }) });
    expect(canReuse(s, 'a', near, 1_000_000 + 599_000)).toBe(true);
    expect(canReuse(s, 'a', near, 1_000_000 + 601_000)).toBe(false);
  });
});

describe('ticketSignature / distanceKm', () => {
  it('changes when a ticket is edited, ignores order', () => {
    const a = { id: '1', updated_at: 'x', processing_status: 'completed' } as const;
    const b = { id: '2', updated_at: 'y', processing_status: 'completed' } as const;
    expect(ticketSignature([a, b])).toBe(ticketSignature([b, a]));
    expect(ticketSignature([a, b])).not.toBe(ticketSignature([{ ...a, updated_at: 'z' }, b]));
    expect(ticketSignature(undefined)).toBe('');
  });
  it('measures distance', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.2, 0);
  });
});
