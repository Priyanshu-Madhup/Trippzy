import { upcomingTrips } from '@/utils/trips';

const trip = (id: string, start: string | null, end: string | null) => ({ id, start_date: start, end_date: end });

describe('upcomingTrips', () => {
  const today = '2026-10-15';

  it('keeps ongoing and future trips, soonest first, undated last; drops finished trips', () => {
    const list = [trip('future', '2026-12-01', '2026-12-10'), trip('past', '2026-09-01', '2026-09-10'), trip('now', '2026-10-10', '2026-10-20'), trip('undated', null, null), trip('soon', '2026-10-25', null)];
    expect(upcomingTrips(list, today).map((t) => t.id)).toEqual(['now', 'soon', 'future', 'undated']);
  });

  it('treats a trip that ends today as still upcoming (you may be travelling)', () => {
    expect(upcomingTrips([trip('ends-today', '2026-10-10', '2026-10-15')], today)).toHaveLength(1);
    expect(upcomingTrips([trip('ended-yesterday', '2026-10-10', '2026-10-14')], today)).toHaveLength(0);
  });

  it('uses the start date when there is no end date', () => {
    expect(upcomingTrips([trip('single-day-past', '2026-10-01', null)], today)).toHaveLength(0);
  });

  it('does not mutate its input', () => {
    const list = [trip('b', '2026-11-01', null), trip('a', '2026-10-20', null)];
    const copy = [...list];
    upcomingTrips(list, today);
    expect(list).toEqual(copy);
  });
});
