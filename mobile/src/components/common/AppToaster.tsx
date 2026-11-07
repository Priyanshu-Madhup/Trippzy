import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react-native';
import { Easing, Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';
import { hex } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Drops in from above the screen edge with a soft overshoot, and lifts away quickly.
const enter = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -36 }, { scale: 0.86 }] },
  60: { opacity: 1, transform: [{ translateY: 4 }, { scale: 1.02 }], easing: Easing.out(Easing.cubic) },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
}).duration(420);

const exit = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  100: { opacity: 0, transform: [{ translateY: -28 }, { scale: 0.92 }], easing: Easing.in(Easing.cubic) },
}).duration(240);

/** Floating, pill-shaped notifications that sit clear of the phone's status bar and match the app theme. */
export function AppToaster() {
  const insets = useSafeAreaInsets();
  const { resolved } = useTheme();
  const c = hex[resolved];
  const dark = resolved === 'dark';

  return (
    <Toaster
      position="top-center"
      offset={insets.top + 12}
      theme={dark ? 'dark' : 'light'}
      duration={3200}
      gap={8}
      swipeToDismissDirection="up"
      animation={{ enter, exit }}
      icons={{
        success: <CircleCheck size={20} color={c.success} />,
        error: <CircleAlert size={20} color={c.danger} />,
        warning: <TriangleAlert size={20} color={c.warning} />,
        info: <Info size={20} color={c.muted} />,
      }}
      toastOptions={{
        style: {
          backgroundColor: c.surface,
          borderColor: dark ? 'rgba(255,255,255,0.13)' : 'rgba(17,17,16,0.10)',
          borderWidth: 1,
          borderRadius: 999,
          paddingVertical: 12,
          paddingHorizontal: 18,
          marginHorizontal: 16,
          boxShadow: dark ? '0 12px 32px -8px rgba(0,0,0,0.6)' : '0 12px 32px -10px rgba(30,25,15,0.30)',
        },
        titleStyle: { color: c.ink, fontFamily: 'Geist_500Medium', fontSize: 14 },
        descriptionStyle: { color: c.muted, fontFamily: 'Geist_400Regular', fontSize: 13 },
      }}
    />
  );
}
