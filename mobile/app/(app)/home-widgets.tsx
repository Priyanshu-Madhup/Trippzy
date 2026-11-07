import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Lock, Menu, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { ReorderList } from '@/components/common/ReorderList';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { DEFAULT_ORDER, WIDGET_BY_ID, normalizeOrder, type WidgetId } from '@/features/home/widgets';
import { useHomeWidgets } from '@/hooks/useHomeWidgets';
import { qk } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { updateProfile } from '@/services/account';
import { useShadow } from '@/theme/useShadow';

/** Reorder the widgets on the Home screen: press and hold a bar, drag it, then Save. The first one is pinned. */
export default function HomeWidgets() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const soft = useShadow('soft');
  const saved = useHomeWidgets();
  const [order, setOrder] = useState<WidgetId[]>(saved);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);

  // The profile may finish loading after this screen opens; adopt it unless the user already moved something.
  useEffect(() => {
    if (!touched.current) setOrder(saved);
  }, [saved]);

  const changed = order.join() !== saved.join();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function save() {
    setSaving(true);
    try {
      const profile = await updateProfile({ preferences: { home_widgets: order } });
      qc.setQueryData(qk.profile, profile);
      toast.success('Home screen updated');
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your Home screen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <GestureHandlerRootView className="flex-1 bg-surface">
      <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }}>
        <View className="flex-row items-start justify-between gap-4 px-6">
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" className="font-geist-semibold text-[26px] tracking-tight">
              Home screen
            </Text>
            <Text className="mt-1 text-sm text-muted">Press and hold a bar, then drag it to a new spot. The first widget stays pinned.</Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="-mr-2 size-10 items-center justify-center rounded-full active:bg-surface-2">
            <Icon as={X} size={20} className="text-muted" />
          </Pressable>
        </View>

        <View className="px-6 pt-6">
          <ReorderList
            items={order.map((id) => ({ id, locked: !!WIDGET_BY_ID[id].locked }))}
            onDragChange={setDragging}
            onReorder={(ids) => {
              touched.current = true;
              setOrder(normalizeOrder(ids));
            }}
            renderItem={({ id, locked }) => {
              const w = WIDGET_BY_ID[id as WidgetId];
              return (
                <View style={soft} className={cn('h-full flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-3.5', locked && 'bg-surface-2/60')}>
                  <View className="size-10 items-center justify-center rounded-xl bg-surface-2">
                    <Icon as={w.icon} size={18} className="text-ink" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
                      {w.title}
                    </Text>
                    <Text numberOfLines={1} className="text-[12px] text-muted">
                      {locked ? 'Always first' : w.hint}
                    </Text>
                  </View>
                  <View accessibilityLabel={locked ? 'Locked in first place' : 'Hold and drag to reorder'} className="size-9 items-center justify-center">
                    <Icon as={locked ? Lock : Menu} size={locked ? 17 : 20} className={locked ? 'text-faint' : 'text-muted'} />
                  </View>
                </View>
              );
            }}
          />
        </View>

        <View className="mt-8 flex-row items-center justify-between gap-2 px-6">
          <Button variant="ghost" disabled={order.join() === DEFAULT_ORDER.join()} onPress={() => { touched.current = true; setOrder(DEFAULT_ORDER); }}>
            Reset to default
          </Button>
          <Button loading={saving} disabled={!changed} onPress={save} className="min-w-28">
            Save
          </Button>
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
