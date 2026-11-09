import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Maximize2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { getCachedCode } from '@/services/offline';
import { getTicketCode } from '@/services/tickets';
import type { Ticket } from '@/types';

const LABEL: Record<string, string> = { qr: 'QR code', pdf417: 'Barcode', aztec: 'Barcode', datamatrix: 'Barcode', code128: 'Barcode', barcode: 'Barcode' };

/**
 * The QR code / barcode taken from the original document, shown on a white tile (scanners need the
 * contrast, whatever the app theme). The offline copy wins, so it still shows at the gate with no signal.
 */
export function TicketCode({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const { data: uri } = useQuery({
    queryKey: ['ticket-code', ticket.id, ticket.updated_at],
    enabled: ticket.has_code,
    networkMode: 'always', // the cached file needs no network
    staleTime: 5 * 60_000,
    queryFn: async () => (await getCachedCode(ticket)) ?? (await getTicketCode(ticket.id)).url,
  });
  if (!ticket.has_code) return null;
  const kind = LABEL[ticket.code_format ?? 'qr'] ?? 'Code';
  const wide = ticket.code_format !== 'qr' && ticket.code_format !== 'aztec' && ticket.code_format !== 'datamatrix';

  return (
    <View className="mt-4 items-center px-5">
      <Pressable
        onPress={() => uri && setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${kind} for ${ticket.title ?? 'this ticket'}. Tap to enlarge.`}
        className="w-full items-center rounded-2xl border border-line bg-white p-3"
      >
        {uri ? <Image source={{ uri }} contentFit="contain" style={{ width: '100%', height: wide ? 110 : 170 }} accessibilityIgnoresInvertColors /> : <View style={{ height: wide ? 110 : 170 }} />}
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <Icon as={Maximize2} size={12} className="text-[#6b7280]" />
          <Text className="text-[12px] text-[#6b7280]">{kind} · tap to enlarge</Text>
        </View>
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title={kind} description="Hold the screen steady and bright at the scanner.">
        <View className="items-center rounded-2xl bg-white p-4">{uri ? <Image source={{ uri }} contentFit="contain" style={{ width: '100%', aspectRatio: wide ? 2 : 1 }} accessibilityIgnoresInvertColors /> : null}</View>
      </Sheet>
    </View>
  );
}
