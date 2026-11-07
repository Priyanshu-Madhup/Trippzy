import type { Ticket, TripNote } from '@/types';

/** A note kept on the phone, with what it was built from. */
export interface StoredNote {
  note: TripNote;
  /** Fingerprint of the trip's tickets when the note was made. */
  sig: string;
  lat: number;
  lng: number;
  /** When it was fetched (ms). */
  at: number;
}

/** Changes whenever a ticket is added, edited, re-read or removed. */
export function ticketSignature(tickets: Pick<Ticket, 'id' | 'updated_at' | 'processing_status'>[] | undefined): string {
  return (tickets ?? [])
    .map((t) => `${t.id}:${t.updated_at}:${t.processing_status}`)
    .sort()
    .join('|');
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** How long the server says this note stays good. "No upcoming trip" is cheap to recompute, so it only needs a short hold. */
export function freshForMs(note: TripNote): number {
  return (note.fresh_for_s ?? (note.state === 'no_departure' ? 600 : 0)) * 1000;
}

export const MOVED_KM = 1;

/** True when asking the server again would give the same answer: same tickets, still near the same spot, not too old. */
export function canReuse(stored: StoredNote | null, sig: string, here: { lat: number; lng: number } | null, now: number): stored is StoredNote {
  if (!stored || stored.sig !== sig) return false;
  if (now - stored.at >= freshForMs(stored.note)) return false;
  return !!here && distanceKm(stored, here) < MOVED_KM;
}
