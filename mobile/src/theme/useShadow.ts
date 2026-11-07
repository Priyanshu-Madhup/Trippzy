import type { ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';
import { shadows } from './tokens';

export type ShadowLevel = keyof typeof shadows;

/** Trippy's shadow levels (soft / card / lift / float) as a style — theme-aware. */
export function useShadow(level: ShadowLevel): ViewStyle {
  const { resolved } = useTheme();
  // `boxShadow` is supported by React Native's New Architecture (mandatory in this SDK).
  return { boxShadow: shadows[level](resolved === 'dark') } as ViewStyle;
}
