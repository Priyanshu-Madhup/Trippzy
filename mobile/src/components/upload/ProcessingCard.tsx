import { Check, CircleAlert, FileText, ScanText, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { cn, formatBytes } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';

export type Stage = 'queued' | 'uploading' | 'handoff' | 'reading' | 'identifying' | 'extracting' | 'building' | 'finishing' | 'done' | 'failed';

// Same copy as Trippy's ProcessingState.
const COPY: Record<Stage, string> = {
  queued: 'Waiting in line…',
  uploading: 'Uploading…',
  handoff: 'Reading your ticket…',
  reading: 'Reading your ticket…',
  identifying: 'Identifying booking…',
  extracting: 'Extracting details…',
  building: 'Building your travel card…',
  finishing: 'Almost there…',
  done: 'Added to your trip',
  failed: 'Couldn’t read this document.',
};
const PROGRESS: Record<Stage, number> = { queued: 0.02, uploading: 0, handoff: 0.32, reading: 0.34, identifying: 0.5, extracting: 0.68, building: 0.86, finishing: 0.95, done: 1, failed: 1 };
const STEPS: Stage[] = ['uploading', 'reading', 'identifying', 'extracting', 'building'];

/**
 * Live card shown while a ticket uploads and is read. `stage` comes from the client (queued /
 * uploading) and then from the server's real progress — not from timers as in Trippy.
 */
export function ProcessingCard({
  stage,
  fileName,
  fileSize,
  uploadProgress = 0,
  ahead = 0,
  error,
  onDismiss,
}: {
  stage: Stage;
  fileName: string;
  fileSize?: number | null;
  uploadProgress?: number;
  /** For queued uploads: how many files are in front of this one. */
  ahead?: number;
  error?: string | null;
  onDismiss?: () => void;
}) {
  const card = useShadow('card');
  const failed = stage === 'failed';
  const done = stage === 'done';
  const ratio = stage === 'uploading' ? 0.04 + uploadProgress * 0.26 : PROGRESS[stage];
  const stepIndex = STEPS.indexOf(stage === 'finishing' ? 'building' : stage === 'handoff' ? 'reading' : stage);

  const width = useSharedValue(2);
  useEffect(() => {
    width.value = withSpring(Math.round(ratio * 100), { stiffness: 60, damping: 18 });
  }, [ratio, width]);
  const bar = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.55, { duration: 1100, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) })), -1);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut.duration(200)} style={card} accessibilityRole="progressbar" accessibilityLiveRegion="polite" className="overflow-hidden rounded-card border border-line bg-surface p-5">
      <View className="flex-row items-start gap-3.5">
        <View className={cn('size-11 items-center justify-center rounded-2xl', failed ? 'bg-danger-bg' : done ? 'bg-success/10' : 'bg-surface-2')}>
          {failed ? (
            <Icon as={CircleAlert} size={20} className="text-danger" />
          ) : done ? (
            <Icon as={Check} size={20} className="text-success" />
          ) : (
            <Animated.View style={pulseStyle}>
              <Icon as={ScanText} size={20} className="text-ink" />
            </Animated.View>
          )}
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className={cn('font-geist-semibold text-[15px]', failed && 'text-danger')}>
            {failed ? (error ?? COPY.failed) : stage === 'queued' && ahead > 0 ? `In line · ${ahead} ahead` : stage === 'queued' && ahead === 0 && uploadProgress === 0 ? COPY.queued : COPY[stage]}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <Icon as={FileText} size={14} className="text-muted" />
            <Text numberOfLines={1} className="flex-shrink text-[13px] text-muted">
              {fileName}
            </Text>
            {fileSize ? <Text className="text-[13px] text-faint">· {formatBytes(fileSize)}</Text> : null}
          </View>
        </View>
        {failed && onDismiss ? (
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" className="-m-1 size-8 items-center justify-center rounded-full active:bg-surface-2">
            <Icon as={X} size={16} className="text-muted" />
          </Pressable>
        ) : null}
      </View>

      <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <Animated.View style={bar} className={cn('h-full rounded-full', failed ? 'bg-danger' : 'bg-ink')} />
      </View>

      {!failed ? (
        <View className="mt-3 flex-row gap-1.5" accessibilityElementsHidden>
          {STEPS.map((s, i) => (
            <View key={s} className={cn('h-1 flex-1 rounded-full', done || i < stepIndex ? 'bg-ink/70' : i === stepIndex ? 'bg-sun' : 'bg-surface-3')} />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}
