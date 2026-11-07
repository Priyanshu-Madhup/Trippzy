import { AlertTriangle, Car, Compass, MapPin, RefreshCw, TrafficCone } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useLocationAccess, useTripNote } from '@/hooks/useTripNote';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { DocumentType, NoteConnection, TripNote } from '@/types';
import { TYPE_META } from '@/utils/ticket';

const panel = 'rounded-card border border-line bg-surface p-5';

function Header({ onRefresh, spinning }: { onRefresh?: () => void; spinning?: boolean }) {
  return (
    <View className="mb-3 flex-row items-center justify-between gap-3">
      <View className="flex-row items-center gap-2.5">
        <View className="size-8 items-center justify-center rounded-xl bg-sun/15">
          <Icon as={Compass} size={16} className="text-sun" />
        </View>
        <Text className="font-geist-semibold text-[15px]">Trippzy note</Text>
      </View>
      {onRefresh ? (
        <Pressable onPress={onRefresh} disabled={spinning} accessibilityRole="button" accessibilityLabel="Refresh note" hitSlop={8} className="size-9 items-center justify-center rounded-full active:bg-surface-2">
          <Icon as={RefreshCw} size={16} className={cn('text-muted', spinning && 'opacity-40')} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Chip({ icon, text, tone = 'plain' }: { icon: Parameters<typeof Icon>[0]['as']; text: string; tone?: 'plain' | 'warn' }) {
  return (
    <View className={cn('flex-row items-center gap-1.5 rounded-full px-3 py-1.5', tone === 'warn' ? 'bg-warning-bg' : 'bg-surface-2')}>
      <Icon as={icon} size={13} className={tone === 'warn' ? 'text-warning' : 'text-muted'} />
      <Text className={cn('text-[12px] font-geist-medium', tone === 'warn' ? 'text-warning' : 'text-ink-2')}>{text}</Text>
    </View>
  );
}

function gapLabel(min: number | null | undefined) {
  if (min == null) return null;
  if (min < 0) return 'overlaps';
  const h = Math.floor(min / 60);
  return `${h ? `${h} h ` : ''}${min % 60} min gap`.replace(' 0 min', '');
}

function Connection({ c }: { c: NoteConnection }) {
  const meta = TYPE_META[c.kind as DocumentType] ?? TYPE_META.unknown;
  return (
    <View className="flex-row items-center gap-3 py-2">
      <View className={cn('size-9 items-center justify-center rounded-xl', meta.tile)}>
        <Icon as={meta.icon} size={16} className={meta.text} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-geist-medium text-[14px]">
          {c.title}
        </Text>
        <Text numberOfLines={1} className="text-[12px] text-muted">
          {c.departs_local}
        </Text>
      </View>
      {gapLabel(c.gap_minutes) ? (
        <View className={cn('rounded-full px-2.5 py-1', c.tight ? 'bg-warning-bg' : 'bg-surface-2')}>
          <Text className={cn('text-[11px] font-geist-medium', c.tight ? 'text-warning' : 'text-muted')}>{c.tight ? `Tight · ${gapLabel(c.gap_minutes)}` : gapLabel(c.gap_minutes)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function NoteBody({ note }: { note: TripNote }) {
  const t = note.traffic;
  const delayed = !!t && (t.delay_minutes >= 8 || t.closures > 0);
  const what = note.mode === 'flight' ? 'airport' : note.mode === 'bus' ? 'bus stop' : 'station';
  return (
    <View>
      {note.leave_by_local ? (
        <View className="mb-1 flex-row items-end gap-6">
          <View>
            <Text className="text-[11px] font-geist-medium uppercase tracking-[1.1px] text-faint">Leave by</Text>
            <Text className="font-geist-semibold text-[34px] leading-[38px]" style={{ letterSpacing: -1.2 }}>
              {note.leave_by_local}
            </Text>
          </View>
          <View className="pb-1">
            <Text className="text-[11px] font-geist-medium uppercase tracking-[1.1px] text-faint">Be at {what} by</Text>
            <Text className="font-geist-semibold text-[20px] text-ink-2">{note.arrive_by_local}</Text>
          </View>
        </View>
      ) : (
        <View className="mb-1">
          <Text className="text-[11px] font-geist-medium uppercase tracking-[1.1px] text-faint">Be at {what} by</Text>
          <Text className="font-geist-semibold text-[34px] leading-[38px]" style={{ letterSpacing: -1.2 }}>
            {note.arrive_by_local}
          </Text>
        </View>
      )}

      <Text className="mt-2 font-geist-semibold text-[15px]">{note.headline}</Text>
      <Text className="mt-1 text-[14px] leading-[21px] text-ink-2">{note.body}</Text>

      <View className="mt-3 flex-row flex-wrap gap-2">
        {note.distance_km != null ? <Chip icon={MapPin} text={`${note.distance_km} km away`} /> : null}
        {note.drive_minutes != null ? <Chip icon={Car} text={`${note.drive_minutes} min drive`} /> : null}
        {t && (t.delay_minutes > 0 || t.jams > 0) ? (
          <Chip icon={TrafficCone} tone={delayed ? 'warn' : 'plain'} text={t.delay_minutes > 0 ? `+${t.delay_minutes} min traffic` : `${t.jams} slow ${t.jams === 1 ? 'spot' : 'spots'}`} />
        ) : null}
        {t && t.roadworks > 0 ? <Chip icon={AlertTriangle} text={`${t.roadworks} roadwork${t.roadworks === 1 ? '' : 's'}`} /> : null}
        {t && t.closures > 0 ? <Chip icon={AlertTriangle} tone="warn" text="Road closure" /> : null}
      </View>

      {note.tips.length ? (
        <View className="mt-3 gap-1">
          {note.tips.map((tip) => (
            <Text key={tip} className="text-[13px] text-muted">
              • {tip}
            </Text>
          ))}
        </View>
      ) : null}

      {note.connections.length ? (
        <View className="mt-4 border-t border-line pt-3">
          <Text className="mb-1 text-[11px] font-geist-medium uppercase tracking-[1.1px] text-faint">Then</Text>
          {note.connections.map((c) => (
            <Connection key={c.ticket_id} c={c} />
          ))}
        </View>
      ) : null}

      <Text className="mt-3 text-[10px] text-faint">{note.route_checked ? `${t?.basis === 'live' ? 'Live' : 'Typical'} traffic · ` : ''}Your location isn’t stored on our servers.</Text>
    </View>
  );
}

/** A friendly, practical note for the trip's next departure: from your location, how far it is and when to leave. */
export function TrippzyNote({ tripId }: { tripId: string }) {
  const soft = useShadow('soft');
  const access = useLocationAccess();
  const q = useTripNote(tripId, access.status === 'granted');

  if (access.status === 'checking') return null; // a split second while the permission state is read

  if (access.status === 'unavailable') {
    // Builds made before location support was added can't read the phone's position.
    return (
      <View style={soft} className={panel}>
        <Header />
        <Text className="text-[14px] leading-[21px] text-ink-2">Your travel note needs the latest version of the Trippzy app (it uses your location to tell you when to leave). Install the new build and it will appear here.</Text>
      </View>
    );
  }

  if (access.status === 'ask' || access.status === 'blocked') {
    return (
      <View style={soft} className={panel}>
        <Header />
        <Text className="text-[14px] leading-[21px] text-ink-2">Share your location while you use the app and Trippzy will tell you when to leave for your next flight or train, with traffic.</Text>
        <Pressable
          onPress={() => (access.status === 'blocked' ? void Linking.openSettings() : void access.request())}
          accessibilityRole="button"
          className="mt-4 h-11 flex-row items-center justify-center gap-2 self-start rounded-full bg-primary px-5 active:opacity-90"
        >
          <Icon as={MapPin} size={16} className="text-primary-ink" />
          <Text className="font-geist-semibold text-sm text-primary-ink">{access.status === 'blocked' ? 'Open settings' : 'Use my location'}</Text>
        </Pressable>
        <Text className="mt-3 text-[11px] text-faint">Only used for this note. Our servers never store it.</Text>
      </View>
    );
  }

  if (q.isLoading) {
    return (
      <View style={soft} className={panel} accessibilityLabel="Trippzy note is loading">
        <Header spinning />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <Text className="mt-3 text-[12px] text-muted">Checking where you are and how the roads look…</Text>
      </View>
    );
  }

  if (q.isError || !q.data) {
    return (
      <View style={soft} className={panel}>
        <Header onRefresh={() => void q.refresh()} />
        <Text className="text-[14px] text-muted">{q.error instanceof Error ? q.error.message : 'Couldn’t put your note together right now.'}</Text>
      </View>
    );
  }

  if (q.data.state === 'no_departure') {
    return (
      <View style={soft} className={panel}>
        <Header onRefresh={() => void q.refresh()} spinning={q.isFetching} />
        <Text className="text-[14px] text-muted">No upcoming flight, train or bus on this trip yet. Add a ticket and your travel note will show up here.</Text>
      </View>
    );
  }

  return (
    <View style={soft} className={panel} accessibilityLabel="Trippzy note">
      <Header onRefresh={() => void q.refresh()} spinning={q.isFetching} />
      <NoteBody note={q.data} />
    </View>
  );
}
