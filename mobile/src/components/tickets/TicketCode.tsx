import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Sheet } from '@/components/ui/Sheet';
import { getCachedCode } from '@/services/offline';
import { getTicketCode } from '@/services/tickets';
import type { Ticket } from '@/types';

const LABEL: Record<string, string> = { qr: 'QR code', pdf417: 'Barcode', aztec: 'Barcode', datamatrix: 'Barcode', code128: 'Barcode', barcode: 'Barcode' };
const SQUARE_MAX = 168; // a QR code is shown at a scannable, card-friendly size rather than stretched

/**
 * The QR code / barcode from the original document, exactly as cropped (no extra frame or margin), sitting
 * in the card's own padding. Its white background is part of the image, so it scans in any theme. The
 * offline copy wins, so it still shows at the gate with no signal. Tap to enlarge.
 */
export function TicketCode({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null); // width / height, read from the image itself
  const { data: uri } = useQuery({
    queryKey: ['ticket-code', ticket.id, ticket.updated_at],
    enabled: ticket.has_code,
    networkMode: 'always', // the cached file needs no network
    staleTime: 5 * 60_000,
    queryFn: async () => (await getCachedCode(ticket)) ?? (await getTicketCode(ticket.id)).url,
  });
  if (!ticket.has_code || !uri) return null;
  const kind = LABEL[ticket.code_format ?? 'qr'] ?? 'Code';
  const aspect = ratio ?? 1;
  const squareish = aspect > 0.8 && aspect < 1.25;

  return (
    <View className="mt-4 px-5">
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${kind} for ${ticket.title ?? 'this ticket'}. Tap to enlarge.`}
        className="self-center overflow-hidden rounded-lg"
        style={squareish ? { width: SQUARE_MAX } : { width: '100%' }}
      >
        <Image
          source={{ uri }}
          contentFit="fill"
          onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
          style={{ width: '100%', aspectRatio: aspect, backgroundColor: '#fff' }}
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
