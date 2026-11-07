import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useColorScheme, vars } from 'nativewind';
import { themeVars, type Scheme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePreference;
  resolved: Scheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'trippzy.theme';

/**
 * system / light / dark, persisted — same behaviour as Trippy's ThemeProvider. The resolved
 * scheme drives both NativeWind's `dark:` variant and the CSS variables (Trippy's tokens)
 * applied to the root view, so every semantic class (bg-surface, text-ink…) re-colours.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [theme, setThemeState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        const t: ThemePreference = v === 'light' || v === 'dark' ? v : 'system';
        setThemeState(t);
        setColorScheme(t);
      })
      .catch(() => undefined);
  }, [setColorScheme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      setColorScheme(next);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
    },
    [setColorScheme],
  );

  const resolved: Scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, vars(themeVars[resolved])]} className="bg-bg">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
