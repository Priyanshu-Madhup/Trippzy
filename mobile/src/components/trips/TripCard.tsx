import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { DestinationImage } from '@/components/common/DestinationImage';
import { Flag } from '@/components/common/Flag';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { plural } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { TripWithStats } from '@/types';
import { formatRange, relativeDay, todayISO } from '@/utils/date';
import { typeSummary } from '@/utils/ticket';

/** Trippy's TripCard: 4:5 destination photo, status pills, name/flag/dates/bookings over a dark gradient. */
export function TripCard({ trip, priority }: { trip: TripWithStats; priority?: boolean }) {
  const router = useRouter();
  const card = useShadow('card');
  const bookings = trip.tickets.filter((t) => t.processing_status !== 'failed').length;
  const chips = typeSummary(trip.tickets.map((t) => t.document_type));
  const processing = trip.tickets.some((t) => t.processing_status === 'processing' || t.processing_status === 'uploaded');
  const today = todayISO();
  const ongoing = !!trip.start_date && trip.start_date <= today && (trip.end_date ?? trip.start_date) >= today;
  const when = ongoing ? 'Happening now' : trip.start_date && trip.start_date > today ? relativeDay(trip.start_date) : null;
  const heading = trip.destination ?? trip.name;

  return (
    <Pressable
      onPress={() => router.push(`/trip/${trip.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${trip.name}${trip.destination ? `, ${trip.destination}` : ''}`}
      style={card}
      className="overflow-hidden rounded-trip bg-surface active:-translate-y-0.5"
    >
      <DestinationImage src={trip.cover_image_url} seed={trip.destination ?? trip.name} priority={priority} style={{ aspectRatio: 4 / 5 }}>
        <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.8)']} locations={[0, 0.4, 1]} style={{ position: 'absolute', inset: 0 }} />
        <View className="absolute inset-x-4 top-4 flex-row items-start justify-between gap-2">
          {when ? (
            <View className="rounded-full bg-white/20 px-3 py-1.5">
              <Text className="font-geist-medium text-xs text-white">{when}</Text>
            </View>
          ) : (
            <View />
          )}
          {processing ? (
            <View className="flex-row items-center rounded-full bg-white/20 px-3 py-1.5">
              <View className="mr-1.5 size-1.5 rounded-full bg-sun" />
              <Text className="font-geist-medium text-xs text-white">Organising…</Text>
            </View>
          ) : null}
        </View>

        <View className="absolute inset-x-5 bottom-5">
          {trip.destination && trip.name !== trip.destination ? (
            <Text numberOfLines={1} className="mb-1 font-geist-medium text-[13px] text-white/75">
              {trip.name}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-2">
            <Flag code={trip.country_code} height={20} />
            <Text numberOfLines={1} className="flex-1 font-geist-semibold text-[28px] leading-[30px] text-white" style={{ letterSpacing: -0.84 }}>
              {heading}
            </Text>
          </View>
          {trip.country && trip.country !== trip.destination ? <Text className="mt-0.5 text-sm text-white/75">{trip.country}</Text> : null}

          <View className="mt-4 flex-row items-center justify-between gap-3 border-t border-white/15 pt-3.5">
            <Text numberOfLines={1} className="flex-1 font-geist-medium text-[13px] text-white">
              {formatRange(trip.start_date, trip.end_date) || 'Dates to be found'}
            </Text>
            <Text className="text-[13px] text-white/75">{plural(bookings, 'booking')}</Text>
          </View>
          <Text numberOfLines={1} className="mt-1.5 text-xs text-white/65">
            {chips.length ? chips.join(' • ') : 'Upload a ticket to get started'}
          </Text>
        </View>
      </DestinationImage>
    </Pressable>
  );
}

export function TripCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-trip bg-surface" aria-hidden>
      <Skeleton className="rounded-none" style={{ aspectRatio: 4 / 5 }} />
    </View>
  );
}
