import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/brand/Logo';
import { useShadow } from '@/theme/useShadow';
import { hex } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { SkyBackdrop } from './SkyBackdrop';

/** Phone layout of Trippy's AuthLayout: sky across the top 38%, fading into the page, form card over it. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lift = useShadow('lift');
  const { resolved } = useTheme();
  const bg = hex[resolved].bg;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-bg">
      <View className="absolute inset-x-0 top-0 overflow-hidden" style={{ height: '38%' }}>
        <SkyBackdrop />
        <LinearGradient colors={['transparent', bg]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 40 }}>
        <View style={{ paddingTop: insets.top + 20 }} className="px-6 pb-5">
          <Pressable accessibilityRole="link" accessibilityLabel="Trippzy home" onPress={() => router.replace('/welcome')}>
            <Logo inverted />
          </Pressable>
        </View>
        <View className="px-4 pt-[9%] sm:px-6">
          <Animated.View
            entering={FadeInDown.duration(450)}
            style={lift}
            className="w-full max-w-[420px] self-center rounded-[28px] border border-line bg-surface/95 p-6"
          >
            {children}
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
