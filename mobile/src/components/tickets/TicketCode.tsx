import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { FileWarning } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { getCachedCode } from '@/services/offline';
import { getTicketCode } from '@/services/tickets';
import type { Ticket } from '@/types';

const LABEL: Record<string, string> = { qr: 'QR code', pdf417: 'Barcode', aztec: 'Barcode', datamatrix: 'Barcode', code128: 'Barcode', barcode: 'Barcode' };
const RATIOS = new Map<string, number>();
const SQUARE_MAX = 148; // a QR code is shown at a scannable, card-friendly size rather than stretched

/**
 * The QR code / barcode from the original document, exactly as cropped (no extra frame or margin), sitting
 * in the card's own padding. Its white background is part of the image, so it scans in any theme. The
 * offline copy wins, so it still shows at the gate with no signal. Tap to enlarge.
 */
export function TicketCode({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  // width / height, read from the image itself. Remembered across collapse/expand (the card remounts), so the
  // code never flashes as a white square while it re-measures.
  const [ratio, setRatioState] = useState<number | null>(RATIOS.get(ticket.id) ?? null);
  const setRatio = (r: number) => {
    RATIOS.set(ticket.id, r);
    setRatioState(r);
  };
  const { data: uri } = useQuery({
    queryKey: ['ticket-code', ticket.id, ticket.updated_at],
    enabled: ticket.has_code,
    networkMode: 'always', // the cached file needs no network
    staleTime: 5 * 60_000,
    queryFn: async () => (await getCachedCode(ticket)) ?? (await getTicketCode(ticket.id)).url,
  });
  // A photo or screenshot of a boarding-type ticket with no readable code: say so, and what to do about it.
  if (!ticket.has_code && ticket.file_type === 'image' && ['flight', 'train', 'bus'].includes(ticket.document_type)) {
    return (
      <View className="mx-5 mt-4 flex-row items-start gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3">
        <Icon as={FileWarning} size={16} className="mt-0.5 text-muted" />
        <Text className="flex-1 text-[13px] leading-[19px] text-ink-2">The QR code or barcode in this picture is too blurry to extract. Upload the original PDF to get it on this card.</Text>
      </View>
    );
  }
  if (!ticket.has_code || !uri) return null;
  const kind = LABEL[ticket.code_format ?? 'qr'] ?? 'Code';
  const aspect = ratio ?? 1;
  const squareish = aspect > 0.8 && aspect < 1.25;
  // Until the real shape is known, keep it invisible and flat so no white box shows.
  const measuring = ratio === null;

  return (
    <View className="mt-3 px-5">
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${kind} for ${ticket.title ?? 'this ticket'}. Tap to enlarge.`}
        className="self-center overflow-hidden rounded-lg"
        style={[squareish ? { width: SQUARE_MAX } : { width: '100%' }, measuring ? { height: 1, opacity: 0 } : null]}
      >
        <Image
          source={{ uri }}
          contentFit="fill"
          onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
          style={{ width: '100%', aspectRatio: aspect }}
          accessibilityIgnoresInvertColors
        />
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title={kind} description="Hold the screen steady and bright at the scanner.">
        <View className="overflow-hidden rounded-xl bg-white p-4">
          <Image source={{ uri }} contentFit="contain" style={{ width: '100%', aspectRatio: aspect, backgroundColor: '#fff' }} accessibilityIgnoresInvertColors />
        </View>
      </Sheet>
    </View>
  );
}
