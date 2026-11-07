import { Image } from 'expo-image';
import { ExternalLink, Newspaper } from 'lucide-react-native';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Droplets, Thermometer, Wind } from 'lucide-react-native';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { PlaceInfo } from '@/types';
import { formatWeekday, todayISO } from '@/utils/date';
import { temp, weatherIcon, weatherLabel } from '@/utils/weather';

const panel = 'rounded-card border border-line bg-surface p-5';

/** Only ever open web links, whatever the news source returned. */
function openWeb(url: string) {
  if (/^https?:\/\//i.test(url)) void Linking.openURL(url);
}

export function WeatherCard({ place, info, loading }: { place: string; info: PlaceInfo | undefined; loading: boolean }) {
  const soft = useShadow('soft');
  const w = info?.weather;
  if (loading) {
    return (
      <View style={soft} className={panel} accessibilityElementsHidden>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-6 h-14 w-28" />
        <View className="mt-6 flex-row gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 flex-1 rounded-2xl" />
          ))}
        </View>
      </View>
    );
  }
  if (!w) {
    return (
      <View style={soft} className={panel}>
        <Text className="font-geist-semibold text-sm">Weather in {place}</Text>
        <Text className="mt-2 text-sm text-muted">Weather isn’t available right now.</Text>
      </View>
    );
  }
  const Cond = weatherIcon(w.current.condition, w.current.daylight);
  const today = todayISO();
  const days = w.days.filter((d) => d.date >= today).slice(0, 5);

  return (
    <View style={soft} className={cn(panel, 'overflow-hidden')} accessibilityLabel={`Weather in ${place}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-geist-medium text-[13px] text-muted">Weather now</Text>
          <Text numberOfLines={1} className="font-geist-semibold text-sm">
            {w.location ?? place}
          </Text>
        </View>
        <Icon as={Cond} size={36} strokeWidth={1.6} className="text-sun" />
      </View>
      <View className="mt-3 flex-row items-end gap-3">
        <Text className="font-geist-semibold text-[56px] leading-[56px]" style={{ letterSpacing: -2.8 }}>
          {temp(w.current.temperature)}
        </Text>
        <Text className="pb-1.5 font-geist-medium text-[15px] text-ink-2">{weatherLabel(w.current.condition)}</Text>
      </View>
      <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1">
        {w.current.feelsLike != null ? <Stat icon={Thermometer} text={`Feels ${temp(w.current.feelsLike)}`} /> : null}
        {w.current.humidity != null ? <Stat icon={Droplets} text={`${Math.round(w.current.humidity * 100)}%`} /> : null}
        {w.current.wind != null ? <Stat icon={Wind} text={`${Math.round(w.current.wind)} km/h`} /> : null}
      </View>

      {days.length ? (
        <View className="mt-5 flex-row gap-1.5">
          {days.map((d, i) => (
            <View key={d.date} className="flex-1 items-center gap-1.5 rounded-2xl bg-surface-2/70 px-1 py-2.5">
              <Text className="font-geist-semibold text-[11px] uppercase tracking-[0.5px] text-muted">{i === 0 ? 'Today' : formatWeekday(d.date)}</Text>
              <Icon as={weatherIcon(d.condition)} size={20} className="text-ink-2" />
              <Text className="font-geist-semibold text-[13px]">{temp(d.max)}</Text>
              <Text className="-mt-1 text-[11px] text-muted">{temp(d.min)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ icon, text }: { icon: Parameters<typeof Icon>[0]['as']; text: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon as={icon} size={14} className="text-muted" />
      <Text className="text-[13px] text-muted">{text}</Text>
    </View>
  );
}

export function AboutPlace({ info, loading }: { info: PlaceInfo | undefined; loading: boolean }) {
  const soft = useShadow('soft');
  if (loading) {
    return (
      <View style={soft} className={panel} accessibilityElementsHidden>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </View>
    );
  }
  const about = info?.about;
  if (!about) return null;
  return (
    <View style={soft} className={panel} accessibilityLabel={`About ${about.title}`}>
      <View className="flex-row items-start gap-4">
        {about.image ? <Image source={{ uri: about.image }} contentFit="cover" style={{ width: 64, height: 64, borderRadius: 16 }} /> : null}
        <View className="min-w-0 flex-1">
          <Text className="font-geist-medium text-[13px] text-muted">About</Text>
          <Text className="font-geist-semibold text-lg tracking-tight">{about.title}</Text>
        </View>
      </View>
      <Text numberOfLines={5} className="mt-3 text-[14px] leading-[22px] text-ink-2">
        {about.extract}
      </Text>
      <Pressable onPress={() => openWeb(about.url)} accessibilityRole="link" className="mt-3 flex-row items-center gap-1">
        <Text className="font-geist-medium text-[13px] text-muted">Read more on Wikipedia</Text>
        <Icon as={ExternalLink} size={14} className="text-muted" />
      </Pressable>
    </View>
  );
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(mins) || mins < 0) return null;
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function PlaceNews({ place, info, loading }: { place: string; info: PlaceInfo | undefined; loading: boolean }) {
  const soft = useShadow('soft');
  const news = (info?.news ?? []).slice(0, 6);
  if (!loading && news.length === 0) return null;
  return (
    <View accessibilityLabel={`News from ${place}`}>
      <View className="mb-4 flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="font-geist-semibold text-xl tracking-tight">Around {place}</Text>
          <Text className="mt-0.5 text-sm text-muted">Latest local news before you go.</Text>
        </View>
        <Icon as={Newspaper} size={20} className="mb-1 text-faint" />
      </View>
      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-64 rounded-[22px]" />
          ))}
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
          {news.map((n) => (
            <Pressable key={n.url} onPress={() => openWeb(n.url)} accessibilityRole="link" style={soft} className="w-64 overflow-hidden rounded-[22px] border border-line bg-surface active:-translate-y-0.5">
              {n.image ? <Image source={{ uri: n.image }} contentFit="cover" style={{ height: 128, width: '100%' }} /> : null}
              <View className="p-4">
                <Text numberOfLines={3} className="font-geist-semibold text-[15px] leading-[20px]">
                  {n.title}
                </Text>
                <View className="mt-3 flex-row items-center gap-1.5">
                  {n.logo ? (
                    <Image source={{ uri: n.logo }} contentFit="contain" style={{ width: 16, height: 16, borderRadius: 4 }} accessibilityIgnoresInvertColors />
                  ) : null}
                  <Text numberOfLines={1} className="flex-shrink font-geist-medium text-xs text-muted">
                    {n.source}
                  </Text>
                  {timeAgo(n.date) ? <Text className="text-xs text-faint">· {timeAgo(n.date)}</Text> : null}
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
