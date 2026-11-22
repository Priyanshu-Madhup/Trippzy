import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowRight, BedDouble, Luggage, Plane } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View, type PressableProps } from 'react-native';
import Animated, { Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkyBackdrop } from '@/components/auth/SkyBackdrop';
import { Logo } from '@/components/brand/Logo';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { BRAND } from '@/lib/brand';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View className="flex-1" style={{ backgroundColor: '#0d1226' }}>
      <SkyBackdrop />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <View className="px-5">
          <Logo inverted />

          <Animated.View entering={FadeInDown.duration(600)} className="mt-12">
            <View className="flex-row items-center gap-2 self-start rounded-full bg-white/10 px-3 py-1.5">
              <Icon as={Luggage} size={14} className="text-[#F3C88F]" />
              <Text className="font-geist-medium text-[13px] text-white">AI-organised travel documents</Text>
            </View>
            <Text className="mt-6 font-geist-semibold text-[44px] leading-[43px] text-white" style={{ letterSpacing: -1.98 }}>
              Throw in your tickets.
            </Text>
            <Text className="mt-1 font-serif-italic text-[44px] leading-[46px] text-[#F6D7AE]" style={{ letterSpacing: -0.9 }}>
              We’ll plan the rest.
            </Text>
            <Text className="mt-6 text-lg leading-[27px] text-white/75">{BRAND.description}</Text>

            <View className="mt-9 gap-3">
              <WelcomeButton primary label="Start your first trip" onPress={() => router.push('/signup')} />
              <WelcomeButton label="I have an account" onPress={() => router.push('/login')} />
            </View>
          </Animated.View>

          <HeroCards />
        </View>
      </ScrollView>
    </View>
  );
}

function WelcomeButton({ label, primary, ...props }: PressableProps & { label: string; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`h-[52px] flex-row items-center justify-center gap-2 rounded-full active:scale-[0.98] ${primary ? 'bg-white' : 'border border-white/20 bg-white/15'}`}
      {...props}
    >
      <Text className={`font-geist-medium text-[15px] ${primary ? 'text-[#111]' : 'text-white'}`}>{label}</Text>
      {primary ? <Icon as={ArrowRight} size={20} className="text-[#111]" /> : null}
    </Pressable>
  );
}

const LOOP_MS = 4800;
const FLIGHT = 0.6; // share of each loop spent in the air; the rest is the "landed" pause
const CIRCLE = 32;
const easeInOut = (t: number) => {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/**
 * A little jet that flies along the dotted line: it eases out of Bengaluru, lifts and grows a touch at mid-flight,
 * leaves a solid trail behind it, lands in Dubai with a ripple, rests, and goes again. Tap it to fly it again now.
 */
function FlightRoute() {
  const [width, setWidth] = useState(0);
  const clock = useSharedValue(0);
  const bump = useSharedValue(1);

  const start = useCallback(() => {
    cancelAnimation(clock);
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
  }, [clock]);

  useEffect(() => {
    start();
    return () => cancelAnimation(clock);
  }, [start, clock]);

  const travel = Math.max(0, width - CIRCLE);

  const circle = useAnimatedStyle(() => {
    const f = easeInOut(Math.min(1, clock.value / FLIGHT));
    const arc = Math.sin(Math.PI * f);
    return { transform: [{ translateX: f * travel }, { translateY: -arc * 7 }, { scale: (1 + arc * 0.14) * bump.value }] };
  });
  const trail = useAnimatedStyle(() => {
    const f = easeInOut(Math.min(1, clock.value / FLIGHT));
    // The trail fades out during the landed pause, ready for the next flight.
    const fade = clock.value < FLIGHT ? 1 : Math.max(0, 1 - (clock.value - FLIGHT) / (1 - FLIGHT) / 0.8);
    return { width: f * travel + CIRCLE / 2, opacity: fade };
  });
  const ripple = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (clock.value - FLIGHT) / 0.3));
    return { opacity: t > 0 && t < 1 ? 0.55 * (1 - t) : 0, transform: [{ scale: 1 + t * 2.6 }] };
  });
  const arrived = useAnimatedStyle(() => ({ backgroundColor: clock.value >= FLIGHT - 0.01 && clock.value < 0.97 ? '#111' : '#a7a49b' }));

  return (
    <Pressable
      onPress={() => {
        bump.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 260 }));
        start();
      }}
      accessibilityRole="button"
      accessibilityLabel="Replay the flight"
      className="mb-8 h-10 flex-1 justify-center px-3"
    >
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} className="h-8 justify-center">
        {/* the dotted route, a solid trail that grows behind the jet, and the two end dots */}
        <View className="absolute inset-x-0 border-t border-dashed border-[#a7a49b]" style={{ top: 15 }} />
        <Animated.View className="absolute left-0 h-[2px] rounded-full bg-[#111]" style={[{ top: 15 }, trail]} />
        <View className="absolute left-0 size-1.5 rounded-full bg-[#111]" style={{ top: 13 }} />
        <View className="absolute right-0" style={{ top: 13, width: 6, height: 6 }}>
          <Animated.View className="absolute inset-0 rounded-full bg-[#111]" style={ripple} />
          <Animated.View className="absolute inset-0 rounded-full" style={arrived} />
        </View>
        <Animated.View style={[{ width: CIRCLE, height: CIRCLE, boxShadow: '0 4px 10px -2px rgba(0,0,0,0.3)' }, circle]} className="items-center justify-center rounded-full border border-black/5 bg-white">
          <View style={{ transform: [{ rotate: '45deg' }] }}>
            <Icon as={Plane} size={16} className="text-[#111]" />
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

