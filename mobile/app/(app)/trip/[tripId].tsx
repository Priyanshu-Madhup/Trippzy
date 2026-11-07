import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Pencil, Plus, RotateCw, SearchX, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { ConfirmSheet } from '@/components/common/ConfirmSheet';
import { EmptyState } from '@/components/common/EmptyState';
import { pullRefresh } from '@/components/common/PullRefresh';
import { FilterTabs, SORT_OPTIONS, SearchBar, SortButton, type SortKey } from '@/components/common/SearchFilter';
import { CollapsibleTicket } from '@/components/tickets/CollapsibleTicket';
import { FailedTicketCard, StaleTicketCard } from '@/components/tickets/CompactTicket';
import { TicketEditSheet } from '@/components/tickets/TicketEditSheet';
import type { TicketHandlers } from '@/components/tickets/types';
import { TripHero, TripHeroSkeleton } from '@/components/trips/TripHero';
import { TripTimeline } from '@/components/trips/TripTimeline';
import { ProcessingCard, type Stage } from '@/components/upload/ProcessingCard';
import { UploadPicker, pickDocuments } from '@/components/upload/UploadPicker';
import { ActionSheet, type Action } from '@/components/ui/ActionSheet';
import { PopoverMenu, type Anchor } from '@/components/ui/PopoverMenu';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useProfile } from '@/hooks/useProfile';
import { useDeleteTicket, useRetryTicket, useTickets } from '@/hooks/useTickets';
import { useDeleteTrip, useTrip } from '@/hooks/useTrips';
import { useUI } from '@/hooks/useUI';
import { useUploads } from '@/hooks/useUpload';
import { plural } from '@/lib/utils';
import { addTicketToCalendar, getAutoAdd, removeTicketFromCalendar } from '@/services/calendar';
import { cacheTicket } from '@/services/offline';
import { todayISO } from '@/utils/date';
import type { Ticket } from '@/types';
import { FILTERS, chronoKey, isStale, matchesFilter, ticketSearchText, ticketView, type FilterKey } from '@/utils/ticket';

const TYPE_ORDER = ['flight', 'train', 'bus', 'hotel', 'activity', 'restaurant', 'generic_travel_document', 'unknown'];

