import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, MapPin } from 'lucide-react-native';
import { View } from 'react-native';
import { DestinationImage } from '@/components/common/DestinationImage';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { cn, plural } from '@/lib/utils';
import type { ActivityData, RestaurantData, Ticket } from '@/types';
import { formatFull } from '@/utils/date';
import { detailsOf, TYPE_META } from '@/utils/ticket';
import { Detail, PlatformBadge, ReviewNotice, TicketShell, type TicketHandlers } from './parts';

/** Activities, attractions, events and restaurant reservations. */
export function ReservationCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  const kind = ticket.document_type === 'restaurant' ? 'restaurant' : 'activity';
  const meta = TYPE_META[kind];
  const activity = kind === 'activity' ? detailsOf<ActivityData>(ticket, 'activity') : null;
  const restaurant = kind === 'restaurant' ? detailsOf<RestaurantData>(ticket, 'restaurant') : null;

  const title = ticket.title ?? activity?.name ?? restaurant?.name ?? meta.label;
  const venue = activity?.venue && activity.venue !== title ? activity.venue : null;
  const address = activity?.address ?? restaurant?.address ?? null;
  const city = ticket.destination ?? activity?.city ?? restaurant?.city ?? null;
  const date = ticket.travel_date;
  const time = [ticket.start_time, ticket.end_time].filter(Boolean).join(' – ');

  return (
    <TicketShell ticket={ticket} handlers={handlers} openLabel={kind === 'restaurant' ? 'Open reservation' : 'Open ticket'}>
      {ticket.image_url ? (
        <DestinationImage src={ticket.image_url} seed={city ?? title} style={{ aspectRatio: 2 }}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)']} style={{ position: 'absolute', inset: 0 }} />
        </DestinationImage>
      ) : null}

      <View className="flex-row items-start justify-between gap-3 px-5 pt-5">
        <View className="min-w-0 flex-1 flex-row items-start gap-3">
          <View className={cn('size-11 items-center justify-center rounded-xl', meta.tile)}>
            <Icon as={meta.icon} size={20} className={meta.text} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-geist-medium text-xs text-muted">{meta.label}</Text>
            <Text className="font-geist-semibold text-[17px] leading-[22px] tracking-tight">{title}</Text>
            {venue || city ? (
              <View className="mt-1 flex-row items-center gap-1.5">
                <Icon as={MapPin} size={14} className="text-muted" />
                <Text numberOfLines={1} className="flex-1 text-[13px] text-muted">
                  {[venue, city].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <PlatformBadge ticket={ticket} />
      </View>

      <ReviewNotice ticket={ticket} />

      {date || time ? (
        <View className="mx-5 mt-4 flex-row items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-3">
          <Icon as={CalendarDays} size={20} className="text-muted" />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
              {date ? formatFull(date) : 'Date not provided'}
            </Text>
            {time ? <Text className="font-geist-mono text-[13px] text-muted">{time}</Text> : null}
          </View>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-y-4 px-5 pb-1 pt-4">
        <Detail label="Reference" value={ticket.booking_reference} mono copy={ticket.booking_reference} />
        <Detail
          label={kind === 'restaurant' ? 'Party' : 'Tickets'}
          value={restaurant?.party_size ? plural(restaurant.party_size, 'guest') : activity?.ticket_count ? plural(activity.ticket_count, 'ticket') : null}
        />
      </View>
      {address ? <Text className="px-5 pt-3 text-[13px] leading-[20px] text-muted">{address}</Text> : null}
    </TicketShell>
  );
}
