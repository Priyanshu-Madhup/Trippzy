import { LinearGradient } from 'expo-linear-gradient';
import { BedDouble, MapPin, Moon } from 'lucide-react-native';
import { View } from 'react-native';
import { DestinationImage } from '@/components/common/DestinationImage';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { plural } from '@/lib/utils';
import type { HotelData, Ticket } from '@/types';
import { daysBetween, formatShort, formatWeekday } from '@/utils/date';
import { detailsOf } from '@/utils/ticket';
import { Detail, PlatformBadge, ReviewNotice, TicketShell, type TicketHandlers } from './parts';

export function HotelCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  const data = detailsOf<HotelData>(ticket, 'hotel');
  const name = ticket.title ?? ticket.provider_name ?? data?.hotel?.name ?? 'Hotel stay';
  const city = ticket.destination ?? data?.hotel?.city ?? null;
  const country = data?.hotel?.country ?? ticket.structured_data?.primary_location?.country ?? null;
  const checkIn = ticket.travel_date ?? data?.check_in?.date ?? null;
  const checkOut = ticket.end_date ?? data?.check_out?.date ?? null;
  const nights = data?.nights ?? (daysBetween(checkIn, checkOut) || null);

  return (
    <TicketShell ticket={ticket} handlers={handlers} openLabel="Open booking">
      <DestinationImage src={ticket.image_url} seed={city ?? name} style={{ aspectRatio: 16 / 9 }}>
        <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} locations={[0, 0.5, 1]} style={{ position: 'absolute', inset: 0 }} />
        <View className="absolute left-4 top-4 flex-row items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1">
          <Icon as={BedDouble} size={14} className="text-[#111]" />
          <Text className="font-geist-semibold text-xs text-[#111]">Hotel</Text>
        </View>
        <View className="absolute right-4 top-4">
          <PlatformBadge ticket={ticket} tone="glass" />
        </View>
      </DestinationImage>

      <View className="px-5 pt-4">
        <Text className="font-geist-semibold text-lg leading-[23px] tracking-tight">{name}</Text>
        {city || country ? (
          <View className="mt-1 flex-row items-center gap-1.5">
            <Icon as={MapPin} size={14} className="text-muted" />
            <Text numberOfLines={1} className="flex-1 text-sm text-muted">
              {[city, country].filter(Boolean).join(', ')}
            </Text>
          </View>
        ) : null}
      </View>

      <ReviewNotice ticket={ticket} />

      <View className="mx-5 mt-4 flex-row items-center gap-3 rounded-2xl bg-surface-2/70 p-4">
        <Stay label="Check-in" date={checkIn} time={ticket.start_time ?? data?.check_in?.time ?? null} />
        <View className="items-center">
          <View className="h-px w-8 bg-line-strong" />
          {nights ? (
            <View className="mt-1.5 flex-row items-center gap-1">
              <Icon as={Moon} size={12} className="text-muted" />
              <Text className="font-geist-medium text-xs text-muted">{plural(nights, 'night')}</Text>
            </View>
          ) : null}
        </View>
        <Stay label="Check-out" date={checkOut} time={ticket.end_time ?? data?.check_out?.time ?? null} align="right" />
      </View>

      <View className="flex-row flex-wrap gap-y-4 px-5 pb-1 pt-4">
        <Detail label="Confirmation" value={ticket.booking_reference} mono copy={ticket.booking_reference} className="w-full" />
        <Detail label="Room" value={data?.room_type} />
        <Detail label="Guests" value={data?.guests ? plural(data.guests, 'guest') : null} />
      </View>
      {data?.hotel?.address ? <Text className="px-5 pt-3 text-[13px] leading-[20px] text-muted">{data.hotel.address}</Text> : null}
    </TicketShell>
  );
}

function Stay({ label, date, time, align }: { label: string; date: string | null; time: string | null; align?: 'right' }) {
  return (
    <View className={`flex-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <Text className="font-geist-medium text-[11px] uppercase tracking-[1.1px] text-faint">{label}</Text>
      <Text className="mt-1 font-geist-semibold text-[17px] tracking-tight">{date ? formatShort(date) : '—'}</Text>
      <Text className="text-xs text-muted">{[date ? formatWeekday(date) : null, time ? `${align === 'right' ? 'until' : 'from'} ${time}` : null].filter(Boolean).join(' · ')}</Text>
    </View>
  );
}
