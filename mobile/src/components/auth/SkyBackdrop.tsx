import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Dusk-sky backdrop with a dotted flight path — no stock photo required.
 * Port of Trippy's `SkyBackdrop` (radial gradient from the bottom-right, a soft top-left glow,
 * two dotted routes and a sprinkle of stars).
 */
export function SkyBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
      <Svg width="100%" height="100%" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="dusk" cx="80%" cy="110%" rx="120%" ry="80%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor="#f1b77a" />
            <Stop offset="0.22" stopColor="#d9806a" />
            <Stop offset="0.48" stopColor="#6b4a7a" />
            <Stop offset="0.75" stopColor="#1d2747" />
            <Stop offset="1" stopColor="#0d1226" />
          </RadialGradient>
          <RadialGradient id="glow" cx="20%" cy="10%" rx="60%" ry="40%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={800} height={800} fill="url(#dusk)" />
        <Rect width={800} height={800} fill="url(#glow)" />
        <Path d="M-40 620 C 160 420, 420 520, 560 300 S 820 120, 900 160" fill="none" stroke="white" strokeOpacity={0.5} strokeWidth={1.6} strokeDasharray="2 10" strokeLinecap="round" />
        <Path d="M-40 720 C 220 600, 380 700, 620 520 S 860 420, 900 440" fill="none" stroke="white" strokeOpacity={0.22} strokeWidth={1.2} strokeDasharray="2 12" strokeLinecap="round" />
        <Circle cx={560} cy={300} r={7} fill="none" stroke="#F3C88F" strokeWidth={2.5} />
        <Circle cx={96} cy={512} r={4} fill="white" fillOpacity={0.8} />
        {Array.from({ length: 40 }).map((_, i) => (
          <Circle key={i} cx={(i * 197) % 800} cy={(i * 83) % 360} r={i % 5 === 0 ? 1.3 : 0.7} fill="white" fillOpacity={0.15 + (i % 4) * 0.1} />
        ))}
      </Svg>
    </View>
  );
}
