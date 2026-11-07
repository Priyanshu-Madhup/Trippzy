import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';

/** A back button, a big title and a one-line summary: the top of the Profile → Tickets / Documents screens. */
export function BackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 12 }} className="px-4 pb-4">
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="-ml-1 mb-3 size-10 items-center justify-center rounded-full border border-line bg-surface active:bg-surface-2"
      >
        <Icon as={ArrowLeft} size={18} className="text-ink" />
      </Pressable>
      <Text accessibilityRole="header" className="font-geist-semibold text-[34px] leading-[36px]" style={{ letterSpacing: -1.36 }}>
        {title}
      </Text>
      {subtitle ? <Text className="mt-1 text-[14px] text-muted">{subtitle}</Text> : null}
    </View>
  );
}
