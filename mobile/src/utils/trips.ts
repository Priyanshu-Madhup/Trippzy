import type { TripWithStats } from '@/types';
import { todayISO } from './date';

/** A cover photo is probably being looked up right now: the trip has a destination, no photo yet, and was just updated. */
export function coverPending(t: { destination?: string | null; cover_image_url?: string | null; updated_at: string }, now = Date.now()): boolean {
  return !!t.destination && !t.cover_image_url && now - new Date(t.updated_at).getTime() < 120_000;
}

/** Ongoing trip first, then the soonest upcoming one; undated trips come last. Finished trips are excluded. */
export function upcomingTrips<T extends Pick<TripWithStats, 'start_date' | 'end_date'>>(trips: T[], today = todayISO()): T[] {
  return trips
    .filter((t) => {
      const end = t.end_date ?? t.start_date;
      return !end || end >= today;
    })
    .sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'));
}
