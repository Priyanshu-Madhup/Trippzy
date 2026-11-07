import type { FlightData, Ticket } from '@/types';
import { ticketView } from './ticket';

export interface CalendarPlan {
  title: string;
  notes: string;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  /** IANA zone the event is anchored to (flight departure airport), when known. */
  timeZone: string | null;
  /** Alert this many minutes before `start`. */
  alertMinutes: number;
}

const DEFAULT_LEAD: Partial<Record<Ticket['document_type'], number>> = { flight: 180, train: 90, bus: 60, hotel: 120, restaurant: 60, activity: 60 };

/** UTC offset (ms) of `zone` at the instant `at`. */
function zoneOffset(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(at / 1000) * 1000;
}

/** The instant at which the wall clock in `zone` reads `date` `time` (falls back to the phone's own zone). */
export function wallClockToInstant(date: string, time: string, zone: string | null): Date | null {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (![y, mo, d, h, mi].every(Number.isFinite)) return null;
  if (zone) {
    try {
      const guess = Date.UTC(y, mo - 1, d, h, mi);
      let at = guess - zoneOffset(guess, zone);
      at = guess - zoneOffset(at, zone); // second pass handles offsets that change near the guess (DST)
      return new Date(at);
    } catch {
      /* unknown zone on this device → use the phone's zone */
    }
  }
  return new Date(y, mo - 1, d, h, mi);
}

function flightZone(ticket: Ticket): string | null {
  if (ticket.document_type !== 'flight') return null;
  const seg = (ticket.structured_data?.details as unknown as FlightData | undefined)?.segments?.[0];
  return seg?.departure?.timezone ?? null;
}

/**
 * What to put in the phone's calendar for a ticket. The notification wording comes from the AI
 * (`structured_data.reminder`); if it's missing, a plain title/body is built from the ticket's own fields.
 * Returns null when the ticket has no usable date.
 */
export function planCalendarEvent(ticket: Ticket): CalendarPlan | null {
  const v = ticketView(ticket);
  if (!v.date) return null;
  const ai = ticket.structured_data?.reminder;
  const zone = flightZone(ticket);

  const start = v.time ? wallClockToInstant(v.date, v.time, zone) : wallClockToInstant(v.date, '00:00', null);
  if (!start) return null;
  const allDay = !v.time;

  let end: Date | null = null;
  if (v.time && v.endTime) {
    const endZone = ticket.document_type === 'flight' ? ((ticket.structured_data?.details as unknown as FlightData | undefined)?.segments?.slice(-1)[0]?.arrival?.timezone ?? zone) : null;
    end = wallClockToInstant(v.endDate ?? v.date, v.endTime, endZone);
  }
  if (!end || end <= start) end = new Date(start.getTime() + (allDay ? 24 * 3600_000 : 60 * 60_000));

  const facts = [v.provider, v.reference ? `Ref ${v.reference}` : null, v.time ? `at ${v.time}` : null].filter(Boolean).join(' · ');
  const title = (ai?.title?.trim() || `${v.meta.label}: ${v.title}`).slice(0, 120);
  const body = ai?.body?.trim() || facts || (ticket.summary ?? '');
  const lead = ai?.lead_minutes ?? DEFAULT_LEAD[ticket.document_type] ?? 60;

  return {
    title,
    notes: [body, '', 'Added by Trippzy'].join('\n').trim(),
    location: ticket.document_type === 'hotel' ? (ticket.provider_name ?? ticket.destination ?? null) : (ticket.origin ?? null),
    start,
    end,
    allDay,
    timeZone: zone,
    // All-day events start at midnight, so alert the previous evening instead of "0 minutes before".
    alertMinutes: allDay ? 15 * 60 : Math.max(0, Math.min(lead, 4320)),
  };
}
