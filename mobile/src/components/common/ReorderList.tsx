import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

export interface ReorderItem {
  id: string;
  /** Pinned in place: can't be dragged, and nothing can be dropped above it. Locked items must come first. */
  locked?: boolean;
}

const SPRING = { damping: 22, stiffness: 240, mass: 0.7 };

function Row({
  item,
  positions,
  step,
  height,
  count,
  lockedCount,
  onDragChange,
  onDrop,
  children,
}: {
  item: ReorderItem;
  positions: SharedValue<Record<string, number>>;
  step: number;
  height: number;
  count: number;
  lockedCount: number;
  onDragChange: (dragging: boolean) => void;
  onDrop: (ids: string[]) => void;
  children: ReactNode;
}) {
  const id = item.id;
  const top = useSharedValue((positions.value[id] ?? 0) * step);
  const start = useSharedValue(0);
  const active = useSharedValue(false);

  // When another row is dragged past this one, slide to the new slot.
  useAnimatedReaction(
    () => positions.value[id],
    (slot, prev) => {
      if (slot !== prev && slot !== undefined && !active.value) top.value = withSpring(slot * step, SPRING);
    },
  );

  const pan = Gesture.Pan()
    .enabled(!item.locked)
    .activateAfterLongPress(220) // press and hold the bar first, then drag
    .onStart(() => {
      active.value = true;
      start.value = top.value;
      runOnJS(onDragChange)(true);
    })
    .onUpdate((e) => {
      top.value = Math.min((count - 1) * step, Math.max(lockedCount * step, start.value + e.translationY));
      const to = Math.min(count - 1, Math.max(lockedCount, Math.round(top.value / step)));
      const from = positions.value[id];
      if (to === from) return;
      const next = { ...positions.value };
      for (const key in next) {
        if (key === id) continue;
        if (from < to && next[key] > from && next[key] <= to) next[key] -= 1; // dragging down: rows in between move up
        else if (from > to && next[key] >= to && next[key] < from) next[key] += 1; // dragging up: they move down
      }
      next[id] = to;
      positions.value = next;
    })
    .onFinalize(() => {
      if (!active.value) return; // a plain tap or scroll never became a drag
      active.value = false;
      top.value = withSpring(positions.value[id] * step, SPRING);
      const p = positions.value;
      runOnJS(onDrop)(Object.keys(p).sort((a, b) => p[a] - p[b]));
      runOnJS(onDragChange)(false);
    });

  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: active.value ? 50 : 0,
    transform: [{ scale: withSpring(active.value ? 1.025 : 1, SPRING) }],
    shadowOpacity: withSpring(active.value ? 0.22 : 0),
    elevation: active.value ? 8 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, height, shadowColor: '#000', shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/**
 * A vertical list of fixed-height strips that can be reordered: press and hold a strip, then drag it to a new
 * position. Locked strips (always first) stay put. Calls `onReorder` with the new id order when you let go.
 */
export function ReorderList<T extends ReorderItem>({
  items,
  itemHeight = 68,
  gap = 10,
  renderItem,
  onReorder,
  onDragChange,
}: {
  items: T[];
  itemHeight?: number;
  gap?: number;
  renderItem: (item: T) => ReactNode;
  onReorder: (ids: string[]) => void;
  onDragChange?: (dragging: boolean) => void;
}) {
  const step = itemHeight + gap;
  const positions = useSharedValue<Record<string, number>>(Object.fromEntries(items.map((it, i) => [it.id, i])));
  const lockedCount = items.filter((i) => i.locked).length;
  const key = items.map((i) => i.id).join('|');

  // Re-sync when the list is changed from outside (e.g. "Reset to default").
  useEffect(() => {
    positions.value = Object.fromEntries(key.split('|').map((id, i) => [id, i]));
  }, [key, positions]);

  return (
    <View style={{ height: items.length * step - gap }}>
      {items.map((item) => (
        <Row key={item.id} item={item} positions={positions} step={step} height={itemHeight} count={items.length} lockedCount={lockedCount} onDragChange={onDragChange ?? (() => undefined)} onDrop={onReorder}>
          {renderItem(item)}
        </Row>
      ))}
    </View>
  );
}
