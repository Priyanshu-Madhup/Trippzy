import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { ArrowRight, CalendarPlus, ChevronUp, Copy, Ellipsis, Info, Pencil, type LucideIcon } from 'lucide-react-native';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { toast } from 'sonner-native';
import { ProviderLogo } from '@/components/common/ProviderLogo';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import type { Ticket } from '@/types';
import { TicketCode } from './TicketCode';
import type { TicketHandlers } from './types';

export type { TicketHandlers };

/** Label / value pair. Renders nothing when the value is missing — we never show invented data. */
export function Detail({
  label,
  value,
  mono,
  copy,
  className = 'w-1/2',
}: {
  label: string;
  value: ReactNode | null | undefined;
  mono?: boolean;
  copy?: string | null;
  /** Width class: w-1/3, w-1/2, w-2/3, w-full … */
  className?: string;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View className={cn('min-w-0 pr-3', className)}>
      <Text className="text-[11px] font-geist-medium uppercase tracking-[1.1px] text-faint">{label}</Text>
      <View className="mt-1 flex-row items-center gap-1.5">
        <Text numberOfLines={mono ? 1 : 2} className={cn('flex-shrink', mono ? 'font-geist-mono-semibold text-[14px] tracking-[0.6px]' : 'font-geist-semibold text-[15px]')}>
          {value}
        </Text>
        {copy ? <CopyButton value={copy} label={label} /> : null}
      </View>
    </View>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Pressable
      onPress={() => {
        void Clipboard.setStringAsync(value)
          .then(() => toast.success(`${label} copied`))
          .catch(() => toast.error('Couldn’t copy'));
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      className="size-6 items-center justify-center rounded-md active:bg-surface-2"
    >
      <Icon as={Copy} size={14} className="text-faint" />
    </Pressable>
  );
}

/** Dotted tear line with notches, boarding-pass style. */
export function Perforation({ className }: { className?: string }) {
  return (
    <View className={cn('relative my-1 h-6', className)} accessibilityElementsHidden>
      <View className="absolute -left-3 top-0 size-6 rounded-full border border-line bg-bg" />
      <View className="absolute -right-3 top-0 size-6 rounded-full border border-line bg-bg" />
      <View className="absolute inset-x-5 top-1/2 border-t border-dashed border-line-strong" />
    </View>
  );
}

export function PlatformBadge({ ticket, tone = 'default' }: { ticket: Ticket; tone?: 'default' | 'glass' }) {
  if (!ticket.booking_platform) return null;
  return (
    <View
      accessibilityLabel={`Booked via ${ticket.booking_platform}`}
      className={cn('max-w-[150px] flex-row items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5', tone === 'glass' ? 'bg-white/90' : 'bg-surface-2')}
    >
      <ProviderLogo src={ticket.booking_platform_logo_url} name={ticket.booking_platform} size={20} rounded="rounded-full" />
      <Text numberOfLines={1} className={cn('flex-shrink font-geist-medium text-xs', tone === 'glass' ? 'text-[#111]' : 'text-ink-2')}>
        {ticket.booking_platform}
      </Text>
    </View>
  );
}

export function ReviewNotice({ ticket }: { ticket: Ticket }) {
  if (!ticket.needs_review) return null;
  return (
    <View className="mx-5 mt-4 flex-row items-center gap-2 rounded-xl bg-warning-bg px-3 py-2">
      <Icon as={Info} size={16} className="text-warning" />
      <Text className="flex-1 text-[13px] text-warning">Please verify these details.</Text>
    </View>
  );
}

function ActionPill({ label, a11y, icon, onPress, disabled }: { label: string; a11y: string; icon: LucideIcon; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      className={cn('h-9 flex-row items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 active:bg-surface-2', disabled && 'opacity-40')}
    >
      <Icon as={icon} size={14} className="text-ink" />
      <Text className="font-geist-semibold text-[13px]">{label}</Text>
    </Pressable>
  );
}

/**
 * Common card frame: accent bar, notes, and (inside the card) collapse + the ⋯ menu; then a dashed "tray"
 * tucked under the card holding the three quick actions (Open · Calendar · Edit).
 */
export function TicketShell({
  ticket,
  handlers,
  children,
  accent,
  openLabel = 'Open ticket',
}: {
  ticket: Ticket;
  handlers: TicketHandlers;
  children: ReactNode;
  /** Two gradient colours for the 4px top bar (flight cards). */
  accent?: [string, string];
  openLabel?: string;
}) {
  const card = useShadow('card');
  const dots = useRef<ComponentRef<typeof View>>(null);
  return (
    <Animated.View entering={FadeIn.duration(250)} accessibilityLabel={ticket.title ?? ticket.file_name ?? 'Ticket'}>
      <View style={card} className="z-10 overflow-hidden rounded-card border border-line bg-surface">
        {accent ? <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 4 }} /> : null}
        {children}
        <TicketCode ticket={ticket} />

        {ticket.notes ? (
          <View className="mx-5 mb-1 mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
            <Text className="text-[13px] leading-[19px] text-ink-2">{ticket.notes}</Text>
          </View>
        ) : null}

        {/* Inside the card: collapse + the ⋯ menu (re-read with AI, delete). */}
        <View className="flex-row items-center justify-end px-3 pb-3 pt-1">
          {handlers.onCollapse ? (
            <Pressable onPress={() => handlers.onCollapse?.(ticket)} accessibilityRole="button" accessibilityLabel="Collapse ticket" className="size-10 items-center justify-center rounded-full active:bg-surface-2">
              <Icon as={ChevronUp} size={18} className="text-muted" />
            </Pressable>
          ) : null}
          <Pressable
            ref={dots}
            onPress={() => dots.current?.measureInWindow((x, y, width, height) => handlers.onMenu(ticket, { x, y, width, height }))}
            accessibilityRole="button"
            accessibilityLabel="More actions"
            className="size-10 items-center justify-center rounded-full active:bg-surface-2"
          >
            <Icon as={Ellipsis} size={18} className="text-muted" />
          </Pressable>
        </View>
      </View>

      {/* The tray starts underneath the card (its top edge is hidden behind it), so the dashed outline reads as a continuation. */}
      <View className="-mt-8 mx-3 flex-row items-center justify-between gap-1.5 rounded-[26px] border border-dashed border-line-strong px-3 pb-3 pt-11">
        <ActionPill label="Open" a11y={openLabel} icon={ArrowRight} disabled={!ticket.has_file} onPress={() => handlers.onOpen(ticket)} />
        <ActionPill label="Calendar" a11y="Add a reminder to your calendar" icon={CalendarPlus} onPress={() => handlers.onCalendar(ticket)} />
        <ActionPill label="Edit" a11y="Edit details" icon={Pencil} onPress={() => handlers.onEdit(ticket)} />
      </View>
    </Animated.View>
  );
}
