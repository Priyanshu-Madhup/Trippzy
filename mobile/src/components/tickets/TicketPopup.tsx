import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { BackHandler, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { hashHue } from '@/lib/utils';
import { useTheme } from '@/theme/ThemeProvider';
import type { Ticket } from '@/types';
import { TicketCard } from './TicketCard';
import type { TicketHandlers } from './types';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const RADIUS = 26;
const BAR = 170; // length of the travelling light, in px
const LOOP_MS = 5200;
const SLOW = 1; // relative speed along the top and bottom edges
const FAST = 2.6; // along the sides and corners

/** Same hue family as the card's accent bar, so the light matches the ticket. */
function accentOf(t: Ticket): string {
  const hue = hashHue(t.airline_name ?? t.provider_name ?? t.document_type ?? 'ticket');
  return `hsl(${(hue + 40) % 360}, 80%, 66%)`;
}

/** A small bright bar that circles the card's edge, forever, with a soft glow behind it. */
function PerimeterLight({ width, height, color, progress }: { width: number; height: number; color: string; progress: ReturnType<typeof useSharedValue<number>> }) {
  const inset = 1.5;
  const w = Math.max(0, width - inset * 2);
  const h = Math.max(0, height - inset * 2);
  const r = Math.min(RADIUS - inset, w / 2, h / 2);
  const perimeter = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
  const clock = useSharedValue(0);

  // Path order (clockwise from the top-left): top, corner, right side, corner, bottom, corner, left side, corner.
  // Time is spent in proportion to length / speed, so the light dawdles along the top and bottom and sweeps the sides.
  const { cumT, cumD } = useMemo(() => {
    const straight = Math.max(0, w - 2 * r);
    const side = Math.max(0, h - 2 * r);
    const arc = (Math.PI * r) / 2;
    const lens = [straight, arc, side, arc, straight, arc, side, arc];
    const speeds = [SLOW, FAST, FAST, FAST, SLOW, FAST, FAST, FAST];
    const times = lens.map((l, i) => l / speeds[i]);
    const total = times.reduce((a, b) => a + b, 0) || 1;
    const t = [0];
    const d = [0];
    lens.forEach((l, i) => {
      t.push(t[i] + times[i] / total);
      d.push(d[i] + l);
    });
    return { cumT: t, cumD: d };
  }, [w, h, r]);

  useEffect(() => {
    if (!perimeter) return;
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
  }, [perimeter, clock]);

  const props = useAnimatedProps(() => {
    const t = clock.value;
    let i = 0;
    while (i < cumT.length - 2 && t >= cumT[i + 1]) i++;
    const span = cumT[i + 1] - cumT[i];
    const f = span > 0 ? (t - cumT[i]) / span : 0;
    return { strokeDashoffset: -(cumD[i] + f * (cumD[i + 1] - cumD[i])) };
  });
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp') }));
  if (!perimeter) return null;
  const dash = `${BAR} ${Math.max(1, perimeter - BAR)}`;

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, width, height }, fade]}>
      <Svg width={width} height={height}>
        <AnimatedRect x={inset} y={inset} width={w} height={h} rx={r} ry={r} fill="none" stroke={color} strokeOpacity={0.28} strokeWidth={7} strokeLinecap="round" strokeDasharray={dash} animatedProps={props} />
        <AnimatedRect x={inset} y={inset} width={w} height={h} rx={r} ry={r} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={dash} animatedProps={props} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Opens a ticket as a larger card floating over the trip, with the page behind it blurred.
 * It springs in, and a small light runs around the card's edge while it is open.
 * `blurTarget` is the view to blur on Android (iOS blurs whatever is behind).
 */
export function TicketPopup({
  ticket,
  handlers,
  onClose,
  blurTarget,
}: {
  ticket: Ticket | null;
  handlers: TicketHandlers;
  onClose: () => void;
  blurTarget: RefObject<ComponentRef<typeof View> | null>;
}) {
  const { resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const progress = useSharedValue(0);
  // Keep rendering the last ticket while the close animation plays.
  const [shown, setShown] = useState<Ticket | null>(ticket);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (closing.current) clearTimeout(closing.current);
    if (ticket) {
      setShown(ticket);
      progress.value = withSpring(1, { damping: 17, stiffness: 210, mass: 0.85 });
    } else {
      progress.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      closing.current = setTimeout(() => setShown(null), 230);
    }
    return () => {
      if (closing.current) clearTimeout(closing.current);
    };
  }, [ticket, progress]);

  useEffect(() => {
    if (!ticket) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [ticket, onClose]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 1, 1], 'clamp'),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [36, 0]) }, { scale: interpolate(progress.value, [0, 1], [0.88, 1]) }],
  }));

  const t = ticket ?? shown;
  if (!t) return null;
  // The popup never scrolls: if a tall ticket doesn't fit the screen, the whole card scales down to fit.
  const avail = screenH - insets.top - insets.bottom - 24;
  const scale = box.h > avail ? Math.max(0.6, avail / box.h) : 1;

  return (
    <View pointerEvents={ticket ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, backdrop]}>
        <BlurView
          blurTarget={blurTarget}
          blurMethod="dimezisBlurView"
          intensity={55}
          tint={resolved === 'dark' ? 'dark' : 'light'}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: resolved === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(20,16,8,0.25)' }} />
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close ticket" />
      </Animated.View>

      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 10, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}>
        <Animated.View style={card}>
          <View style={{ height: box.h ? box.h * scale : undefined }}>
            <View
              onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
              style={[{ position: 'absolute', top: 0, left: 0, right: 0, opacity: box.h ? 1 : 0, transformOrigin: 'top center' }, { transform: [{ scale }] }]}
            >
              <TicketCard ticket={t} handlers={{ ...handlers, onCollapse: () => onClose() }} />
              <PerimeterLight width={box.w} height={box.h} color={accentOf(t)} progress={progress} />
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
