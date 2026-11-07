import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowRight, BedDouble, Luggage, Plane } from 'lucide-react-native';
import { Pressable, ScrollView, View, type PressableProps } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
            <View className="size-9 items-center justify-center rounded-xl bg-[#c8102e]">
              <Text className="font-geist-bold text-xs text-white">EK</Text>
            </View>
            <View>
              <Text className="font-geist-semibold text-sm text-[#111]">Emirates</Text>
              <Text className="text-xs text-[#77746c]">EK569 · Economy</Text>
            </View>
          </View>
          <View className="rounded-full bg-[#f1f0ec] px-2.5 py-1">
            <Text className="font-geist-medium text-[11px] text-[#111]">MakeMyTrip</Text>
          </View>
        </View>
        <View className="mt-6 flex-row items-end justify-between">
          <View>
            <Text className="font-geist-semibold text-[32px] leading-[32px] text-[#111]">BLR</Text>
            <Text className="mt-1 text-xs text-[#77746c]">Bengaluru</Text>
            <Text className="mt-1.5 font-geist-mono-semibold text-sm text-[#111]">04:15</Text>
          </View>
          <View className="mb-8 flex-1 flex-row items-center gap-1 px-3">
            <View className="h-px flex-1 border-t border-dashed border-[#a7a49b]" />
            <View style={{ transform: [{ rotate: '45deg' }] }}>
              <Icon as={Plane} size={16} className="text-[#111]" />
            </View>
            <View className="h-px flex-1 border-t border-dashed border-[#a7a49b]" />
          </View>
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
        <LinearGradient colors={['#2b3a67', '#b7698a', '#f2c48d']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 112 }} />
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
