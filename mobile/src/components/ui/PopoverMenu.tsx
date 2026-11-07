import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import { Icon } from './Icon';
import { Text } from './Text';
import type { Action } from './ActionSheet';

/** Where the menu was opened from, in window coordinates. A long-press passes a zero-size point. */
export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WIDTH = 224;
const ROW = 46;
const GAP = 6;
const MARGIN = 12;

const enter = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.82 }, { translateY: -6 }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }], easing: Easing.out(Easing.back(1.4)) },
}).duration(200);
const exit = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.9 }], easing: Easing.in(Easing.quad) },
}).duration(120);

/** A small floating menu that pops out right under the button that opened it (flips above near the screen's bottom). */
export function PopoverMenu({ open, anchor, onClose, actions }: { open: boolean; anchor: Anchor | null; onClose: () => void; actions: Action[] }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const lift = useShadow('lift');
  if (!open || !anchor) return null;

  const height = actions.length * ROW + 12;
  const right = Math.max(MARGIN, Math.min(screenW - (anchor.x + anchor.width), screenW - WIDTH - MARGIN));
  const below = anchor.y + anchor.height + GAP;
  const flip = below + height > screenH - insets.bottom - MARGIN;
  const top = flip ? Math.max(insets.top + MARGIN, anchor.y - GAP - height) : below;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1 }}>
        <Animated.View
          entering={enter}
          exiting={exit}
          style={[lift, { position: 'absolute', top, right, width: WIDTH, transformOrigin: flip ? 'bottom right' : 'top right' }]}
          className="rounded-2xl border border-line-strong bg-surface p-1.5"
        >
          {actions.map((a, i) => (
            <View key={a.label}>
              {a.destructive && i > 0 ? <View className="mx-2.5 my-0.5 h-px bg-line" /> : null}
              <Pressable
                accessibilityRole="menuitem"
                onPress={() => {
                  onClose();
                  setTimeout(a.onPress, 120);
                }}
                style={{ height: ROW - 4 }}
                className={cn('flex-row items-center gap-3 rounded-xl px-3 active:bg-surface-2', a.destructive && 'active:bg-danger-bg')}
              >
                {a.icon ? <Icon as={a.icon} size={17} className={a.destructive ? 'text-danger' : 'text-muted'} /> : null}
                <Text className={cn('font-geist-medium text-[15px]', a.destructive && 'text-danger')}>{a.label}</Text>
              </Pressable>
            </View>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