export default function TripDetail() {
  const { tripId, focus } = useLocalSearchParams<{ tripId: string; focus?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { openEditTrip } = useUI();
  const { items, enqueue, dismiss } = useUploads();
  const { data: profile } = useProfile();
  const notify = profile?.preferences?.notifications !== false;

  const { data: trip, isLoading: tripLoading, error: tripError } = useTrip(tripId);
  const { data: tickets, isLoading: ticketsLoading, refetch, isRefetching } = useTickets(tripId);
  const deleteTicket = useDeleteTicket();
  const deleteTrip = useDeleteTrip();
  const retry = useRetryTicket();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [sortMenu, setSortMenu] = useState(false);
  const [tripMenu, setTripMenu] = useState(false);
  const [menu, setMenu] = useState<{ ticket: Ticket; anchor: Anchor } | null>(null);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [confirmTicket, setConfirmTicket] = useState<Ticket | null>(null);
  const [confirmTrip, setConfirmTrip] = useState(false);
  // Cards start compact; tapping one (or its itinerary entry) expands it.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string, open: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // ── jump to a ticket (from the itinerary, or from Home's "Tickets for this trip") ──
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef({ content: 0, section: 0, list: 0 });
  const cardY = useRef(new Map<string, number>());
  const scrollToTicket = useCallback(
    (id: string) => {
      toggle(id, true);
      setTimeout(() => {
        const y = offsets.current.content + offsets.current.section + offsets.current.list + (cardY.current.get(id) ?? 0);
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true });
      }, 380); // let the expand animation settle so we land on the card's final position
    },
    [toggle],
  );
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !focus || !tickets?.some((t) => t.id === focus)) return;
    focused.current = true;
    setTimeout(() => scrollToTicket(focus), 350);
  }, [focus, tickets, scrollToTicket]);

  // ── notices when a ticket finishes (or fails) ──
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!tickets) return;
    const current = new Map(tickets.map((t) => [t.id, t.processing_status]));
    if (seen.current && notify) {
      for (const t of tickets) {
        const before = seen.current.get(t.id);
        const inFlight = before === 'processing' || before === 'uploaded';
        if (inFlight && t.processing_status === 'completed') {
          const v = ticketView(t);
          toast.success(`${v.meta.label} added`, { description: v.title });
          // Optional: drop a reminder (worded by the AI) into the phone calendar.
          void (async () => {
            if (await getAutoAdd()) await addTicketToCalendar(t);
          })();
        } else if (inFlight && t.processing_status === 'failed') {
          toast.error(t.error_message ?? 'Couldn’t read this document.');
        }
      }
    }
    seen.current = current;
  }, [tickets, notify]);

  // ── keep this trip's files on the phone while it's upcoming (offline boarding passes) ──
  useEffect(() => {
    const end = trip?.end_date ?? trip?.start_date;
    if (!tickets || (end && end < todayISO())) return;
    for (const t of tickets.filter((x) => x.processing_status === 'completed' && x.has_file).slice(0, 12)) void cacheTicket(t);
  }, [tickets, trip?.end_date, trip?.start_date]);

  // Uploads still on the phone (queued / uploading / failed before a ticket exists).
  const queue = items.filter((i) => i.tripId === tripId && i.stage !== 'handoff');
  const queuedKey = queue.map((i) => i.ticketId).filter(Boolean).sort().join(',');
  const all = useMemo(() => {
    const queued = new Set(queuedKey.split(','));
    return (tickets ?? []).filter((t) => !queued.has(t.id));
  }, [tickets, queuedKey]);

  const inProgress = all.filter((t) => (t.processing_status === 'processing' || t.processing_status === 'uploaded') && !isStale(t));
  const settled = all.filter((t) => !inProgress.includes(t));
  const bookings = (tickets ?? []).filter((t) => t.processing_status === 'completed').length;

  const counts = useMemo(() => {
    const c: Partial<Record<FilterKey, number>> = {};
    for (const f of FILTERS) c[f.key] = settled.filter((t) => matchesFilter(t.document_type, f.key)).length;
    return c;
  }, [settled]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = settled.filter((t) => matchesFilter(t.document_type, filter) && (!q || ticketSearchText(t).includes(q)));
    if (sort === 'recent') return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sort === 'type') return [...list].sort((a, b) => TYPE_ORDER.indexOf(a.document_type) - TYPE_ORDER.indexOf(b.document_type) || chronoKey(a).localeCompare(chronoKey(b)));
    return [...list].sort((a, b) => chronoKey(a).localeCompare(chronoKey(b)));
  }, [settled, query, filter, sort]);

  const openViewer = (t: Ticket) => router.push({ pathname: '/viewer/[ticketId]', params: { ticketId: t.id } });

  const handlers: TicketHandlers = {
    onOpen: openViewer,
    onMenu: (ticket, anchor) => setMenu({ ticket, anchor }),
    onEdit: setEditing,
    onCalendar: (t) => void addToCalendar(t),
    onRetry: (t) => retry.mutate(t, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not retry.') }),
    onDelete: setConfirmTicket,
  };

  if (tripError || (!tripLoading && !trip)) {
    return (
      <View className="flex-1 justify-center">
        <EmptyState title="Trip not found" description="It may have been deleted, or the link is incomplete." action={<Button onPress={() => router.replace('/')}>Back to your trips</Button>} />
      </View>
    );
  }

  const empty = !ticketsLoading && (tickets?.length ?? 0) === 0 && queue.length === 0;
  const onFiles = (files: Parameters<typeof enqueue>[1]) => tripId && enqueue(tripId, files);

  async function addToCalendar(t: Ticket) {
    const r = await addTicketToCalendar(t);
    if (r === 'added' || r === 'updated') toast.success(r === 'added' ? 'Reminder added to your calendar' : 'Calendar reminder updated');
    else if (r === 'no_date') toast.error('This ticket has no date yet, so there’s nothing to remind you about.');
    else if (r === 'unavailable') toast.error('Calendar reminders need the updated Trippzy app. Install the new build first.');
    else if (r === 'denied') toast.error('Allow calendar access in your phone’s settings to add reminders.');
    else toast.error('Couldn’t add the reminder. Try again.');
  }

  const menuActions = (t: Ticket): Action[] => [
    ...(t.has_file ? [{ label: 'Re-read with AI', icon: RotateCw, onPress: () => handlers.onRetry(t) }] : []),
    { label: 'Delete', icon: Trash2, destructive: true, onPress: () => setConfirmTicket(t) },
  ];

  return (
    <View className="flex-1">
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} refreshControl={pullRefresh(refetch, isRefetching)}>
        {trip ? <TripHero trip={trip} bookings={bookings} onMenu={() => setTripMenu(true)} /> : <TripHeroSkeleton />}

        <View className="gap-6 px-4 pt-8" onLayout={(e) => (offsets.current.content = e.nativeEvent.layout.y)}>
          {queue.length || inProgress.length ? (
            <View className="gap-3">
              {queue.map((i) => (
                <ProcessingCard key={i.key} stage={i.stage as Stage} fileName={i.fileName} fileSize={i.fileSize} uploadProgress={i.progress} error={i.error} onDismiss={() => dismiss(i.key)} />
              ))}
              {inProgress.map((t) => (
                <ProcessingCard key={t.id} stage={(!t.processing_stage || t.processing_stage === 'uploading' ? 'queued' : t.processing_stage) as Stage} fileName={t.file_name ?? 'Document'} fileSize={t.file_size} />
              ))}
            </View>
          ) : null}

          {ticketsLoading ? (
            <View className="gap-3">
              <Skeleton className="h-[72px] rounded-card" />
              <Skeleton className="h-[72px] rounded-card" />
            </View>
          ) : empty ? (
            <View>
              <EmptyState title="Your trip starts here." description="Upload your first ticket or booking confirmation and we’ll organize everything for you." />
              <UploadPicker onFiles={onFiles} />
            </View>
          ) : (
            <>
              <View onLayout={(e) => (offsets.current.section = e.nativeEvent.layout.y)}>
                <View className="mb-4 flex-row items-end justify-between gap-3">
                  <Text className="font-geist-semibold text-xl tracking-tight">Your tickets</Text>
                  <Text className="text-sm text-muted">{plural(all.length, 'item')}</Text>
                </View>
                <View className="mb-4 gap-2">
                  <View className="flex-row items-center gap-2">
                    <View className="min-w-0 flex-1">
                      <SearchBar value={query} onChange={setQuery} placeholder="Search tickets, PNRs, places…" />
                    </View>
                    <SortButton value={sort} onOpen={() => setSortMenu(true)} />
                  </View>
                </View>
                <View className="mb-6">
                  <FilterTabs label="Filter tickets" value={filter} onChange={setFilter} options={FILTERS} counts={counts} />
                </View>

                {visible.length ? (
                  <View className="gap-3" onLayout={(e) => (offsets.current.list = e.nativeEvent.layout.y)}>
                    {visible.map((t, i) =>
                      t.processing_status === 'failed' ? (
                        <FailedTicketCard key={t.id} ticket={t} handlers={handlers} />
                      ) : t.processing_status !== 'completed' ? (
                        <StaleTicketCard key={t.id} ticket={t} handlers={handlers} />
                      ) : (
                        <CollapsibleTicket key={t.id} ticket={t} handlers={handlers} expanded={expanded.has(t.id)} onToggle={toggle} index={i} onLayoutY={(id, y) => cardY.current.set(id, y)} />
                      ),
                    )}
                  </View>
                ) : (
                  <View className="items-center rounded-card border border-dashed border-line-strong py-14">
                    <Icon as={SearchX} size={32} className="text-faint" />
                    <Text className="mt-3 font-geist-semibold">No matching tickets</Text>
                    <Text
                      onPress={() => {
                        setQuery('');
                        setFilter('all');
                      }}
                      className="mt-1 text-sm text-muted underline"
                    >
                      Clear search and filters
                    </Text>
                  </View>
                )}
              </View>

              {all.some((t) => t.processing_status === 'completed') ? (
                <View>
                  <Text className="mb-3 font-geist-semibold text-xl tracking-tight">Itinerary</Text>
                  <TripTimeline tickets={all} onSelect={scrollToTicket} />
                </View>
              ) : null}

              <UploadPicker variant="compact" onFiles={onFiles} />
            </>
          )}
        </View>
      </ScrollView>

      {/* Floating upload button */}
      {!empty && !tripLoading ? (
        <Pressable
          onPress={() => void pickDocuments().then((f) => f.length && onFiles(f))}
          accessibilityRole="button"
          accessibilityLabel="Upload ticket"
          style={{ position: 'absolute', right: 16, bottom: insets.bottom + 20, boxShadow: '0 10px 40px -10px rgba(30,25,15,0.35)' } as object}
          className="h-[52px] flex-row items-center gap-2 rounded-full bg-primary px-5 active:scale-95"
        >
          <Icon as={Plus} size={20} className="text-primary-ink" />
          <Text className="font-geist-semibold text-[15px] text-primary-ink">Upload</Text>
        </Pressable>
      ) : null}

      <ActionSheet
        open={sortMenu}
        onClose={() => setSortMenu(false)}
        title="Sort by"
        actions={SORT_OPTIONS.map((s) => ({ label: s.label, icon: s.key === sort ? Check : undefined, onPress: () => setSort(s.key) }))}
      />
      <ActionSheet
        open={tripMenu}
        onClose={() => setTripMenu(false)}
        title="Trip actions"
        actions={[
          { label: 'Edit trip', icon: Pencil, onPress: () => trip && openEditTrip(trip) },
          { label: 'Delete trip', icon: Trash2, destructive: true, onPress: () => setConfirmTrip(true) },
        ]}
      />
      <PopoverMenu open={!!menu} anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} actions={menu ? menuActions(menu.ticket) : []} />
      <TicketEditSheet ticket={editing} onClose={() => setEditing(null)} />

      <ConfirmSheet
        open={!!confirmTicket}
        onClose={() => setConfirmTicket(null)}
        title="Delete this ticket?"
        description="The card and the original file will be permanently removed."
        loading={deleteTicket.isPending}
        onConfirm={async () => {
          if (!confirmTicket) return;
          try {
            await deleteTicket.mutateAsync(confirmTicket);
            void removeTicketFromCalendar(confirmTicket.id);
            toast.success('Ticket deleted');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not delete the ticket.');
          } finally {
            setConfirmTicket(null);
          }
        }}
      />
      <ConfirmSheet
        open={confirmTrip}
        onClose={() => setConfirmTrip(false)}
        title="Delete this trip?"
        description={`“${trip?.name ?? 'This trip'}” and all of its tickets and files will be permanently removed.`}
        confirmLabel="Delete trip"
        loading={deleteTrip.isPending}
        onConfirm={async () => {
          if (!tripId) return;
          try {
            await deleteTrip.mutateAsync(tripId);
            toast.success('Trip deleted');
            router.replace('/');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not delete the trip.');
          } finally {
            setConfirmTrip(false);
          }
        }}
      />
    </View>
  );
}
