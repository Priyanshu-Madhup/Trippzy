import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Download, FileWarning, LoaderCircle, Minus, Plus, WifiOff, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { getCachedAssets, cacheTicket } from '@/services/offline';
import { getFileUrl, getPdfPages, getTicket } from '@/services/tickets';
import type { Ticket } from '@/types';

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];
const DEFAULT_ZOOM = 2; // index → 100% = fit to screen width

interface Assets {
  kind: 'pdf' | 'image';
  uris: string[];
  offline: boolean;
}

/** Looks the ticket up in the cached trip lists first, so the viewer opens instantly (and offline). */
function useTicket(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['tickets', 'one', id],
    queryFn: () => getTicket(id as string),
    enabled: !!id,
    initialData: () => {
      for (const [, list] of qc.getQueriesData<Ticket[]>({ queryKey: ['tickets', 'trip'] })) {
        const hit = list?.find((t) => t.id === id);
        if (hit) return hit;
      }
      return undefined;
    },
  });
}

async function loadAssets(ticket: Ticket): Promise<Assets> {
  const cached = await getCachedAssets(ticket);
  if (cached) return cached.kind === 'pdf' ? { kind: 'pdf', uris: cached.pages, offline: true } : { kind: 'image', uris: [cached.uri], offline: true };
  const assets: Assets =
    ticket.file_type === 'pdf'
      ? { kind: 'pdf', uris: (await getPdfPages(ticket.id)).pages, offline: false }
      : { kind: 'image', uris: [(await getFileUrl(ticket.id)).url], offline: false };
  void cacheTicket(ticket); // keep a copy for next time (and for the airport)
  return assets;
}

export default function Viewer() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM);
  const [sharing, setSharing] = useState(false);

  const { data: ticket } = useTicket(ticketId);
  const { data: assets, isLoading, error } = useQuery({
    queryKey: ['viewer-assets', ticketId],
    queryFn: () => loadAssets(ticket as Ticket),
    enabled: !!ticket?.has_file,
    staleTime: 0,
    gcTime: 0,
  });

  const zoom = ZOOMS[zoomIndex];
  const contentWidth = Math.round(width * zoom);

  async function share() {
    if (!ticket || sharing) return;
    setSharing(true);
    try {
      const { url } = await getFileUrl(ticket.id, true);
      const name = (ticket.file_name ?? 'ticket').replace(/[^\w.\- ]+/g, '_');
      const dest = `${cacheDirectory}${name}`;
      await downloadAsync(url, dest);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(dest, { mimeType: ticket.mime_type ?? undefined, dialogTitle: name });
      else toast.error('Sharing isn’t available on this device.');
    } catch {
      toast.error('Couldn’t download this file. You need a connection for that.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#111' }}>
      <View className="flex-row items-center gap-1.5 px-2 pb-2" style={{ paddingTop: insets.top + 8, backgroundColor: 'rgba(17,17,17,0.95)' }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" className="size-10 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
          <Icon as={X} size={18} className="text-white" />
        </Pressable>
        <View className="min-w-0 flex-1 pl-1.5">
          <Text numberOfLines={1} className="font-geist-semibold text-sm text-white">
            {ticket?.title ?? ticket?.file_name ?? 'Document'}
          </Text>
          <View className="flex-row items-center gap-1">
            {assets?.offline ? <Icon as={WifiOff} size={11} className="text-white/55" /> : null}
            <Text numberOfLines={1} className="text-xs text-white/55">
              {assets?.offline ? 'Saved on this phone · ' : ''}
              {ticket?.file_name}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center rounded-full bg-white/10 p-0.5">
          <ZoomButton label="Zoom out" icon={Minus} disabled={zoomIndex === 0} onPress={() => setZoomIndex((i) => Math.max(0, i - 1))} />
          <Text className="w-11 text-center font-geist-mono text-xs text-white">{Math.round(zoom * 100)}%</Text>
          <ZoomButton label="Zoom in" icon={Plus} disabled={zoomIndex === ZOOMS.length - 1} onPress={() => setZoomIndex((i) => Math.min(ZOOMS.length - 1, i + 1))} />
        </View>
        <Pressable onPress={share} disabled={sharing} accessibilityRole="button" accessibilityLabel="Download or share" className="size-10 items-center justify-center rounded-full active:bg-white/10">
          {sharing ? <ActivityIndicator size="small" color="#fff" /> : <Icon as={Download} size={18} className="text-white" />}
        </Pressable>
      </View>

      <View className="flex-1" style={{ backgroundColor: '#1a1a1a' }}>
        {isLoading || (!ticket && !error) ? (
          <View className="flex-1 items-center p-8">
            <Skeleton className="mt-8 h-[70%] w-[90%] rounded-2xl opacity-20" />
          </View>
        ) : error || !assets ? (
          <ViewerError message={error instanceof Error ? error.message : 'Please try again.'} />
        ) : (
          <ScrollView nestedScrollEnabled contentContainerStyle={{ paddingVertical: 16, paddingBottom: insets.bottom + 24 }}>
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: Math.max(contentWidth, width) }}>
              <View style={{ width: contentWidth, alignSelf: 'center' }} className="gap-3 px-3">
                {assets.uris.map((uri, i) => (
                  <PageImage key={uri} uri={uri} label={assets.kind === 'pdf' ? `Page ${i + 1}` : (ticket?.title ?? 'Ticket')} />
                ))}
                {assets.kind === 'pdf' ? <Text className="pb-2 text-center text-xs text-white/40">{assets.uris.length === 1 ? '1 page' : `${assets.uris.length} pages`}</Text> : null}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function ZoomButton({ label, icon, disabled, onPress }: { label: string; icon: typeof Plus; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} className={`size-8 items-center justify-center rounded-full active:bg-white/10 ${disabled ? 'opacity-40' : ''}`}>
      <Icon as={icon} size={16} className="text-white" />
    </Pressable>
  );
}

/** One page / photo at the full width of its container, keeping its own aspect ratio. */
function PageImage({ uri, label }: { uri: string; label: string }) {
  const [ratio, setRatio] = useState(0.707); // A4 until the real size is known
  const [loading, setLoading] = useState(true);
  return (
    <View className="overflow-hidden rounded-md bg-white" style={{ width: '100%', aspectRatio: ratio }}>
      <Image
        source={{ uri }}
        contentFit="contain"
        cachePolicy="disk"
        accessibilityLabel={label}
        onLoad={(e) => {
          setLoading(false);
          if (e.source.width && e.source.height) setRatio(e.source.width / e.source.height);
        }}
        style={{ width: '100%', height: '100%' }}
      />
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <Icon as={LoaderCircle} size={20} className="text-black/30" />
        </View>
      ) : null}
    </View>
  );
}

function ViewerError({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <Icon as={FileWarning} size={40} className="text-white/50" />
      <Text className="mt-3 font-geist-semibold text-white">This file couldn’t be opened.</Text>
      <Text className="mt-1 text-center text-sm text-white/60">{message}</Text>
    </View>
  );
}
