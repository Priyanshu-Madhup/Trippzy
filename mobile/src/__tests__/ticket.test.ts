import type { DocumentType, FlightData, Ticket } from '@/types';
import { chronoKey, flightJourney, groupByCategory, isStale, matchesFilter, ticketSearchText, ticketView, typeSummary } from '@/utils/ticket';

const seg = (from: string, to: string, d1: string, t1: string, d2: string, t2: string, fn = 'X1') => ({
  flight_number: fn,
  departure: { airport_code: from, city: from, date: d1, time: t1 },
  arrival: { airport_code: to, city: to, date: d2, time: t2 },
});
const flight = (segments: ReturnType<typeof seg>[]) => ({ airline: {}, segments, passengers: [] }) as unknown as FlightData;

const ticket = (over: Partial<Ticket> = {}) =>
  ({
    id: 't1', trip_id: 'trip', user_id: 'u', has_file: true, document_type: 'flight', processing_status: 'completed',
    needs_review: false, user_edits: [], created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...over,
  }) as Ticket;

describe('flightJourney', () => {
  it('keeps a one-way connection as one journey and lists the stops', () => {
    const j = flightJourney(flight([seg('BLR', 'DXB', '2026-10-12', '04:15', '2026-10-12', '06:30'), seg('DXB', 'LHR', '2026-10-12', '09:00', '2026-10-12', '13:30')]))!;
    expect(j.inbound).toEqual([]);
    expect(j.stops).toEqual(['DXB']);
    expect([j.first.departure?.airport_code, j.last.arrival?.airport_code]).toEqual(['BLR', 'LHR']);
  });

  it('splits a round trip at the longest gap', () => {
    const j = flightJourney(flight([seg('BLR', 'LHR', '2026-10-12', '04:15', '2026-10-12', '13:30'), seg('LHR', 'BLR', '2026-10-19', '10:00', '2026-10-20', '00:30')]))!;
    expect(j.outbound).toHaveLength(1);
    expect(j.inbound).toHaveLength(1);
  });

  it('assumes a symmetric round trip when no times are printed', () => {
    const noTimes = (a: string, b: string) => ({ flight_number: null, departure: { airport_code: a }, arrival: { airport_code: b } });
    const j = flightJourney({ airline: {}, passengers: [], segments: [noTimes('BLR', 'DXB'), noTimes('DXB', 'BLR')] } as unknown as FlightData)!;
    expect([j.outbound.length, j.inbound.length]).toEqual([1, 1]);
  });

  it('returns null without segments', () => {
    expect(flightJourney(null)).toBeNull();
    expect(flightJourney(flight([]))).toBeNull();
  });
});

describe('ticket helpers', () => {
  it('filters: restaurants count as activities, unknown as documents', () => {
    expect(matchesFilter('restaurant', 'activity')).toBe(true);
    expect(matchesFilter('unknown', 'document')).toBe(true);
    expect(matchesFilter('flight', 'hotel')).toBe(false);
    expect(matchesFilter('bus', 'all')).toBe(true);
  });

  it('summarises types in a stable order, folding unknown into Document', () => {
    expect(typeSummary(['hotel', 'flight', 'unknown', 'flight'])).toEqual(['Flight', 'Hotel', 'Document']);
  });

  it('builds a view: columns win, with sensible fallbacks', () => {
    const v = ticketView(ticket({ title: null, origin: 'Bengaluru', destination: 'Dubai', provider_name: 'Emirates' }));
    expect(v.title).toBe('Bengaluru → Dubai');
    expect(v.subtitle).toBe('Emirates');
    expect(ticketView(ticket({ title: 'My flight', origin: 'A', destination: 'B' })).title).toBe('My flight');
  });

  it('searches across the fields people remember (PNR, city, provider)', () => {
    const t = ticket({ booking_reference: 'QX7K2M', destination: 'Dubai', provider_name: 'Emirates' });
    const text = ticketSearchText(t);
    expect(text).toContain('qx7k2m');
    expect(text).toContain('dubai');
  });

  it('orders by date, then time, with undated last', () => {
    const keys = [ticket({ id: 'a', travel_date: '2026-10-12', start_time: '09:00' }), ticket({ id: 'b', travel_date: '2026-10-12', start_time: '04:15' }), ticket({ id: 'c' })].sort((x, y) => chronoKey(x).localeCompare(chronoKey(y)));
    expect(keys.map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('flags tickets stuck processing for over 3 minutes', () => {
    const now = new Date('2026-10-01T10:10:00Z').getTime();
    expect(isStale(ticket({ processing_status: 'processing', updated_at: '2026-10-01T10:00:00Z' }), now)).toBe(true);
    expect(isStale(ticket({ processing_status: 'processing', updated_at: '2026-10-01T10:08:00Z' }), now)).toBe(false);
    expect(isStale(ticket({ processing_status: 'completed', updated_at: '2026-10-01T10:00:00Z' }), now)).toBe(false);
  });
});

describe('groupByCategory', () => {
  it('groups in the app order and drops empty categories', () => {
    const items = [{ t: 'hotel' }, { t: 'flight' }, { t: 'restaurant' }, { t: 'flight' }, { t: 'unknown' }] as { t: DocumentType }[];
    const g = groupByCategory(items, (i) => i.t);
    expect(g.map((x) => x.key)).toEqual(['flight', 'hotel', 'activity', 'document']);
    expect(g[0].items).toHaveLength(2);
    expect(g.find((x) => x.key === 'train')).toBeUndefined();
  });
});
