import { BedDouble, BusFront, FileText, Plane, Ticket as TicketIcon, TrainFront, UtensilsCrossed, type LucideIcon } from 'lucide-react-native';
import type { DocumentExtraction, DocumentType, FlightData, FlightSegment, Ticket } from '@/types';

// ─── Type metadata ──────────────────────────────────────────────────

export interface TypeMeta {
  label: string;
  icon: LucideIcon;
  /** Classes for the small icon tile: background + (icon) text colour. */
  tile: string;
  text: string;
}

export const TYPE_META: Record<DocumentType, TypeMeta> = {
  flight: { label: 'Flight', icon: Plane, tile: 'bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300' },
  hotel: { label: 'Hotel', icon: BedDouble, tile: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  train: { label: 'Train', icon: TrainFront, tile: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300' },
  bus: { label: 'Bus', icon: BusFront, tile: 'bg-orange-500/10', text: 'text-orange-700 dark:text-orange-300' },
  restaurant: { label: 'Dining', icon: UtensilsCrossed, tile: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300' },
  activity: { label: 'Activity', icon: TicketIcon, tile: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
  generic_travel_document: { label: 'Document', icon: FileText, tile: 'bg-stone-500/10', text: 'text-stone-700 dark:text-stone-300' },
  unknown: { label: 'Document', icon: FileText, tile: 'bg-stone-500/10', text: 'text-stone-700 dark:text-stone-300' },
};

export type FilterKey = 'all' | 'flight' | 'hotel' | 'train' | 'bus' | 'activity' | 'document';

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'flight', label: 'Flights' },
  { key: 'hotel', label: 'Hotels' },
  { key: 'train', label: 'Trains' },
  { key: 'bus', label: 'Bus' },
  { key: 'activity', label: 'Activities' },
  { key: 'document', label: 'Documents' },
];

export function matchesFilter(type: DocumentType, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'activity') return type === 'activity' || type === 'restaurant';
  if (filter === 'document') return type === 'generic_travel_document' || type === 'unknown';
  return type === filter;
}

/** Splits items into the app's categories (Flights, Hotels, Trains…), in a fixed order, dropping empty ones. */
export function groupByCategory<T>(items: T[], typeOf: (item: T) => DocumentType): { key: FilterKey; label: string; items: T[] }[] {
  return FILTERS.filter((f) => f.key !== 'all')
    .map((f) => ({ key: f.key, label: f.label, items: items.filter((i) => matchesFilter(typeOf(i), f.key)) }))
    .filter((g) => g.items.length > 0);
}

/** Short summary chips for trip cards, e.g. "Flight • Hotel • Train". */
export function typeSummary(types: DocumentType[]): string[] {
  const order: DocumentType[] = ['flight', 'hotel', 'train', 'bus', 'activity', 'restaurant', 'generic_travel_document'];
  const present = new Set<DocumentType>(types.map((t) => (t === 'unknown' ? 'generic_travel_document' : t)));
  return order.filter((t) => present.has(t)).map((t) => TYPE_META[t].label);
}

// ─── Typed accessors ────────────────────────────────────────────────

/** `structured_data.details` narrowed by document type (the schema models it as a union). */
export function detailsOf<T>(ticket: Ticket, type: DocumentType): T | null {
  const data = ticket.structured_data;
  if (!data || data.document_type !== type) return null;
  return data.details as unknown as T;
}

// ─── Flight journey ─────────────────────────────────────────────────

export interface FlightJourney {
  outbound: FlightSegment[];
  inbound: FlightSegment[];
  first: FlightSegment;
  last: FlightSegment;
  stops: string[];
}

function stamp(date: string | null | undefined, time: string | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(`${date}T${time ?? '12:00'}:00Z`).getTime();
  return Number.isNaN(t) ? null : t;
}

type Place = { airport_code?: string | null; city?: string | null } | undefined;

function samePlace(a: Place, b: Place) {
  if (a?.airport_code && b?.airport_code) return a.airport_code === b.airport_code;
  return !!a?.city && !!b?.city && a.city.toLowerCase() === b.city.toLowerCase();
}

/**
 * Splits an itinerary into outbound / return legs (same rule as the server): a return exists
 * when there is a stay of more than 24h between flights, or when the journey ends where it
 * started — the split is at the longest gap. Gaps compare times at the same airport, so the
 * zone cancels out.
 */
export function flightJourney(data: FlightData | null): FlightJourney | null {
  const segs = data?.segments ?? [];
  if (segs.length === 0) return null;
  let longestGap = -1;
  let longestAt = -1;
  for (let i = 0; i < segs.length - 1; i++) {
    const a = stamp(segs[i].arrival?.date, segs[i].arrival?.time);
    const b = stamp(segs[i + 1].departure?.date, segs[i + 1].departure?.time);
    if (a !== null && b !== null && b - a > longestGap) {
      longestGap = b - a;
      longestAt = i;
    }
  }
  const roundTrip = segs.length >= 2 && samePlace(segs[0].departure, segs[segs.length - 1].arrival);
  let split = segs.length;
  if (longestAt >= 0 && (longestGap > 24 * 3600_000 || (roundTrip && longestGap > 3 * 3600_000))) split = longestAt + 1;
  else if (roundTrip && longestAt < 0) split = Math.ceil(segs.length / 2);

  const outbound = segs.slice(0, split);
  const inbound = segs.slice(split);
  return {
    outbound,
    inbound,
    first: outbound[0],
    last: outbound[outbound.length - 1],
    stops: outbound
      .slice(0, -1)
      .map((s) => s.arrival?.airport_code ?? s.arrival?.city ?? '')
      .filter(Boolean),
  };
}

// ─── View model (columns win — they hold the user's edits) ──────────

export interface TicketView {
  meta: TypeMeta;
  title: string;
  subtitle: string | null;
  date: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  reference: string | null;
  provider: string | null;
}

export function ticketView(ticket: Ticket): TicketView {
  const meta = TYPE_META[ticket.document_type] ?? TYPE_META.unknown;
  const route = ticket.origin && ticket.destination ? `${ticket.origin} → ${ticket.destination}` : null;
  const title = ticket.title ?? route ?? ticket.provider_name ?? ticket.file_name ?? meta.label;
  let subtitle: string | null;
  switch (ticket.document_type) {
    case 'flight':
    case 'train':
    case 'bus':
      subtitle = [ticket.provider_name, title === route ? null : route].filter(Boolean).join(' · ') || null;
      break;
    case 'hotel':
    case 'restaurant':
    case 'activity':
      subtitle = ticket.destination ?? null;
      break;
    default:
      subtitle = ticket.provider_name ?? ticket.summary ?? null;
  }
  return {
    meta,
    title,
    subtitle,
    date: ticket.travel_date ?? null,
    time: ticket.start_time ?? null,
    endDate: ticket.end_date ?? null,
    endTime: ticket.end_time ?? null,
    reference: ticket.booking_reference ?? null,
    provider: ticket.provider_name ?? null,
  };
}

export function ticketSearchText(ticket: Ticket): string {
  return [
    ticket.title,
    ticket.origin,
    ticket.destination,
    ticket.provider_name,
    ticket.booking_platform,
    ticket.booking_reference,
    ticket.file_name,
    ticket.summary,
    ticket.notes,
    TYPE_META[ticket.document_type]?.label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function chronoKey(ticket: Ticket): string {
  return `${ticket.travel_date ?? '9999-12-31'}T${ticket.start_time ?? '99:99'}|${ticket.created_at}`;
}

/** Stuck in processing/uploaded for >3 minutes (app killed mid-way) → can be retried. */
export function isStale(ticket: Ticket, now = Date.now()): boolean {
  return (
    (ticket.processing_status === 'processing' || ticket.processing_status === 'uploaded') &&
    now - new Date(ticket.updated_at).getTime() > 3 * 60_000
  );
}

export type { DocumentExtraction };
