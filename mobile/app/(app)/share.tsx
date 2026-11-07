import { useRouter } from 'expo-router';
import { ArrowRight, FileText, Image as ImageIcon, Map, Plus, Sparkles, X } from 'lucide-react-native';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useCreateTrip, useTrips } from '@/hooks/useTrips';
import { useUploads } from '@/hooks/useUpload';
import { formatBytes, plural } from '@/lib/utils';
import { pendingShare } from '@/services/share';
import { useShadow } from '@/theme/useShadow';
import { formatRange } from '@/utils/date';
import { upcomingTrips } from '@/utils/trips';

const Label = ({ children }: { children: string }) => <Text className="px-1 font-geist-medium text-[11px] uppercase tracking-[1.1px] text-faint">{children}</Text>;

/** Opened when another app shares a PDF / image to Trippzy: choose which trip it belongs to, then it uploads. */
export default function ShareToTrip() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const soft = useShadow('soft');
  const lift = useShadow('lift');
  const { enqueue } = useUploads();
  const { data: trips, isLoading } = useTrips();
  const create = useCreateTrip();
  const files = useSyncExternalStore(pendingShare.subscribe, pendingShare.get);
  const [newName, setNewName] = useState('');

  const { soon, past } = useMemo(() => {
    const all = trips ?? [];
    const upcoming = upcomingTrips([...all]);
    const ids = new Set(upcoming.map((t) => t.id));
    return { soon: upcoming, past: all.filter((t) => !ids.has(t.id)) };
  }, [trips]);

  const close = () => {
    pendingShare.clear();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  function send(tripId: string) {
    if (!files.length) return;
    enqueue(tripId, files);
    pendingShare.clear();
    toast.success(files.length === 1 ? 'Uploading to your trip…' : `Uploading ${files.length} files…`);
    router.replace({ pathname: '/trip/[tripId]', params: { tripId } });
  }

  async function createAndSend() {
    const name = newName.trim();
    if (!name) return;
    try {
      const trip = await create.mutateAsync({ name, destination: null, start_date: null, end_date: null });
      send(trip.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the trip.');
    }
  }

  const row = (t: NonNullable<typeof trips>[number], i: number) => (
    <Animated.View key={t.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(260)}>
      <Pressable
        onPress={() => send(t.id)}
        accessibilityRole="button"
        accessibilityLabel={`Add to ${t.name}`}
        style={soft}
        className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-3 active:scale-[0.99] active:bg-surface-2"
      >
        <View className="size-11 items-center justify-center rounded-xl bg-surface-2">
          <Icon as={Map} size={19} className="text-ink-2" />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
            {t.name}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">
            {[t.destination, formatRange(t.start_date, t.end_date)].filter(Boolean).join(' · ') || 'No dates yet'}
          </Text>
        </View>
        <View className="size-8 items-center justify-center rounded-full bg-primary">
          <Icon as={ArrowRight} size={15} className="text-primary-ink" />
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-bg">
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16 }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full bg-line-strong" />
        </View>

        <Animated.View entering={FadeInUp.duration(280)} style={lift} className="overflow-hidden rounded-card border border-line bg-surface p-5">
          <View className="flex-row items-start justify-between gap-3">
            <View className="size-11 items-center justify-center rounded-2xl bg-primary">
              <Icon as={Sparkles} size={20} className="text-primary-ink" />
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Cancel" className="size-10 items-center justify-center rounded-full bg-surface-2 active:opacity-70">
              <Icon as={X} size={18} className="text-muted" />
            </Pressable>
          </View>
          <Text accessibilityRole="header" className="mt-4 font-geist-semibold text-[28px] leading-[32px]" style={{ letterSpacing: -1 }}>
            Add to a trip
          </Text>
          <Text className="mt-1.5 text-[14px] leading-5 text-muted">
            Pick a trip and we’ll read {files.length === 1 ? 'this file' : 'these files'} and build the booking for you.
          </Text>

          <View className="mt-4 gap-2">
            {files.length === 0 ? (
              <Text className="text-sm text-muted">Nothing to add. Share a PDF or image to Trippzy from another app.</Text>
            ) : (
              files.map((f) => {
                const isImage = /\.(png|jpe?g|webp|heic|gif)$/i.test(f.name) || f.mimeType?.startsWith('image/');
                return (
                  <View key={f.uri} className="flex-row items-center gap-3 rounded-2xl bg-surface-2 p-2.5">
                    <View className="size-9 items-center justify-center rounded-xl bg-surface">
                      <Icon as={isImage ? ImageIcon : FileText} size={17} className="text-ink-2" />
                    </View>
                    <Text numberOfLines={1} className="flex-1 font-geist-medium text-[14px]">
                      {f.name}
                    </Text>
                    <Text className="pr-1 text-xs text-faint">{formatBytes(f.size)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </Animated.View>

        {files.length ? (
          <View className="mt-6 gap-6">
            {isLoading ? (
              <View className="gap-2">
                <Skeleton className="h-[68px] rounded-2xl" />
                <Skeleton className="h-[68px] rounded-2xl" />
              </View>
            ) : (
              <>
                {soon.length ? (
                  <View className="gap-2">
                    <Label>Your trips</Label>
                    {soon.map(row)}
                  </View>
                ) : null}
                {past.length ? (
                  <View className="gap-2">
                    <Label>{`Past trips · ${plural(past.length, 'trip')}`}</Label>
                    {past.map(row)}
                  </View>
                ) : null}
              </>
            )}

            <Animated.View entering={FadeInDown.delay(120).duration(280)} style={soft} className="gap-3 rounded-card border border-dashed border-line-strong bg-surface p-4">
              <View className="flex-row items-center gap-2">
                <Icon as={Plus} size={16} className="text-ink-2" />
                <Text className="font-geist-semibold text-[15px]">Start a new trip</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Input value={newName} onChangeText={setNewName} placeholder="Trip name" maxLength={120} accessibilityLabel="New trip name" returnKeyType="done" onSubmitEditing={createAndSend} />
                </View>
                <Button loading={create.isPending} disabled={!newName.trim()} onPress={createAndSend}>
                  Create
                </Button>
              </View>
            </Animated.View>
          </View>
        ) : (
          <View className="mt-6">
            <Button variant="secondary" onPress={close}>
              Close
            </Button>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
