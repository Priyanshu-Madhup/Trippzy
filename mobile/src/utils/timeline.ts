import type { DocumentType, Ticket } from '@/types';
import { chronoKey, ticketView } from './ticket';

export interface TimelineEvent {
  key: string;
  ticketId: string;
  type: DocumentType;
  date: string | null;
  time: string | null;
  label: string;
  title: string;
  detail: string | null;
  checkout?: boolean;
}

const TRANSPORT = new Set<DocumentType>(['flight', 'train', 'bus']);

/** One event per finished ticket, plus a "Check-out" event for stays — in travel order. */
export function buildEvents(tickets: Ticket[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const t of [...tickets].sort((a, b) => chronoKey(a).localeCompare(chronoKey(b)))) {
    if (t.processing_status !== 'completed') continue;
    const view = ticketView(t);
    const route = t.origin && t.destination ? `${t.origin} → ${t.destination}` : null;
    const times = t.start_time && t.end_time && t.document_type !== 'hotel' ? `${t.start_time} → ${t.end_time}` : t.start_time;

    let detail: string | null;
    switch (t.document_type) {
      case 'flight':
      case 'train':
      case 'bus':
        detail = [view.provider, times].filter(Boolean).join(' · ') || null;
        break;
      case 'hotel':
        detail = [t.destination, t.start_time ? `Check-in ${t.start_time}` : null].filter(Boolean).join(' · ') || null;
        break;
      default:
        detail = [t.destination, times].filter(Boolean).join(' · ') || null;
    }

    events.push({
      key: t.id,
      ticketId: t.id,
      type: t.document_type,
      date: t.travel_date ?? null,
      time: t.start_time ?? null,
      label: t.structured_data?.leg === 'return' ? 'Return flight' : view.meta.label,
      title: TRANSPORT.has(t.document_type) ? (route ?? view.title) : view.title,
      detail,
    });

    if (t.document_type === 'hotel' && t.end_date && t.end_date !== t.travel_date) {
      events.push({
        key: `${t.id}-out`,
        ticketId: t.id,
        type: 'hotel',
        date: t.end_date,
        time: t.end_time ?? '23:59',
        label: 'Check-out',
        title: view.title,
        detail: t.end_time ? `Check-out ${t.end_time}` : null,
        checkout: true,
      });
    }
  }
  return events.sort((a, b) => `${a.date ?? '9999'}${a.time ?? '99'}`.localeCompare(`${b.date ?? '9999'}${b.time ?? '99'}`));
}

/** Group events by day ("undated" last), preserving order. */
export function groupByDay(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const k = e.date ?? 'undated';
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.entries()];
}
