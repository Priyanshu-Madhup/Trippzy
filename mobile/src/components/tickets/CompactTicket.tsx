import { ChevronRight, CircleAlert, Hourglass, RotateCw, Trash2 } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ProviderLogo } from '@/components/common/ProviderLogo';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { Anchor } from '@/components/ui/PopoverMenu';
import { Text } from '@/components/ui/Text';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { FlightData, Ticket } from '@/types';
import { formatShort, formatWeekday } from '@/utils/date';
import { detailsOf, flightJourney, isStale, ticketView } from '@/utils/ticket';
import type { TicketHandlers } from './types';
import { Image } from 'expo-image';

export type { TicketHandlers };

/** Trippy's compact ticket: logo, title, key reference and when. Tap opens the ticket. */
export function CompactTicket({ ticket, onPress, onMenu }: { ticket: Ticket; onPress: () => void; onMenu: (anchor: Anchor) => void }) {
  const soft = useShadow('soft');
  const view = ticketView(ticket);
  const flight = ticket.document_type === 'flight' ? flightJourney(detailsOf<FlightData>(ticket, 'flight')) : null;
  const from = flight?.first.departure?.airport_code;
  const to = flight?.last.arrival?.airport_code;
  const codes = from && to ? `${from} → ${to}` : null;
  const title = codes ?? view.title;
  const leg = ticket.structured_data?.leg;
  const meta = [leg === 'return' ? 'Return' : leg === 'outbound' ? 'Outbound' : null, codes ? view.title : view.meta.label, view.provider && view.provider !== view.title ? view.provider : null]
    .filter(Boolean)
    .join(' · ');

  let logo: ReactNode;
  if (ticket.document_type === 'flight') {
    logo = <ProviderLogo src={ticket.airline_logo_url} name={ticket.airline_name ?? ticket.provider_name} code={ticket.airline_code} size={44} />;
  } else if (ticket.image_url && (ticket.document_type === 'hotel' || ticket.document_type === 'activity')) {
    logo = <Image source={{ uri: ticket.image_url }} contentFit="cover" cachePolicy="disk" style={{ width: 44, height: 44, borderRadius: 12 }} />;
  } else if (ticket.provider_logo_url) {
    logo = <ProviderLogo src={ticket.provider_logo_url} name={ticket.provider_name} size={44} />;
  } else {
    logo = (
      <View className={cn('size-11 items-center justify-center rounded-xl', view.meta.tile)}>
        <Icon as={view.meta.icon} size={20} className={view.meta.text} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={(e) => onMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, width: 0, height: 0 })}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
      style={soft}
      className="flex-row items-center gap-3.5 rounded-card border border-line bg-surface p-3.5 pr-3 active:scale-[0.995]"
    >
      <View>
        {logo}
        {ticket.booking_platform_logo_url ? (
          <View className="absolute -bottom-1 -right-1">
            <ProviderLogo src={ticket.booking_platform_logo_url} name={ticket.booking_platform} size={20} rounded="rounded-full" className="border-2 border-surface" />
          </View>
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="flex-shrink font-geist-semibold text-[15px] tracking-tight">
            {title}
          </Text>
          {ticket.needs_review ? <View accessibilityLabel="Needs a check" className="size-1.5 rounded-full bg-warning" /> : null}
        </View>
        <Text numberOfLines={1} className="text-[13px] text-muted">
          {meta}
          {view.reference ? <Text className="font-geist-mono text-[12px] tracking-wide"> · {view.reference}</Text> : null}
        </Text>
      </View>
      {view.date ? (
        <View className="items-end">
          <Text className="font-geist-semibold text-[13px]">{formatShort(view.date)}</Text>
          <Text className="font-geist-mono text-xs text-muted">{view.time ?? formatWeekday(view.date)}</Text>
        </View>
      ) : null}
      <Icon as={ChevronRight} size={20} className="text-faint" />
    </Pressable>
  );
}

/** "Couldn't read this document." — with Retry / Delete. */
export function FailedTicketCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  const card = useShadow('card');
  return (
    <View style={card} className="rounded-card border border-danger/20 bg-surface p-5">
      <View className="flex-row items-start gap-3">
        <View className="size-11 items-center justify-center rounded-xl bg-danger-bg">
          <Icon as={CircleAlert} size={20} className="text-danger" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-geist-semibold text-[15px]">Couldn’t read this document.</Text>
          <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">
            {ticket.file_name}
          </Text>
          {ticket.error_message && ticket.error_message !== 'Couldn’t read this document.' && ticket.error_message !== "Couldn't read this document." ? (
            <Text className="mt-2 text-[13px] text-muted">{ticket.error_message}</Text>
          ) : null}
        </View>
      </View>
      <View className="mt-5 flex-row flex-wrap gap-2">
        {ticket.has_file ? (
          <Button size="sm" icon={RotateCw} onPress={() => handlers.onRetry(ticket)}>
            Retry
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" icon={Trash2} onPress={() => handlers.onDelete(ticket)}>
          Delete
        </Button>
      </View>
    </View>
  );
}

/** Interrupted or taking too long: offer Retry / Remove. */
export function StaleTicketCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  const card = useShadow('card');
  return (
    <View style={card} accessibilityRole="alert" className="rounded-card border border-line bg-surface p-5">
      <View className="flex-row items-center gap-3">
        <View className="size-11 items-center justify-center rounded-xl bg-surface-2">
          <Icon as={Hourglass} size={20} className="text-muted" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-geist-semibold text-[15px]">This is taking longer than expected</Text>
          <Text numberOfLines={1} className="text-[13px] text-muted">
            {ticket.file_name}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-2">
        <Button size="sm" icon={RotateCw} onPress={() => handlers.onRetry(ticket)}>
          Retry
        </Button>
        <Button size="sm" variant="ghost" onPress={() => handlers.onDelete(ticket)}>
          Remove
        </Button>
      </View>
    </View>
  );
}

export { isStale };
