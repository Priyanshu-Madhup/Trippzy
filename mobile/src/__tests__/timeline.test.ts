import type { Ticket } from '@/types';
import { buildEvents, groupByDay } from '@/utils/timeline';

const t = (over: Partial<Ticket>): Ticket =>
  ({
    id: 'x', trip_id: 'trip', user_id: 'u', has_file: true, document_type: 'flight', processing_status: 'completed', needs_review: false,
    user_edits: [], created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...over,
  }) as Ticket;

describe('itinerary timeline', () => {
  const flight = t({ id: 'f1', origin: 'Bengaluru', destination: 'Dubai', travel_date: '2026-10-12', start_time: '04:15', end_time: '06:30', provider_name: 'Emirates' });
  const hotel = t({ id: 'h1', document_type: 'hotel', title: 'Marriott', destination: 'Dubai', travel_date: '2026-10-12', start_time: '15:00', end_date: '2026-10-19', end_time: '11:00' });
  const ret = t({ id: 'f2', origin: 'Dubai', destination: 'Bengaluru', travel_date: '2026-10-19', start_time: '22:10', structured_data: { leg: 'return' } as Ticket['structured_data'] });

  it('orders events by day and time, and adds a check-out for stays', () => {
    const events = buildEvents([ret, hotel, flight]);
    expect(events.map((e) => e.key)).toEqual(['f1', 'h1', 'h1-out', 'f2']);
    expect(events.find((e) => e.key === 'h1-out')).toMatchObject({ label: 'Check-out', checkout: true, date: '2026-10-19', detail: 'Check-out 11:00' });
  });

  it('titles transport by route and labels the return leg', () => {
    const [out, , , back] = buildEvents([flight, hotel, ret]);
    expect(out.title).toBe('Bengaluru → Dubai');
    expect(out.detail).toBe('Emirates · 04:15 → 06:30');
    expect(back.label).toBe('Return flight');
  });

  it('skips tickets that are not finished and does not duplicate same-day check-outs', () => {
    expect(buildEvents([t({ id: 'p', processing_status: 'processing' }), t({ id: 'e', processing_status: 'failed' })])).toEqual([]);
    const sameDay = buildEvents([t({ id: 'h', document_type: 'hotel', travel_date: '2026-10-12', end_date: '2026-10-12', title: 'Day room' })]);
    expect(sameDay).toHaveLength(1);
  });

  it('groups by day with undated items last', () => {
    const groups = groupByDay(buildEvents([t({ id: 'u', document_type: 'generic_travel_document', title: 'Visa' }), flight, hotel]));
    expect(groups.map(([d]) => d)).toEqual(['2026-10-12', '2026-10-19', 'undated']);
    expect(groups[0][1].map((e) => e.key)).toEqual(['f1', 'h1']);
  });
});
