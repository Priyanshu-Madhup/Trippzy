import { useAuth } from '@clerk/expo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, Globe2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useProfile } from '@/hooks/useProfile';
import legal from '@/lib/legal.json';
import { qk } from '@/lib/queryClient';
import { acceptTerms, needsTerms } from '@/services/terms';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';

/**
 * Shown right after sign-up (and again whenever the terms change): what Trippzy does with your data and where it lives.
 * Accepting is saved on the server with the version and time. Declining signs the user out.
 */
export default function Terms() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const soft = useShadow('soft');
  const [agreed, setAgreed] = useState(false);
  const already = !!profile && !needsTerms(profile); // opened again from Settings just to read

  const accept = useMutation({
    mutationFn: () => acceptTerms(profile?.terms_current_version ?? legal.version),
    onSuccess: (p) => {
      qc.setQueryData(qk.profile, p);
      router.replace('/');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Couldn’t save that. Please try again.'),
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 24, paddingHorizontal: 20 }}>
        <Animated.View entering={FadeInUp.duration(300)}>
          <LogoMark size={44} />
          <Text accessibilityRole="header" className="mt-5 font-geist-semibold text-[32px] leading-[36px]" style={{ letterSpacing: -1.1 }}>
            {legal.title}
          </Text>
          <Text className="mt-2 text-[15px] leading-[22px] text-muted">{legal.intro}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(300)} style={soft} className="mt-6 rounded-card border border-line bg-surface p-5">
          <View className="mb-1 flex-row items-center gap-2.5">
            <View className="size-8 items-center justify-center rounded-xl bg-sun/15">
              <Icon as={Globe2} size={16} className="text-sun" />
            </View>
            <Text className="font-geist-semibold text-[16px]">Where your data lives</Text>
          </View>
          {legal.locations.map((l, i) => (
            <View key={l.what} className={cn('py-3', i > 0 && 'border-t border-line')}>
              <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 font-geist-medium text-[14px] leading-5">{l.what}</Text>
                <View className="rounded-full bg-surface-2 px-2.5 py-1">
                  <Text className="font-geist-medium text-[11px] text-ink-2">{l.where}</Text>
                </View>
              </View>
              <Text className="mt-0.5 text-[12px] leading-[17px] text-muted">{l.note}</Text>
            </View>
          ))}
        </Animated.View>

        {legal.sections.map((s, i) => (
          <Animated.View key={s.title} entering={FadeInDown.delay(140 + i * 40).duration(300)} className="mt-6">
            <Text className="font-geist-semibold text-[17px]">{s.title}</Text>
            {s.body.map((p) => (
              <Text key={p} className="mt-2 text-[14px] leading-[21px] text-ink-2">
                {p}
              </Text>
            ))}
          </Animated.View>
        ))}
      </ScrollView>

      <View className="border-t border-line bg-bg-elevated px-5 pt-4" style={{ paddingBottom: insets.bottom + 14 }}>
        {already ? (
          <Button size="lg" onPress={close}>
            Close
          </Button>
        ) : (
          <>
            <Pressable onPress={() => setAgreed((a) => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} className="mb-3 flex-row items-center gap-3 active:opacity-80">
              <View className={cn('size-6 items-center justify-center rounded-lg border', agreed ? 'border-primary bg-primary' : 'border-line-strong bg-surface')}>
                {agreed ? <Icon as={Check} size={15} className="text-primary-ink" /> : null}
              </View>
              <Text className="flex-1 text-[14px] leading-5">{legal.consent}</Text>
            </Pressable>
            <Button size="lg" disabled={!agreed} loading={accept.isPending} onPress={() => accept.mutate()}>
              Agree and continue
            </Button>
            <Pressable
              onPress={async () => {
                await signOut();
                qc.clear();
                router.replace('/welcome');
              }}
              accessibilityRole="button"
              className="mt-2 h-10 items-center justify-center"
            >
              <Text className="text-[13px] text-muted">I don’t agree. Sign out</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
