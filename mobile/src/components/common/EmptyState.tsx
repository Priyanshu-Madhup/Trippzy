import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { hex } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(350)} className="items-center px-6 py-14">
      <RouteIllustration />
      <Text className="mt-6 text-center font-geist-semibold text-2xl tracking-tight">{title}</Text>
      <Text className="mt-2 max-w-sm text-center text-[15px] leading-[22px] text-muted">{description}</Text>
      {action ? <View className="mt-7">{action}</View> : null}
    </Animated.View>
  );
}

export function RouteIllustration() {
  const { resolved } = useTheme();
  const c = hex[resolved];
  return (
    <Svg width={206} height={112} viewBox="0 0 220 120" accessibilityElementsHidden>
      <Rect x={10} y={22} width={200} height={86} rx={22} fill={c.surface} stroke={resolved === 'dark' ? 'rgba(255,255,255,0.13)' : 'rgba(17,17,16,0.14)'} strokeWidth={1} />
      <Path d="M44 84 C 70 40, 140 30, 176 52" fill="none" stroke={c.ink} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" />
      <Circle cx={44} cy={84} r={6} fill={c.ink} />
      <Circle cx={176} cy={52} r={8} fill="none" stroke="#E8B26A" strokeWidth={3} />
      <Rect x={34} y={34} width={46} height={6} rx={3} fill={resolved === 'dark' ? '#27272b' : '#e8e6e0'} />
      <Rect x={140} y={88} width={46} height={6} rx={3} fill={resolved === 'dark' ? '#27272b' : '#e8e6e0'} />
    </Svg>
  );
}
