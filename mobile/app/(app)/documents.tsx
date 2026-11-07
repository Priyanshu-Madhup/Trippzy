import { useRouter } from 'expo-router';
import { ChevronRight, FileText, Image as ImageIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { EmptyState } from '@/components/common/EmptyState';
import { usePullRefresh } from '@/components/common/PullRefresh';
import { FilterTabs } from '@/components/common/SearchFilter';
import { BackHeader } from '@/components/layout/BackHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useDocuments } from '@/hooks/useTickets';
import { formatBytes, plural } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { DocumentRow, DocumentType } from '@/types';
import { formatUploaded } from '@/utils/date';
import { FILTERS, groupByCategory, matchesFilter, TYPE_META, type FilterKey } from '@/utils/ticket';

const typeOf = (d: DocumentRow): DocumentType => (d.document_type as DocumentType | null) ?? 'unknown';

function Row({ d }: { d: DocumentRow }) {
  const router = useRouter();
  const soft = useShadow('soft');
  const isImage = d.mime_type?.startsWith('image/');
  const label = (TYPE_META[typeOf(d)] ?? TYPE_META.unknown).label;
  const open = () => (d.ticket_id ? router.push({ pathname: '/viewer/[ticketId]', params: { ticketId: d.ticket_id } }) : toast('This file is still being added to a ticket.'));
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Open ${d.file_name ?? 'document'}`} style={soft} className="flex-row items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 active:bg-surface-2">
      <View className="size-11 items-center justify-center rounded-xl bg-surface-2">
        <Icon as={isImage ? ImageIcon : FileText} size={20} className="text-ink-2" />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
          {d.file_name ?? 'Document'}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">
          {[formatBytes(d.size), formatUploaded(d.created_at)].join(' · ')}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[12px] text-faint">
          {[d.trip?.name, label].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Icon as={ChevronRight} size={18} className="text-faint" />
    </Pressable>
  );
}

/** Profile → Documents: every file you've uploaded, grouped by what it turned out to be. Tap one to view it. */
export default function Documents() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useDocuments();
  const pull = usePullRefresh(refetch);
  const [filter, setFilter] = useState<FilterKey>('all');

  const docs = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, docs.filter((d) => matchesFilter(typeOf(d), f.key)).length])) as Partial<Record<FilterKey, number>>, [docs]);
  const shown = useMemo(() => docs.filter((d) => matchesFilter(typeOf(d), filter)), [docs, filter]);
  const groups = useMemo(() => groupByCategory(shown, typeOf), [shown]);
  const bytes = docs.reduce((n, d) => n + (d.size || 0), 0);

  return (
    <ScrollView refreshControl={pull} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <BackHeader title="Documents" subtitle={isLoading ? ' ' : `${plural(docs.length, 'file')} · ${formatBytes(bytes)} uploaded`} />
      <View className="px-4">
        <View className="mb-5">
          <FilterTabs label="Filter documents by category" value={filter} onChange={setFilter} options={FILTERS} counts={counts} />
        </View>

        {isLoading ? (
          <View className="gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-2xl" />
            ))}
          </View>
        ) : shown.length === 0 ? (
          <EmptyState title={filter === 'all' ? 'No documents yet' : 'Nothing in this category'} description={filter === 'all' ? 'Files you upload to your trips are kept here.' : 'Try another category.'} />
        ) : (
          groups.map((g, gi) => (
            <Animated.View key={g.key} entering={FadeInDown.delay(Math.min(gi, 5) * 50).duration(260)} className="mb-6">
              {filter === 'all' ? (
                <View className="mb-2 flex-row items-baseline justify-between px-1">
                  <Text className="font-geist-semibold text-[17px]">{g.label}</Text>
                  <Text className="text-[13px] text-muted">{g.items.length}</Text>
                </View>
              ) : null}
              <View className="gap-2.5">
                {g.items.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </View>
            </Animated.View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
