import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Ellipsis } from 'lucide-react-native';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DestinationImage } from '@/components/common/DestinationImage';
import { Flag } from '@/components/common/Flag';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { plural } from '@/lib/utils';
import type { Trip } from '@/types';
import { daysBetween, formatRange, relativeDay, todayISO } from '@/utils/date';
import { coverPending } from '@/utils/trips';

/** Trippy's trip hero: full-bleed photo, glass back/menu buttons, big uppercase destination. */
export function TripHero({ trip, bookings, onMenu }: { trip: Trip; bookings: number; onMenu: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const days = daysBetween(trip.start_date, trip.end_date);
  const upcoming = !!trip.start_date && trip.start_date > todayISO();
  const heading = trip.destination ?? trip.name;
  const h = Math.max(340, Math.min(height * 0.62, 440)) + insets.top;

  return (
    <DestinationImage src={trip.cover_image_url} seed={trip.destination ?? trip.name} priority pending={coverPending(trip)} pendingLabel={trip.destination} className="rounded-b-hero-lg" style={{ height: h }}>
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']} locations={[0, 0.45, 1]} style={{ position: 'absolute', inset: 0 }} />

      <View className="absolute inset-x-0 top-0 flex-row items-center justify-between p-4" style={{ paddingTop: insets.top + 12 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back" className="size-10 items-center justify-center rounded-full bg-white/20 active:bg-white/30">
          <Icon as={ArrowLeft} size={18} className="text-white" />
        </Pressable>
        <Pressable onPress={onMenu} accessibilityRole="button" accessibilityLabel="Trip actions" className="size-10 items-center justify-center rounded-full bg-white/20 active:bg-white/30">
          <Icon as={Ellipsis} size={18} className="text-white" />
        </Pressable>
      </View>

      <View className="absolute inset-x-0 bottom-0 p-6">
        <View className="flex-row items-center gap-2">
          <Flag code={trip.country_code} height={14} />
          <Text numberOfLines={1} className="flex-1 font-geist-medium text-sm text-white/80">
            {trip.destination ? trip.name : 'Trip'}
            {trip.country && trip.country !== trip.destination ? <Text className="text-white/60"> · {trip.country}</Text> : null}
          </Text>
        </View>
        <Text className="mt-1 font-geist-semibold text-[44px] uppercase leading-[40px] text-white" style={{ letterSpacing: -1.98 }} numberOfLines={3}>
          {heading}
        </Text>
        <View className="mt-4 flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
          <Text className="font-geist-medium text-[15px] text-white">{formatRange(trip.start_date, trip.end_date).toUpperCase() || 'Dates will appear as you add bookings'}</Text>
          <Text className="text-[15px] text-white/60">{plural(bookings, 'booking')}</Text>
          {days !== null && days > 0 ? <Text className="text-[15px] text-white/60">{plural(days + 1, 'day')}</Text> : null}
          {upcoming ? (
            <View className="rounded-full bg-white/20 px-2.5 py-0.5">
              <Text className="text-[13px] text-white">{relativeDay(trip.start_date)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {trip.cover_image_attribution ? <Text className="absolute bottom-2 right-4 text-[10px] text-white/50">{trip.cover_image_attribution}</Text> : null}
    </DestinationImage>
  );
}

export function TripHeroSkeleton() {
  return <Skeleton className="h-[400px] rounded-none rounded-b-hero-lg" />;
}
