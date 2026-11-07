import { BedDouble, CloudSun, Image as ImageIcon, MapPinned, Newspaper, Sparkles, Ticket, type LucideIcon } from 'lucide-react-native';

export type WidgetId = 'hero' | 'note' | 'weather' | 'essentials' | 'about' | 'news' | 'upcoming';

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  hint: string;
  icon: LucideIcon;
  /** Pinned to the top: can't be moved or displaced. */
  locked?: boolean;
}

/** The Home screen's widgets, in their default order (the server uses the same list). */
export const WIDGETS: WidgetMeta[] = [
  { id: 'hero', title: 'Next trip', hint: 'Your upcoming trip’s photo and countdown', icon: ImageIcon, locked: true },
  { id: 'note', title: 'Trippzy note', hint: 'When to leave for your next flight or train', icon: Sparkles },
  { id: 'weather', title: 'Weather', hint: 'Conditions and forecast at your destination', icon: CloudSun },
  { id: 'essentials', title: 'Tickets for this trip', hint: 'What you’ll need, in order', icon: Ticket },
  { id: 'about', title: 'About the place', hint: 'A short overview of your destination', icon: MapPinned },
  { id: 'news', title: 'Local news', hint: 'Latest news around your destination', icon: Newspaper },
  { id: 'upcoming', title: 'Also coming up', hint: 'Your other upcoming trips', icon: BedDouble },
];

export const DEFAULT_ORDER: WidgetId[] = WIDGETS.map((w) => w.id);
export const WIDGET_BY_ID = Object.fromEntries(WIDGETS.map((w) => [w.id, w])) as Record<WidgetId, WidgetMeta>;

/** A saved order → a complete, valid one: unknown ids dropped, missing ones appended, the locked widget first. */
export function normalizeOrder(saved: readonly string[] | null | undefined): WidgetId[] {
  const known = new Set<string>(DEFAULT_ORDER);
  const seen: WidgetId[] = [];
  for (const id of saved ?? []) if (known.has(id) && !seen.includes(id as WidgetId)) seen.push(id as WidgetId);
  const all = [...seen, ...DEFAULT_ORDER.filter((id) => !seen.includes(id))];
  const locked = WIDGETS.filter((w) => w.locked).map((w) => w.id);
  return [...locked, ...all.filter((id) => !locked.includes(id))];
}
