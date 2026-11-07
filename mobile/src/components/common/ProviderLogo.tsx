import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { cn, hashHue, initials } from '@/lib/utils';

/**
 * Brand logo with a graceful monogram fallback — never a broken image. The logo sits on a white
 * tile so favicons look consistent in dark mode (same as Trippy).
 */
export function ProviderLogo({
  src,
  name,
  code,
  size = 40,
  rounded = 'rounded-xl',
  className,
}: {
  src: string | null | undefined;
  name: string | null | undefined;
  /** Preferred monogram text, e.g. an IATA code */
  code?: string | null;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const label = name ?? code ?? 'Provider';
  const hue = hashHue(label);

  if (src && failedSrc !== src) {
    return (
      <View
        accessibilityLabel={`${label} logo`}
        className={cn('items-center justify-center overflow-hidden border border-black/5 bg-white', rounded, className)}
        style={{ width: size, height: size }}
      >
        <Image source={{ uri: src }} contentFit="contain" cachePolicy="disk" onError={() => setFailedSrc(src)} style={{ width: size * 0.78, height: size * 0.78 }} />
      </View>
    );
  }

  const text = (code && code.length <= 3 ? code : initials(name, '•')).toUpperCase();
  return (
    <View accessibilityRole="image" accessibilityLabel={`${label} logo`} className={cn('overflow-hidden', rounded, className)} style={{ width: size, height: size }}>
      <LinearGradient colors={[`hsl(${hue}, 45%, 38%)`, `hsl(${(hue + 30) % 360}, 55%, 52%)`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text className="font-geist-semibold text-white" style={{ fontSize: Math.max(10, size * 0.34) }}>
          {text}
        </Text>
      </LinearGradient>
    </View>
  );
}
