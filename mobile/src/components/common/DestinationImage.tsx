import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { cn, gradientFor } from '@/lib/utils';
import { ImageLoading } from './ImageLoading';

/**
 * Destination / hotel photography with a fade-in and a destination-tinted gradient
 * underneath — so there is never a broken image or empty box (same idea as Trippy's).
 * While a photo is still being found (`pending`) or is downloading, a travel-route animation plays in its place.
 */
export function DestinationImage({
  src,
  seed,
  className,
  style,
  priority,
  pending,
  pendingLabel,
  children,
}: {
  src: string | null | undefined;
  /** Used for the fallback gradient (usually the destination name). */
  seed: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
  priority?: boolean;
  /** A photo is being looked up right now (no URL yet): animate instead of showing the static fallback. */
  pending?: boolean;
  /** Place name for the "Finding the perfect photo of …" caption. */
  pendingLabel?: string | null;
  children?: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const show = !!src && failedSrc !== src;
  const downloading = show && loadedSrc !== src;
  const finding = !show && !!pending;

  useEffect(() => {
    if (src && loadedSrc && loadedSrc !== src) setLoadedSrc(null);
  }, [src, loadedSrc]);

  return (
    <View className={cn('overflow-hidden', className)} style={style}>
      <LinearGradient colors={gradientFor(seed)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {!show && !finding ? <FallbackPattern /> : null}
      {show ? (
        <Image
          source={{ uri: src }}
          contentFit="cover"
          transition={700}
          priority={priority ? 'high' : 'normal'}
          cachePolicy="disk"
          onLoad={() => setLoadedSrc(src ?? null)}
          onError={() => setFailedSrc(src ?? null)}
          style={{ position: 'absolute', inset: 0 }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {downloading || finding ? (
        <Animated.View exiting={FadeOut.duration(600)} pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
          <ImageLoading label={finding ? pendingLabel : null} />
        </Animated.View>
      ) : null}
      {children}
    </View>
  );
}

function FallbackPattern() {
  return (
    <Svg style={{ position: 'absolute', inset: 0, opacity: 0.25 }} width="100%" height="100%" viewBox="0 0 400 240" preserveAspectRatio="none">
      <Path d="M-20 200 C 80 120, 180 170, 260 90 S 380 40, 440 60" fill="none" stroke="white" strokeWidth={1.5} strokeDasharray="2 7" strokeLinecap="round" />
      <Path d="M-20 230 C 120 170, 220 220, 300 150 S 400 110, 440 120" fill="none" stroke="white" strokeWidth={1} strokeDasharray="2 9" strokeLinecap="round" opacity={0.6} />
      <Circle cx={260} cy={90} r={5} fill="none" stroke="white" strokeWidth={1.5} />
    </Svg>
  );
}
