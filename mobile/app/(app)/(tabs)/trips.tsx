import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/common/EmptyState';
import { pullRefresh } from '@/components/common/PullRefresh';
import { SearchBar } from '@/components/common/SearchFilter';
import { TripCard, TripCardSkeleton } from '@/components/trips/TripCard';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Controls';
import { Text } from '@/components/ui/Text';
import { useTrips } from '@/hooks/useTrips';
import { useUI } from '@/hooks/useUI';
import { todayISO } from '@/utils/date';

type Scope = 'all' | 'upcoming' | 'past';

export default function Trips() {
  const insets = useSafeAreaInsets();
  const { data: trips, isLoading, error, refetch, isRefetching } = useTrips();
  const { openCreateTrip } = useUI();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');

  const list = useMemo(() => {
    const today = todayISO();
    const q = query.trim().toLowerCase();
    return (trips ?? [])
      .filter((t) => {
        const end = t.end_date ?? t.start_date;
        if (scope === 'upcoming' && end && end < today) return false;
        if (scope === 'past' && (!end || end >= today)) return false;
        return !q || [t.name, t.destination, t.country].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => (b.start_date ?? '9999').localeCompare(a.start_date ?? '9999'));
  }, [trips, query, scope]);

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: 56, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={pullRefresh(refetch, isRefetching)}
    >
      <View className="flex-row items-end justify-between gap-4 pb-6">
        <View className="flex-1">
          <Text className="font-geist-semibold text-[34px] leading-[34px]" style={{ letterSpacing: -1.36 }}>
            Your journeys
          </Text>
          <Text className="mt-2 text-[15px] text-muted">Everything you need, in one place.</Text>
        </View>
        <Button icon={Plus} onPress={openCreateTrip}>
          New
        </Button>
      </View>

      <View className="mb-8 gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search trips or places" />
        <Segmented
          label="Show"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ]}
        />
      </View>

      {error ? (
        <View className="items-center rounded-[26px] border border-line bg-surface p-8">
          <Text className="font-geist-semibold">We couldn’t load your trips.</Text>
          <Text className="mt-1 text-center text-sm text-muted">{error instanceof Error ? error.message : 'Please try again.'}</Text>
          <Button variant="secondary" className="mt-5" onPress={() => void refetch()}>
            Try again
          </Button>
        </View>
      ) : isLoading ? (
        <View className="gap-4">
          {[0, 1].map((i) => (
            <TripCardSkeleton key={i} />
          ))}
        </View>
      ) : list.length ? (
        <View className="gap-4">
          {list.map((trip, i) => (
            <TripCard key={trip.id} trip={trip} priority={i < 2} />
          ))}
        </View>
      ) : (trips?.length ?? 0) === 0 ? (
        <EmptyState
          title="Your next adventure starts here."
          description="Create a trip and keep every booking, ticket and reservation together."
          action={
            <Button size="lg" icon={Plus} onPress={openCreateTrip}>
              Create your first trip
            </Button>
          }
        />
      ) : (
        <Text className="py-16 text-center text-muted">No trips match your search.</Text>
      )}
    </ScrollView>
  );
}
