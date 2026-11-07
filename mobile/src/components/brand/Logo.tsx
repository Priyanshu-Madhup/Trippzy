import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { BRAND } from '@/lib/brand';
import { hex } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Brand mark: a dotted route arcing from an origin point to a destination ring (ported from Trippy). */
export function LogoMark({ size = 32, inverted }: { size?: number; inverted?: boolean }) {
  const { resolved } = useTheme();
  const tile = inverted ? '#ffffff' : hex[resolved].ink;
  const mark = inverted ? '#111110' : hex[resolved].bg;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect width={64} height={64} rx={18} fill={tile} />
      <Path d="M18 45 C 21 26, 36 17, 46 19" fill="none" stroke={mark} strokeWidth={4} strokeLinecap="round" strokeDasharray="0.1 8.2" />
      <Circle cx={18} cy={45} r={5} fill={mark} />
      <Circle cx={46} cy={19} r={6.5} fill="none" stroke="#E8B26A" strokeWidth={4} />
    </Svg>
  );
}

export function Logo({ inverted, showWordmark = true, size = 32 }: { inverted?: boolean; showWordmark?: boolean; size?: number }) {
  return (
    <View accessibilityLabel={BRAND.name} className="flex-row items-center gap-2.5">
      <LogoMark inverted={inverted} size={size} />
      {showWordmark ? (
        <Text className={`font-geist-semibold text-[19px] ${inverted ? 'text-white' : 'text-ink'}`} style={{ letterSpacing: -0.57 }}>
          {BRAND.name.toLowerCase()}
        </Text>
      ) : null}
    </View>
  );
}
