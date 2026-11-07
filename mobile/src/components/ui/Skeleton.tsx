import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { cn } from '@/lib/utils';

/** Shimmering placeholder (Trippy's `skeleton`: surface-2 → surface-3 → surface-2, 1.8s loop). */
export function Skeleton({ className, ...props }: ViewProps & { className?: string }) {
  const [width, setWidth] = useState(0);
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }] }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className={cn('overflow-hidden rounded-xl bg-surface-2', className)}
      {...props}
    >
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: '100%' }, style]}>
        <LinearGradient
          colors={['transparent', 'rgba(128,128,120,0.16)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}