function HeroCards() {
  return (
    <View className="mt-14 h-[380px] w-full max-w-[420px] self-center" accessibilityElementsHidden>
      <Animated.View
        entering={FadeInDown.delay(150).duration(700)}
        style={{ transform: [{ rotate: '-5deg' }], boxShadow: '0 20px 40px -12px rgba(0,0,0,0.45)' }}
        className="absolute left-0 top-6 w-[86%] rounded-3xl bg-white p-5"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <Image source={require('../../assets/emirates-logo.png')} contentFit="cover" accessibilityLabel="Emirates logo" style={{ width: 36, height: 36, borderRadius: 12 }} />
            <View>
              <Text className="font-geist-semibold text-sm text-[#111]">Emirates</Text>
              <Text className="text-xs text-[#77746c]">EK569 · Economy</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1.5 rounded-full bg-[#f1f0ec] py-1 pl-1 pr-2.5">
            <Image source={require('../../assets/makemytrip-logo.png')} contentFit="cover" accessibilityLabel="MakeMyTrip logo" style={{ width: 20, height: 20, borderRadius: 6 }} />
            <Text className="font-geist-medium text-[11px] text-[#111]">MakeMyTrip</Text>
          </View>
        </View>
        <View className="mt-6 flex-row items-end justify-between">
          <View>
            <Text className="font-geist-semibold text-[32px] leading-[32px] text-[#111]">BLR</Text>
            <Text className="mt-1 text-xs text-[#77746c]">Bengaluru</Text>
            <Text className="mt-1.5 font-geist-mono-semibold text-sm text-[#111]">04:15</Text>
          </View>
          <FlightRoute />
          <View className="items-end">
            <Text className="font-geist-semibold text-[32px] leading-[32px] text-[#111]">DXB</Text>
            <Text className="mt-1 text-xs text-[#77746c]">Dubai</Text>
            <Text className="mt-1.5 font-geist-mono-semibold text-sm text-[#111]">06:30</Text>
          </View>
        </View>
        <View className="mt-5 flex-row border-t border-dashed border-black/15 pt-4">
          {[
            ['PNR', 'QX7K2M', true],
            ['Seat', '24A', true],
            ['Date', '12 OCT', false],
          ].map(([k, v, mono]) => (
            <View key={String(k)} className="flex-1">
              <Text className="text-[10px] uppercase tracking-[1.5px] text-[#a7a49b]">{String(k)}</Text>
              <Text className={`${mono ? 'font-geist-mono-semibold' : 'font-geist-semibold'} text-xs text-[#111]`}>{String(v)}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(300).duration(700)}
        style={{ transform: [{ rotate: '4deg' }], boxShadow: '0 20px 40px -12px rgba(0,0,0,0.45)' }}
        className="absolute bottom-0 right-0 w-[70%] overflow-hidden rounded-3xl bg-white"
      >
        <Image source={require('../../assets/marriott-hotel.png')} contentFit="cover" accessibilityLabel="Hotel exterior at dusk" style={{ height: 112, width: '100%' }} />
        <View className="p-4">
          <View className="flex-row items-center gap-1.5">
            <Icon as={BedDouble} size={14} className="text-[#77746c]" />
            <Text className="font-geist-semibold text-[11px] text-[#77746c]">HOTEL · 4 NIGHTS</Text>
          </View>
          <Text className="mt-1 font-geist-semibold text-[15px] text-[#111]">Marriott County Hall</Text>
          <Text className="text-xs text-[#77746c]">London, United Kingdom</Text>
        </View>
      </Animated.View>
    </View>
  );
}
