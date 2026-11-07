import { X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { themeVars } from '@/theme/tokens';
import { vars } from 'nativewind';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Trippy's dialog on a phone: a bottom sheet with a grabber, title + description and a close button
 * (rounded-t-[28px], surface background, dimmed backdrop). Built on React Native's own `Modal` — no
 * third-party gesture/portal stack — so it opens reliably. Back button and backdrop tap close it.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { resolved } = useTheme();

  // Keep the Modal mounted just long enough for the slide-out animation to play.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* Re-apply the theme variables: a Modal is its own native window, so don't rely on inheriting them. */}
      <View style={[{ flex: 1 }, vars(themeVars[resolved])]}>
        {open ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
          </Animated.View>
        ) : null}

        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          {open ? (
            <Animated.View
              entering={SlideInDown.duration(320)}
              exiting={SlideOutDown.duration(220)}
              accessibilityViewIsModal
              accessibilityLabel={title}
              style={{ maxHeight: height * 0.92, paddingBottom: insets.bottom }}
              className="overflow-hidden rounded-t-sheet bg-surface"
            >
              <View className="mt-2.5 h-1 w-10 self-center rounded-full bg-line-strong" />
              <View className="flex-row items-start justify-between gap-4 px-6 pt-4">
                <View className="min-w-0 flex-1">
                  <Text accessibilityRole="header" className="font-geist-semibold text-xl tracking-tight">
                    {title}
                  </Text>
                  {description ? <Text className="mt-1 text-sm text-muted">{description}</Text> : null}
                </View>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" className="-mr-2 -mt-1 size-9 items-center justify-center rounded-full active:bg-surface-2">
                  <Icon as={X} size={18} className="text-muted" />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={Platform.OS === 'android' ? { paddingBottom: 8 } : undefined}>
                {children}
              </ScrollView>
            </Animated.View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
