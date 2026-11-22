import { View } from 'react-native';
import { ProviderLogo } from '@/components/common/ProviderLogo';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { cn, hashHue } from '@/lib/utils';
import type { BusData, Ticket, TrainData } from '@/types';
import { durationLabel, formatPass, formatWeekday } from '@/utils/date';
import { detailsOf, TYPE_META } from '@/utils/ticket';
import { Detail, PassengerRow, Perforation, PlatformBadge, ReviewNotice, TicketShell, type TicketHandlers } from './parts';

const stationLine = (e?: { station?: string | null; station_code?: string | null } | null) =>
  e?.station ? (e.station_code && !e.station.includes(e.station_code) ? `${e.station} (${e.station_code})` : e.station) : null;

/** Shared layout for ground transport (same-time-zone, so local times can be subtracted safely). */
function TransitCard({ ticket, handlers, kind, data }: { ticket: Ticket; handlers: TicketHandlers; kind: 'train' | 'bus'; data: TrainData | BusData | null }) {
  const meta = TYPE_META[kind];
  const train = kind === 'train' ? (data as TrainData | null) : null;
  const bus = kind === 'bus' ? (data as BusData | null) : null;

  const operator = ticket.provider_name ?? data?.operator?.name ?? null;
  const service = train ? [train.train_name, train.train_number].filter(Boolean).join(' · ') : (bus?.bus_type ?? null);
  const from = ticket.origin ?? data?.departure?.city ?? data?.departure?.station ?? null;
  const to = ticket.destination ?? data?.arrival?.city ?? data?.arrival?.station ?? null;
  const depTime = ticket.start_time ?? data?.departure?.time ?? null;
  const arrTime = ticket.end_time ?? data?.arrival?.time ?? null;
  const depDate = ticket.travel_date ?? data?.departure?.date ?? null;
  const arrDate = ticket.end_date ?? data?.arrival?.date ?? null;
  const duration = durationLabel(depDate, depTime, arrDate, arrTime);
  const overnight = !!depDate && !!arrDate && arrDate > depDate;

  const hue = hashHue(operator ?? service ?? kind);
  const accent: [string, string] = [`hsl(${hue}, 55%, 45%)`, `hsl(${(hue + 40) % 360}, 65%, 60%)`];

  return (
    <TicketShell ticket={ticket} handlers={handlers} accent={accent}>
      <View className="flex-row items-start justify-between gap-3 px-5 pt-5">
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          {ticket.provider_logo_url ? (
            <ProviderLogo src={ticket.provider_logo_url} name={operator} size={44} />
          ) : (
            <View className={cn('size-11 items-center justify-center rounded-xl', meta.tile)}>
              <Icon as={meta.icon} size={20} className={meta.text} />
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
              {operator ?? meta.label}
            </Text>
            <Text numberOfLines={1} className="text-[13px] text-muted">
              {service || meta.label}
            </Text>
          </View>
        </View>
        <PlatformBadge ticket={ticket} />
      </View>

      <ReviewNotice ticket={ticket} />

      <View className="mt-5 flex-row items-start gap-3 px-5">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-geist-semibold text-[22px] leading-[26px]" style={{ letterSpacing: -0.55 }}>
            {from ?? '—'}
          </Text>
          <Text numberOfLines={1} className="mt-1 text-[13px] text-muted">
            {data?.departure?.station ?? ' '}
          </Text>
          {depTime ? <Text className="mt-2 font-geist-mono-semibold text-lg">{depTime}</Text> : null}
        </View>
        <View className="w-[26%] items-center pt-1.5">
          <View className="w-full flex-row items-center gap-1.5">
            <View className="size-1.5 rounded-full border border-faint" />
            <View className="h-px flex-1 border-t border-dashed border-faint" />
            <View className="size-8 items-center justify-center rounded-full bg-surface-2">
              <Icon as={meta.icon} size={16} className="text-ink" />
            </View>
            <View className="h-px flex-1 border-t border-dashed border-faint" />
            <View className="size-1.5 rounded-full bg-faint" />
          </View>
          {duration ? <Text className="mt-1.5 font-geist-medium text-[11px] text-muted">{duration}</Text> : null}
        </View>
        <View className="min-w-0 flex-1 items-end">
          <Text numberOfLines={1} className="text-right font-geist-semibold text-[22px] leading-[26px]" style={{ letterSpacing: -0.55 }}>
            {to ?? '—'}
          </Text>
          <Text numberOfLines={1} className="mt-1 text-right text-[13px] text-muted">
            {data?.arrival?.station ?? ' '}
          </Text>
          {arrTime ? (
            <Text className="mt-2 font-geist-mono-semibold text-lg">
              {arrTime}
              {overnight ? <Text className="font-geist-medium text-[10px] text-muted"> +1</Text> : null}
            </Text>
          ) : null}
        </View>
      </View>

      <Text className="mt-4 px-5 font-geist-semibold text-xs tracking-[1.4px]">
        {depDate ? formatPass(depDate) : 'Date not provided'}
        {depDate ? <Text className="font-geist-medium tracking-normal text-muted">{'  '}{formatWeekday(depDate)}</Text> : null}
      </Text>

      <Perforation className="mt-4" />

      <View className="flex-row px-5 pt-1">
        <Detail label={kind === 'train' ? 'PNR' : 'Ticket'} value={ticket.booking_reference} mono copy={ticket.booking_reference} className="flex-[1.75]" />
        <Detail label="Seat" value={data?.seat} mono className="flex-1" />
        {train ? <Detail label="Coach" value={train.coach} mono className="flex-1" /> : null}
        {train ? <Detail label="Berth" value={train.berth} className="flex-1" /> : null}
      </View>
      <View className="mt-4 gap-4 px-5 pb-2">
        {train ? (
          <View className="flex-row">
            <Detail label="Class" value={train.travel_class} className="flex-[1.75]" />
            <Detail label="Train no." value={train.train_number} mono className="flex-1" />
            <Detail label="Platform" value={train.departure?.platform} mono className="flex-1" />
          </View>
        ) : null}
        {train ? <Detail label="Boarding station" value={stationLine(train.departure)} className="w-full" /> : null}
        {bus ? <Detail label="Boarding point" value={bus.departure?.station} className="w-full" /> : null}
        {bus ? <Detail label="Dropping point" value={bus.arrival?.station} className="w-full" /> : null}
        <PassengerRow names={data?.passengers} />
      </View>
    </TicketShell>
  );
}

export function TrainCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  return <TransitCard ticket={ticket} handlers={handlers} kind="train" data={detailsOf<TrainData>(ticket, 'train')} />;
}

export function BusCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  return <TransitCard ticket={ticket} handlers={handlers} kind="bus" data={detailsOf<BusData>(ticket, 'bus')} />;
}
