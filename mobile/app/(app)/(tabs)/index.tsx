import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/brand/Logo';
import { DestinationImage } from '@/components/common/DestinationImage';
import { EmptyState } from '@/components/common/EmptyState';
import { pullRefresh } from '@/components/common/PullRefresh';
import { NextTripHero, TripEssentials } from '@/components/dashboard/NextTrip';
import { TrippzyNote } from '@/components/dashboard/TrippzyNote';
import { AboutPlace, PlaceNews, WeatherCard } from '@/components/dashboard/PlacePanels';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useHomeWidgets } from '@/hooks/useHomeWidgets';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import type { WidgetId } from '@/features/home/widgets';
import { usePlaceInfo } from '@/hooks/usePlaceInfo';
import { useDisplayName } from '@/hooks/useProfile';
import { useTrips } from '@/hooks/useTrips';
import { useUI } from '@/hooks/useUI';
import { useShadow } from '@/theme/useShadow';
import type { TripWithStats } from '@/types';
import { formatRange, greeting, relativeDay, todayISO } from '@/utils/date';
import { upcomingTrips } from '@/utils/trips';

export default function Home() {
  const insets = useSafeAreaInsets();
  const name = useDisplayName();
  const { openCreateTrip } = useUI();
  const { data: trips, isLoading, error, refetch, isRefetching } = useTrips();
  useOfflineSync(trips);
  const upcoming = useMemo(() => upcomingTrips(trips ?? []), [trips]);
  const next = upcoming[0];
  const firstName = name.split(' ')[0];

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 56, paddingHorizontal: 16 }} refreshControl={pullRefresh(refetch, isRefetching)}>
      <View className="py-4">
        <Logo />
      </View>

      <View className="pb-7 pt-3">
        <Text className="font-geist-medium text-[15px] text-muted">
          {greeting()}, {firstName}
        </Text>
        <Text className="mt-1 font-geist-semibold text-[34px] leading-[35px]" style={{ letterSpacing: -1.36 }}>
          {next?.destination ? (
            <>
              {next.start_date && next.start_date > todayISO() ? 'Getting ready for ' : 'Enjoy '}
              <Text className="font-serif-italic text-[34px] font-normal" style={{ letterSpacing: -0.7 }}>
                {next.destination}.
              </Text>
            </>
          ) : (
            <>
              Where are you going{' '}
              <Text className="font-serif-italic text-[34px]" style={{ letterSpacing: -0.7 }}>
                next?
              </Text>
            </>
          )}
        </Text>
      </View>

      {error ? (
        <View className="items-center rounded-card border border-line bg-surface p-8">
          <Text className="font-geist-semibold">We couldn’t load your trips.</Text>
          <Text className="mt-1 text-center text-sm text-muted">{error instanceof Error ? error.message : 'Please try again.'}</Text>
          <Button variant="secondary" className="mt-5" onPress={() => void refetch()}>
            Try again
          </Button>
        </View>
      ) : isLoading ? (
        <View className="gap-4">
          <Skeleton className="h-[340px] rounded-hero" />
          <Skeleton className="h-[300px] rounded-card" />
        </View>
      ) : !trips?.length ? (
        <View className="rounded-[32px] border border-line bg-surface">
          <EmptyState
            title="Your next adventure starts here."
            description="Create a trip, then upload your tickets inside it — we’ll read them and organise everything for you."
            action={
              <Button size="lg" icon={Plus} onPress={openCreateTrip}>
                Create your first trip
              </Button>
            }
          />
        </View>
      ) : !next ? (
        <View className="rounded-[32px] border border-line bg-surface">
          <EmptyState
            title="No upcoming trips."
            description="Plan your next journey — your past trips are still in the Trips section."
            action={
              <Button size="lg" icon={Plus} onPress={openCreateTrip}>
                Create a trip
              </Button>
            }
          />
        </View>
      ) : (
        <Dashboard next={next} others={upcoming.slice(1, 4)} />
      )}
    </ScrollView>
  );
}

function Dashboard({ next, others }: { next: TripWithStats; others: TripWithStats[] }) {
  const router = useRouter();
  const soft = useShadow('soft');
  const place = next.destination;
  const { data: info, isLoading } = usePlaceInfo(place);
  const order = useHomeWidgets();

  // Every widget of the Home screen. `null` = nothing to show right now; the order comes from Settings → Home screen.
  const widgets: Record<WidgetId, ReactNode> = {
    hero: <NextTripHero trip={next} />,
    note: <TrippzyNote tripId={next.id} />,
    weather: place ? (
      <WeatherCard place={place} info={info} loading={isLoading} />
    ) : (
      <View className="rounded-card border border-dashed border-line-strong p-6">
        <Text className="text-sm text-muted">Upload a ticket to this trip and we’ll detect the destination — weather and local news will appear here.</Text>
      </View>
    ),
    essentials: <TripEssentials trip={next} />,
    about: place ? <AboutPlace info={info} loading={isLoading} /> : null,
    news: place ? <PlaceNews place={place} info={info} loading={isLoading} /> : null,
    upcoming: others.length ? (
      <View>
        <View className="mb-4 flex-row items-end justify-between gap-4">
          <Text className="font-geist-semibold text-xl tracking-tight">Also coming up</Text>
          <Pressable onPress={() => router.push('/trips')} accessibilityRole="link" className="flex-row items-center">
            <Text className="font-geist-medium text-sm text-muted">All trips</Text>
            <Icon as={ChevronRight} size={16} className="text-muted" />
          </Pressable>
        </View>
        <View className="gap-3">
          {others.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/trip/${t.id}`)} accessibilityRole="button" style={soft} className="flex-row items-center gap-3 rounded-[22px] border border-line bg-surface p-3 active:-translate-y-0.5">
              <DestinationImage src={t.cover_image_url} seed={t.destination ?? t.name} className="rounded-2xl" style={{ width: 64, height: 64 }} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
                  {t.destination ?? t.name}
                </Text>
                <Text numberOfLines={1} className="text-[13px] text-muted">
                  {formatRange(t.start_date, t.end_date) || t.name}
                </Text>
                {t.start_date ? <Text className="text-xs text-faint">{relativeDay(t.start_date)}</Text> : null}
              </View>
              <Icon as={ChevronRight} size={16} className="text-faint" />
            </Pressable>
          ))}
        </View>
      </View>
    ) : (
      <Pressable onPress={() => router.push('/trips')} accessibilityRole="link" style={soft} className="flex-row items-center justify-between rounded-[22px] border border-line bg-surface px-5 py-4">
        <Text className="font-geist-medium text-sm">See all your trips</Text>
        <Icon as={ChevronRight} size={16} className="text-muted" />
      </Pressable>
    ),
  };

  return (
    <View className="gap-6">
      {order.map((id) => {
        const node = widgets[id];
        return node ? <View key={id}>{node}</View> : null;
      })}
    </View>
  );
}
