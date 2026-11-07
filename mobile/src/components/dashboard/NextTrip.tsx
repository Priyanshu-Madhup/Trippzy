import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { ArrowRight, ChevronRight, CircleAlert, Info } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { DestinationImage } from '@/components/common/DestinationImage';
import { Flag } from '@/components/common/Flag';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useTickets } from '@/hooks/useTickets';
import { cn, plural } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { Ticket, Trip, TripWithStats } from '@/types';
import { daysBetween, formatRange, formatShort, relativeDay, todayISO } from '@/utils/date';
import { chronoKey, ticketView } from '@/utils/ticket';
import { coverPending } from '@/utils/trips';

export function NextTripHero({ trip }: { trip: TripWithStats }) {
  const router = useRouter();
  const card = useShadow('card');
  const today = todayISO();
  const ongoing = !!trip.start_date && trip.start_date <= today && (trip.end_date ?? trip.start_date) >= today;
  const countdown = daysBetween(today, trip.start_date);
  const bookings = trip.tickets.filter((t) => t.processing_status === 'completed').length;

  return (
    <Pressable onPress={() => router.push(`/trip/${trip.id}`)} accessibilityRole="button" accessibilityLabel={`Open ${trip.name}`} style={card} className="overflow-hidden rounded-hero active:-translate-y-0.5">
      <DestinationImage src={trip.cover_image_url} seed={trip.destination ?? trip.name} priority pending={coverPending(trip)} pendingLabel={trip.destination} style={{ height: 340 }}>
        <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']} locations={[0, 0.4, 1]} style={{ position: 'absolute', inset: 0 }} />
        <View className="absolute left-5 top-5 rounded-full bg-white/20 px-3 py-1.5">
          <Text className="font-geist-semibold text-xs text-white">{ongoing ? 'Happening now' : 'Your next trip'}</Text>
        </View>
        {!ongoing && countdown !== null && countdown > 0 ? (
          <View className="absolute right-5 top-4 items-end">
            <Text className="font-geist-semibold text-[40px] leading-[40px] text-white" style={{ letterSpacing: -2 }}>
              {countdown}
            </Text>
            <Text className="font-geist-medium text-xs text-white/75">{countdown === 1 ? 'day to go' : 'days to go'}</Text>
          </View>
        ) : null}
        <View className="absolute inset-x-6 bottom-6">
          <View className="flex-row items-center gap-2">
            <Flag code={trip.country_code} height={14} />
            <Text numberOfLines={1} className="flex-1 font-geist-medium text-sm text-white/80">
              {trip.destination ? trip.name : 'Trip'}
              {trip.country && trip.country !== trip.destination ? <Text className="text-white/60"> · {trip.country}</Text> : null}
            </Text>
          </View>
          <Text className="mt-1 font-geist-semibold text-[44px] uppercase leading-[40px] text-white" style={{ letterSpacing: -1.98 }} numberOfLines={2}>
            {trip.destination ?? trip.name}
          </Text>
          <View className="mt-4 flex-row flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-3.5">
            <Text className="flex-1 font-geist-medium text-[15px] text-white">
              {formatRange(trip.start_date, trip.end_date).toUpperCase() || 'Dates will appear as you add tickets'}
              <Text className="text-white/65">{'  '}{plural(bookings, 'booking')}</Text>
            </Text>
            <View className="flex-row items-center gap-1.5 rounded-full bg-white px-4 py-2">
              <Text className="font-geist-semibold text-sm text-[#111]">Open trip</Text>
              <Icon as={ArrowRight} size={16} className="text-[#111]" />
            </View>
          </View>
        </View>
      </DestinationImage>
    </Pressable>
  );
}

/** The bookings that matter next for a trip, in travel order. */
export function TripEssentials({ trip }: { trip: Trip }) {
  const soft = useShadow('soft');
  const { data: tickets, isLoading } = useTickets(trip.id);
  const today = todayISO();
  const list = (tickets ?? [])
    .filter((t) => t.processing_status !== 'completed' || !t.travel_date || (t.end_date ?? t.travel_date) >= today)
    .sort((a, b) => chronoKey(a).localeCompare(chronoKey(b)))
    .slice(0, 6);
  const attention = (tickets ?? []).filter((t) => t.processing_status === 'failed' || t.needs_review).length;

  return (
    <View style={soft} className="rounded-card border border-line bg-surface p-5" accessibilityLabel="Tickets for this trip">
      <View className="mb-3 flex-row items-end justify-between gap-3">
        <View>
          <Text className="font-geist-semibold text-lg tracking-tight">Tickets for this trip</Text>
          <Text className="text-[13px] text-muted">What you’ll need, in order.</Text>
        </View>
        <Link href={`/trip/${trip.id}`} asChild>
          <Pressable className="flex-row items-center" accessibilityRole="link">
            <Text className="font-geist-medium text-sm text-muted">All</Text>
            <Icon as={ChevronRight} size={16} className="text-muted" />
          </Pressable>
        </Link>
      </View>

      {attention ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-warning-bg px-3 py-2">
          <Icon as={Info} size={16} className="text-warning" />
          <Text className="flex-1 text-[13px] text-warning">
            {plural(attention, 'ticket')} {attention === 1 ? 'needs' : 'need'} a quick check.
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <View className="gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </View>
      ) : list.length === 0 ? (
        <View className="items-center rounded-2xl bg-surface-2/70 p-5">
          <Text className="font-geist-medium text-sm">No tickets yet</Text>
          <Text className="mt-1 text-center text-[13px] text-muted">Open the trip to upload flights, hotels and bookings.</Text>
          <Link href={`/trip/${trip.id}`} asChild>
            <Pressable accessibilityRole="button" className="mt-4 h-10 flex-row items-center gap-1.5 rounded-full bg-primary px-4">
              <Text className="font-geist-semibold text-sm text-primary-ink">Open trip</Text>
              <Icon as={ArrowRight} size={16} className="text-primary-ink" />
            </Pressable>
          </Link>
        </View>
      ) : (
        <View className="-mx-2">
          {list.map((t) => (
            <EssentialRow key={t.id} ticket={t} />
          ))}
        </View>
      )}
    </View>
  );
}

function EssentialRow({ ticket }: { ticket: Ticket }) {
  const router = useRouter();
  const view = ticketView(ticket);
  const failed = ticket.processing_status === 'failed';
  const pending = ticket.processing_status === 'processing' || ticket.processing_status === 'uploaded';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trip/[tripId]', params: { tripId: ticket.trip_id, focus: ticket.id } })}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-surface-2/70"
    >
      <View className={cn('size-10 items-center justify-center rounded-xl', failed ? 'bg-danger-bg' : view.meta.tile)}>
        <Icon as={failed ? CircleAlert : view.meta.icon} size={18} className={failed ? 'text-danger' : view.meta.text} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
          {pending || failed ? (ticket.file_name ?? view.title) : view.title}
        </Text>
        <Text numberOfLines={1} className="text-[13px] text-muted">
          {failed ? 'Couldn’t read — tap to retry' : pending ? 'Reading…' : [view.meta.label, view.provider, view.reference].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {view.date ? (
        <View className="items-end">
          <Text className="font-geist-semibold text-[13px]">{formatShort(view.date)}</Text>
          {view.time ? <Text className="font-geist-mono text-xs text-muted">{view.time}</Text> : <Text className="text-xs text-muted">{relativeDay(view.date)}</Text>}
        </View>
      ) : null}
    </Pressable>
  );
}
