import { LogOut as CheckoutIcon } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';
import { formatShort, formatWeekday } from '@/utils/date';
import { TYPE_META } from '@/utils/ticket';
import { buildEvents, groupByDay } from '@/utils/timeline';

/** Vertical itinerary grouped by day. Tapping an event jumps to its ticket card. */
export function TripTimeline({ tickets, onSelect }: { tickets: Ticket[]; onSelect: (ticketId: string) => void }) {
  const groups = useMemo(() => groupByDay(buildEvents(tickets)), [tickets]);
  if (groups.length === 0) return null;

  return (
    <View accessibilityLabel="Itinerary">
      {groups.map(([date, events], gi) => (
        <View key={date} className="pb-2">
          <View className="flex-row items-baseline gap-2 py-2">
            <Text className="font-geist-semibold text-[13px] uppercase tracking-[1px]">{date === 'undated' ? 'Anytime' : formatShort(date)}</Text>
            {date !== 'undated' ? <Text className="text-xs text-muted">{formatWeekday(date)}</Text> : null}
          </View>
          <View className="ml-[19px] border-l border-line-strong pb-3 pl-7">
            {events.map((e, i) => {
              const meta = TYPE_META[e.type];
              return (
                <Animated.View key={e.key} entering={FadeIn.delay(Math.min(i, 3) * 30).duration(220)} className="relative py-2">
                  <View className="absolute -left-[48px] top-2.5 size-10 rounded-full border-4 border-bg bg-surface">
                    <View className={cn('flex-1 items-center justify-center rounded-full', e.checkout ? 'bg-surface-2' : meta.tile)}>
                      <Icon as={e.checkout ? CheckoutIcon : meta.icon} size={17} className={e.checkout ? 'text-muted' : meta.text} />
                    </View>
                  </View>
                  <Pressable onPress={() => onSelect(e.ticketId)} accessibilityRole="button" accessibilityLabel={`${e.label}: ${e.title}`} className="rounded-2xl px-3 py-2 active:bg-surface">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="font-geist-medium text-xs text-muted">{e.label}</Text>
                      {e.time && !e.checkout ? <Text className="font-geist-mono text-xs text-muted">{e.time}</Text> : null}
                    </View>
                    <Text numberOfLines={1} className="mt-0.5 font-geist-semibold text-[15px]">
                      {e.title}
                    </Text>
                    {e.detail ? (
                      <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">
                        {e.detail}
                      </Text>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
