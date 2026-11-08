import { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { hex } from '@/theme/tokens';

let played = false; // once per app launch, not every time the root re-renders

/**
 * The opening animation. The native splash (same colour, same logo) hands over to this with no visible jump: the logo
 * pops in with a spring, rests for a beat, then swells and fades away as the app fades in underneath.
 */
export function AppIntro() {
  const { resolved } = useTheme();
  const [show, setShow] = useState(!played);
  const logo = useSharedValue(0.86);
  const logoOpacity = useSharedValue(0);
  const veil = useSharedValue(1);

  useEffect(() => {
    if (played) return;
    played = true;
    const done = () => setShow(false);
    logoOpacity.value = withTiming(1, { duration: 260 });
    logo.value = withSequence(
      withSpring(1, { damping: 13, stiffness: 150 }),
      withDelay(380, withTiming(1.35, { duration: 420, easing: Easing.in(Easing.cubic) })),
    );
    logoOpacity.value = withSequence(withTiming(1, { duration: 260 }), withDelay(640, withTiming(0, { duration: 260 })));
    veil.value = withDelay(
      760,
      withTiming(0, { duration: 340, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(done)();
      }),
    );
  }, [logo, logoOpacity, veil]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value, transform: [{ scale: logo.value }] }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));

  if (!show) return null;
  return (
    <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: hex[resolved].bg }, veilStyle]}>
      <Animated.View style={logoStyle}>
        <Image source={require('../../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  logo: { width: 200, height: 200 },
});
