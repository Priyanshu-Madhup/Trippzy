import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { Ticket } from '@/types';
import { CompactTicket } from './CompactTicket';
import { TicketCard } from './TicketCard';
import type { TicketHandlers } from './types';

/** Trippy's compact ticket. Tapping it asks the trip screen to open the full card as a popup. */
export function CollapsibleTicket({
  ticket,
  handlers,
  onToggle,
  index,
  onLayoutY,
}: {
  ticket: Ticket;
  handlers: TicketHandlers;
  onToggle: (id: string, open: boolean) => void;
  index: number;
  /** Reports this card's Y inside the list, so "jump to ticket" can scroll to it. */
  onLayoutY?: (id: string, y: number) => void;
}) {
  // Failed / still-processing tickets are already compact and actionable.
  const collapsible = ticket.processing_status === 'completed';

  return (
    <Animated.View
      entering={FadeIn.delay(Math.min(index, 4) * 30).duration(220)}
      exiting={FadeOut.duration(180)}
      onLayout={(e) => onLayoutY?.(ticket.id, e.nativeEvent.layout.y)}
    >
      {collapsible ? (
        <CompactTicket ticket={ticket} onPress={() => onToggle(ticket.id, true)} onMenu={(anchor) => handlers.onMenu(ticket, anchor)} />
      ) : (
        <TicketCard ticket={ticket} handlers={handlers} />
      )}
    </Animated.View>
  );
}
