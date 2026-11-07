import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A soft glow that drifts slowly across the frame (an "aurora" behind the route line). */
function Glow({ id, size, color, from, to, duration, opacity }: { id: string; size: number; color: string; from: [number, number]; to: [number, number]; duration: number; opacity: number }) {
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!still) t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, still, duration]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: from[0] + (to[0] - from[0]) * t.value }, { translateY: from[1] + (to[1] - from[1]) * t.value }, { scale: 0.9 + 0.35 * t.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Shown where the destination photo will appear, while it is being found or is still downloading:
 * drifting colour glows, a dotted travel route that keeps "marching" toward a pulsing pin, a light sweep,
 * and (when we are still searching) a caption. Sits on top of the destination-tinted gradient.
 */
export function ImageLoading({ label }: { label?: string | null }) {
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  const march = useSharedValue(0);
  const pulse = useSharedValue(0);
  const sweep = useSharedValue(-1);

  useEffect(() => {
    if (still) return;
    march.value = withRepeat(withTiming(18, { duration: 1100, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    sweep.value = withRepeat(withTiming(1.2, { duration: 2400, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [march, pulse, sweep, still]);

  const dash = useAnimatedProps(() => ({ strokeDashoffset: -march.value }));
  const ring = useAnimatedProps(() => ({ r: 6 + 20 * pulse.value, opacity: 0.7 * (1 - pulse.value) }));
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * width }] }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Glow id="g1" size={320} color="#FFFFFF" from={[-90, -60]} to={[40, 30]} duration={5200} opacity={0.32} />
      <Glow id="g2" size={280} color="#F5C26B" from={[200, 120]} to={[90, 10]} duration={6400} opacity={0.3} />
      <Glow id="g3" size={240} color="#7DB7FF" from={[20, 220]} to={[170, 150]} duration={7200} opacity={0.26} />

      <Svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%" viewBox="0 0 400 240" preserveAspectRatio="none">
        <AnimatedPath d="M-20 205 C 80 120, 170 190, 255 95 S 370 45, 430 70" fill="none" stroke="white" strokeWidth={2} strokeDasharray="2 9" strokeLinecap="round" opacity={0.85} animatedProps={dash} />
        <AnimatedPath d="M-20 235 C 120 175, 215 225, 300 150 S 400 112, 440 124" fill="none" stroke="white" strokeWidth={1.2} strokeDasharray="2 11" strokeLinecap="round" opacity={0.45} animatedProps={dash} />
        <Circle cx={255} cy={95} r={5.5} fill="white" />
        <AnimatedCircle cx={255} cy={95} fill="none" stroke="white" strokeWidth={1.5} animatedProps={ring} />
      </Svg>

      {!still ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: '60%', left: '-60%' }, sweepStyle]}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.14)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}

      {label ? (
        <View className="absolute inset-x-0 top-[38%] items-center px-6">
          <View className="max-w-full flex-row items-center gap-2 rounded-full bg-black/35 px-4 py-2">
            <Icon as={Camera} size={14} className="text-white" />
            <Text numberOfLines={1} className="shrink font-geist-medium text-[13px] text-white">
              Finding the perfect photo of {label}…
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
