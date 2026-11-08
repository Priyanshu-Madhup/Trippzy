import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import type { Ticket } from '@/types';
import { CompactTicket } from './CompactTicket';
import { TicketCard } from './TicketCard';
import type { TicketHandlers } from './types';

/**
 * Trippy's compact ticket that expands downward into the full card. The container's layout
 * animates (spring) as its content swaps, so opening/closing feels like the card grows or folds.
 */
export function CollapsibleTicket({
  ticket,
  handlers,
  expanded,
  onToggle,
  index,
  onLayoutY,
}: {
  ticket: Ticket;
  handlers: TicketHandlers;
  expanded: boolean;
  onToggle: (id: string, open: boolean) => void;
  index: number;
  /** Reports this card's Y inside the list, so "jump to ticket" can scroll to it. */
  onLayoutY?: (id: string, y: number) => void;
}) {
  // Failed / still-processing tickets are already compact and actionable.
  const collapsible = ticket.processing_status === 'completed';

  return (
    <Animated.View
      layout={LinearTransition.springify().stiffness(320).damping(34).mass(0.9)}
      entering={FadeIn.delay(Math.min(index, 4) * 30).duration(220)}
      exiting={FadeOut.duration(180)}
      onLayout={(e) => onLayoutY?.(ticket.id, e.nativeEvent.layout.y)}
    >
      {collapsible ? (
        expanded ? (
          <TicketCard ticket={ticket} handlers={{ ...handlers, onCollapse: () => onToggle(ticket.id, false) }} />
        ) : (
          <CompactTicket ticket={ticket} onPress={() => onToggle(ticket.id, true)} onMenu={(anchor) => handlers.onMenu(ticket, anchor)} />
        )
      ) : (
        <TicketCard ticket={ticket} handlers={handlers} />
      )}
    </Animated.View>
  );
}
