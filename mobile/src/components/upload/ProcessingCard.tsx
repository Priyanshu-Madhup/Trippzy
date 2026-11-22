import { Check, CircleAlert, FileText, ImageIcon, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { cn, formatBytes } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';

export type Stage = 'queued' | 'uploading' | 'handoff' | 'reading' | 'identifying' | 'extracting' | 'building' | 'finishing' | 'done' | 'failed';

const COPY: Record<Stage, string> = {
  queued: 'Waiting in line',
  uploading: 'Uploading your file',
  handoff: 'Reading your ticket',
  reading: 'Reading your ticket',
  identifying: 'Identifying the booking',
  extracting: 'Extracting the details',
  building: 'Building your travel card',
  finishing: 'Almost there',
  done: 'Added to your trip',
  failed: 'Couldn’t read this document.',
};
const PROGRESS: Record<Stage, number> = { queued: 0.02, uploading: 0, handoff: 0.32, reading: 0.34, identifying: 0.5, extracting: 0.68, building: 0.86, finishing: 0.95, done: 1, failed: 1 };
const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'uploading', label: 'Upload' },
  { stage: 'reading', label: 'Read' },
  { stage: 'identifying', label: 'Identify' },
  { stage: 'extracting', label: 'Extract' },
  { stage: 'building', label: 'Build' },
];

/** One step of the tracker: a done tick, a pulsing current dot, or an empty ring, joined to its neighbours by a line. */
function Step({ index, current, total, done, label }: { index: number; current: number; total: number; done: boolean; label: string }) {
  const finished = done || index < current;
  const active = !done && index === current;
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [active, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.5, 0]), transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 2.1]) }] }));

  return (
    <View className="flex-1 items-center">
      {index > 0 ? <View className={cn('absolute left-0 right-1/2 top-[9px] h-[2px]', index <= current || done ? 'bg-ink/70' : 'bg-line')} /> : null}
      {index < total - 1 ? <View className={cn('absolute left-1/2 right-0 top-[9px] h-[2px]', index < current || done ? 'bg-ink/70' : 'bg-line')} /> : null}
      <View className="size-5 items-center justify-center">
        {active ? <Animated.View style={ring} className="absolute size-3 rounded-full bg-sun" /> : null}
        <View className={cn('size-5 items-center justify-center rounded-full', finished ? 'bg-ink' : active ? 'border-2 border-sun bg-surface' : 'border border-line-strong bg-surface')}>
          {finished ? <Icon as={Check} size={11} className="text-primary-ink" strokeWidth={3} /> : active ? <View className="size-2 rounded-full bg-sun" /> : null}
        </View>
      </View>
      <Text numberOfLines={1} className={cn('mt-1.5 font-geist-medium text-[10px] tracking-[0.3px]', finished || active ? 'text-ink' : 'text-faint')}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Live card shown while a ticket uploads and is read. `stage` comes from the client (queued /
 * uploading) and then from the server's real progress, not from timers.
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
  const queued = stage === 'queued';
  const ratio = stage === 'uploading' ? 0.04 + uploadProgress * 0.26 : PROGRESS[stage];
  const current = Math.max(0, STEPS.findIndex((s) => s.stage === (stage === 'finishing' ? 'building' : stage === 'handoff' ? 'reading' : stage)));
  const isImage = /\.(png|jpe?g|webp|heic)$/i.test(fileName);
  const percent = Math.min(100, Math.round(ratio * 100));

  const width = useSharedValue(2);
  useEffect(() => {
    width.value = withSpring(Math.max(2, percent), { stiffness: 60, damping: 18 });
  }, [percent, width]);
  const bar = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  // A soft highlight that glides across the bar while work is in progress.
  const [trackW, setTrackW] = useState(0);
  const glide = useSharedValue(0);
  useEffect(() => {
    if (failed || done) return;
    glide.value = withRepeat(withSequence(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 500 })), -1, false);
  }, [failed, done, glide]);
  const shimmer = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(glide.value, [0, 1], [-70, trackW]) }] }));

  const tile = useSharedValue(1);
  useEffect(() => {
    if (failed || done) return;
    tile.value = withRepeat(withSequence(withTiming(1.07, { duration: 900, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })), -1);
  }, [failed, done, tile]);
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: tile.value }] }));

  const title = failed ? (error ?? COPY.failed) : queued ? (ahead > 0 ? `In line · ${ahead} ahead` : COPY.queued) : COPY[stage];

  return (
    <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut.duration(200)} style={card} accessibilityRole="progressbar" accessibilityLiveRegion="polite" className="overflow-hidden rounded-card border border-line bg-surface p-4">
      <View className="flex-row items-center gap-3.5">
        <Animated.View style={tileStyle} className={cn('size-12 items-center justify-center rounded-2xl', failed ? 'bg-danger-bg' : done ? 'bg-success/10' : 'bg-sun/20')}>
          <Icon as={failed ? CircleAlert : done ? Check : isImage ? ImageIcon : FileText} size={22} className={failed ? 'text-danger' : done ? 'text-success' : 'text-ink'} />
        </Animated.View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={failed ? 2 : 1} className={cn('font-geist-semibold text-[15px] tracking-tight', failed && 'text-danger')}>
            {title}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">
            {fileName}
            {fileSize ? <Text className="text-faint">{`  ·  ${formatBytes(fileSize)}`}</Text> : null}
          </Text>
        </View>
        {failed && onDismiss ? (
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" className="size-8 items-center justify-center rounded-full active:bg-surface-2">
            <Icon as={X} size={16} className="text-muted" />
          </Pressable>
        ) : !failed ? (
          <Text className="font-geist-mono-semibold text-[13px] text-ink-2">{done ? '100%' : queued ? '—' : `${percent}%`}</Text>
        ) : null}
      </View>

      {!failed ? (
        <>
          <View onLayout={(e) => setTrackW(e.nativeEvent.layout.width)} className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
            <Animated.View style={bar} className="h-full overflow-hidden rounded-full bg-sun">
              {!done ? <Animated.View style={shimmer} className="absolute inset-y-0 w-14 bg-white/40" /> : null}
            </Animated.View>
          </View>
          <View className="mt-4 flex-row" accessibilityElementsHidden>
            {STEPS.map((s, i) => (
              <Step key={s.stage} index={i} current={queued ? -1 : current} total={STEPS.length} done={done} label={s.label} />
            ))}
          </View>
        </>
      ) : null}
    </Animated.View>
  );
}
