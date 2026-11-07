import { Plane } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { ProviderLogo } from '@/components/common/ProviderLogo';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { hashHue } from '@/lib/utils';
import type { FlightData, Ticket } from '@/types';
import { formatPass, formatShort, formatWeekday, minutesLabel } from '@/utils/date';
import { detailsOf, flightJourney } from '@/utils/ticket';
import { Detail, Perforation, PlatformBadge, ReviewNotice, TicketShell, type TicketHandlers } from './parts';

export function FlightCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  const data = detailsOf<FlightData>(ticket, 'flight');
  const journey = flightJourney(data);
  const first = journey?.first;
  const last = journey?.last;

  // Columns hold user edits, so they win over the raw extraction.
  const fromCode = first?.departure?.airport_code ?? null;
  const toCode = last?.arrival?.airport_code ?? null;
  const fromCity = ticket.origin ?? first?.departure?.city ?? null;
  const toCity = ticket.destination ?? last?.arrival?.city ?? null;
  const depTime = ticket.start_time ?? first?.departure?.time ?? null;
  const arrTime = ticket.end_time ?? last?.arrival?.time ?? null;
  const depDate = ticket.travel_date ?? first?.departure?.date ?? null;
  const arrDate = last?.arrival?.date ?? null;
  const airline = ticket.airline_name ?? ticket.provider_name ?? data?.airline?.name ?? null;
  const code = ticket.airline_code ?? data?.airline?.iata_code ?? null;

  const flightNumbers = journey?.outbound.map((s) => s.flight_number).filter(Boolean).join(' · ') || null;
  const cabin = first?.cabin_class ?? null;
  const seat = journey?.outbound.map((s) => s.seat).filter(Boolean).join(' · ') || null;
  const terminal = first?.departure?.terminal ?? null;
  const stops = journey?.stops ?? [];
  // Printed duration wins; otherwise the server-computed, time-zone-correct one (never a local-time subtraction).
  const duration = journey?.outbound.length === 1 ? (first?.duration ?? minutesLabel(first?.duration_minutes)) : null;
  const dayShift = depDate && arrDate && arrDate > depDate ? '+1' : null;
  const returnLeg = journey?.inbound[0];

  const hue = hashHue(airline ?? 'flight');
  const accent: [string, string] = [`hsl(${hue}, 55%, 45%)`, `hsl(${(hue + 40) % 360}, 65%, 60%)`];

  return (
    <TicketShell ticket={ticket} handlers={handlers} accent={accent}>
      <View className="flex-row items-start justify-between gap-3 px-5 pt-5">
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <ProviderLogo src={ticket.airline_logo_url} name={airline} code={code} size={44} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-geist-semibold text-[15px]">
              {airline ?? 'Flight'}
            </Text>
            <Text numberOfLines={1} className="text-[13px] text-muted">
              {[flightNumbers, cabin].filter(Boolean).join(' · ') || 'Flight'}
            </Text>
          </View>
        </View>
        <PlatformBadge ticket={ticket} />
      </View>

      <ReviewNotice ticket={ticket} />
      {!journey && ticket.has_file ? (
        <View className="mx-5 mt-4 flex-row items-center justify-between gap-3 rounded-xl bg-warning-bg px-3 py-2.5">
          <Text className="flex-1 text-[13px] text-warning">Some details couldn’t be identified.</Text>
          <Pressable onPress={() => handlers.onRetry(ticket)} accessibilityRole="button" className="rounded-full bg-surface px-3 py-1">
            <Text className="font-geist-semibold text-xs">Re-read with AI</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Route */}
      <View className="mt-6 flex-row items-start gap-2 px-5">
        <Endpoint code={fromCode} city={fromCity} time={depTime} />
        <View className="flex-1 items-center pt-3">
          <View className="w-full flex-row items-center gap-1.5">
            <View className="size-1.5 rounded-full border border-faint" />
            <View className="h-px flex-1 border-t border-dashed border-faint" />
            <View className="size-8 items-center justify-center rounded-full bg-surface-2">
              <View style={{ transform: [{ rotate: '45deg' }] }}>
                <Icon as={Plane} size={16} className="text-ink" />
              </View>
            </View>
            <View className="h-px flex-1 border-t border-dashed border-faint" />
            <View className="size-1.5 rounded-full bg-faint" />
          </View>
          <Text numberOfLines={1} className="mt-2 text-center font-geist-medium text-[11px] text-muted">
            {stops.length ? `${stops.length} stop · ${stops.join(', ')}` : (duration ?? (journey ? 'Direct' : ''))}
          </Text>
        </View>
        <Endpoint code={toCode} city={toCity} time={arrTime} align="right" shift={dayShift} />
      </View>

      <View className="mt-5 flex-row items-center justify-between gap-3 px-5">
        <Text className="font-geist-semibold text-xs tracking-[1.4px]">
          {depDate ? formatPass(depDate) : 'Date not provided'}
          {depDate ? <Text className="font-geist-medium tracking-normal text-muted">{'  '}{formatWeekday(depDate)}</Text> : null}
        </Text>
        {ticket.structured_data?.leg ? (
          <View className="rounded-full bg-surface-2 px-2.5 py-1">
            <Text className="font-geist-semibold text-xs text-ink-2">{ticket.structured_data.leg === 'return' ? 'Return' : 'Outbound'}</Text>
          </View>
        ) : returnLeg ? (
          <View className="rounded-full bg-surface-2 px-2.5 py-1">
            <Text className="font-geist-medium text-xs text-ink-2">
              Return {formatShort(returnLeg.departure?.date)} · {returnLeg.departure?.airport_code ?? ''}→{journey?.inbound.at(-1)?.arrival?.airport_code ?? ''}
            </Text>
          </View>
        ) : null}
      </View>

      <Perforation className="mt-4" />

      <View className="flex-row flex-wrap gap-y-4 px-5 pb-2 pt-1">
        <Detail label="PNR" value={ticket.booking_reference} mono copy={ticket.booking_reference} className="w-2/3" />
        <Detail label="Seat" value={seat} mono className="w-1/3" />
        <Detail label="Class" value={cabin} className="w-1/3" />
        <Detail label="Terminal" value={terminal} className="w-1/3" />
        <Detail label="Flight" value={journey?.outbound.length === 1 ? flightNumbers : null} mono className="w-1/3" />
        <Detail label="Baggage" value={data?.baggage} className="w-1/3" />
      </View>

      {journey && journey.outbound.length + journey.inbound.length > 1 ? (
        <View className="mx-5 mt-3 gap-1.5 rounded-2xl bg-surface-2/70 p-3">
          {[...journey.outbound, ...journey.inbound].map((s, i) => (
            <View key={i} className="flex-row items-center justify-between gap-3">
              <Text numberOfLines={1} className="flex-1 text-[13px]">
                <Text className="font-geist-mono-semibold">{s.flight_number ?? '—'}</Text>
                <Text className="text-muted">
                  {'  '}
                  {s.departure?.airport_code ?? s.departure?.city} {s.departure?.time ?? ''} → {s.arrival?.airport_code ?? s.arrival?.city} {s.arrival?.time ?? ''}
                </Text>
              </Text>
              <Text className="text-xs text-muted">{formatShort(s.departure?.date)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </TicketShell>
  );
}

function Endpoint({ code, city, time, align = 'left', shift }: { code: string | null; city: string | null; time: string | null; align?: 'left' | 'right'; shift?: string | null }) {
  const right = align === 'right';
  return (
    <View className={`w-[28%] min-w-0 ${right ? 'items-end' : 'items-start'}`}>
      <Text className="font-geist-semibold text-[34px] leading-[34px]" style={{ letterSpacing: -1.4 }}>
        {code ?? '—'}
      </Text>
      <Text numberOfLines={1} className={`mt-1.5 text-[13px] text-muted ${right ? 'text-right' : ''}`}>
        {city ?? 'Not provided'}
      </Text>
      {time ? (
        <Text className="mt-2 font-geist-mono-semibold text-lg">
          {time}
          {shift ? <Text className="font-geist-medium text-[10px] text-muted"> {shift}</Text> : null}
        </Text>
      ) : null}
    </View>
  );
}
