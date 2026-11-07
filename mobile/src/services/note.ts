import type { TripNote } from '@/types';
import { apiFetch } from './api';

/** The phone's position goes to our server for this one request only (it is not stored) to work out the drive. */
export function getTripNote(tripId: string, body: { lat: number; lng: number; timezone: string | null; refresh?: boolean }) {
  return apiFetch<TripNote>(`/v1/trips/${tripId}/note`, { method: 'POST', body: JSON.stringify(body), timeoutMs: 50_000 });
}
