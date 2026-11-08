import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/common/EmptyState';
import { usePullRefresh } from '@/components/common/PullRefresh';
import { FilterTabs } from '@/components/common/SearchFilter';
import { BackHeader } from '@/components/layout/BackHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useAllTickets } from '@/hooks/useTickets';
import { plural } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { TicketWithTrip } from '@/types';
import { formatShort } from '@/utils/date';
import { FILTERS, groupByCategory, matchesFilter, ticketView, type FilterKey } from '@/utils/ticket';

function Row({ t }: { t: TicketWithTrip }) {
  const router = useRouter();
  const soft = useShadow('soft');
  const v = ticketView(t);
  const when = [t.travel_date ? formatShort(t.travel_date) : null, v.time].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trip/[tripId]', params: { tripId: t.trip_id } })}
      accessibilityRole="button"
      accessibilityLabel={`${v.title}. Open trip`}
      style={soft}
      className="flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 active:bg-surface-2"
    >
      <View className={`size-11 items-center justify-center rounded-xl ${v.meta.tile}`}>
        <Icon as={v.meta.icon} size={20} className={v.meta.text} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
          {v.title}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">
          {[v.provider && v.provider !== v.title ? v.provider : null, when].filter(Boolean).join(' · ') || v.meta.label}
        </Text>
        {t.trip ? (
          <Text numberOfLines={1} className="mt-0.5 text-[12px] text-faint">
            {t.trip.name}
          </Text>
        ) : null}
      </View>
      <Icon as={ChevronRight} size={18} className="text-faint" />
    </Pressable>
  );
}

/** Profile → Tickets: every ticket from every trip, grouped by category. Tap one to open its trip. */
export default function AllTickets() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useAllTickets();
  const pull = usePullRefresh(refetch);
  const [filter, setFilter] = useState<FilterKey>('all');

  const ready = useMemo(() => (data ?? []).filter((t) => t.processing_status === 'completed'), [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, ready.filter((t) => matchesFilter(t.document_type, f.key)).length])) as Partial<Record<FilterKey, number>>, [ready]);
  const shown = useMemo(() => ready.filter((t) => matchesFilter(t.document_type, filter)), [ready, filter]);
  const groups = useMemo(() => groupByCategory(shown, (t) => t.document_type), [shown]);

  return (
    <ScrollView refreshControl={pull} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <BackHeader title="Tickets" subtitle={isLoading ? ' ' : `${plural(ready.length, 'ticket')} across all your trips`} />
      <View className="px-4">
        <View className="mb-5">
          <FilterTabs label="Filter tickets by category" value={filter} onChange={setFilter} options={FILTERS} counts={counts} />
        </View>

        {isLoading ? (
          <View className="gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-2xl" />
            ))}
          </View>
        ) : shown.length === 0 ? (
          <EmptyState title={filter === 'all' ? 'No tickets yet' : 'Nothing in this category'} description={filter === 'all' ? 'Upload a ticket to a trip and it will show up here.' : 'Try another category.'} />
        ) : (
          groups.map((g, gi) => (
            <Animated.View key={g.key} entering={FadeIn.duration(220)} className="mb-6">
              {filter === 'all' ? (
                <View className="mb-2 flex-row items-baseline justify-between px-1">
                  <Text className="font-geist-semibold text-[17px]">{g.label}</Text>
                  <Text className="text-[13px] text-muted">{g.items.length}</Text>
                </View>
              ) : null}
              <View className="gap-2.5">
                {g.items.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </View>
            </Animated.View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
