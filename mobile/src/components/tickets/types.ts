import type { Anchor } from '@/components/ui/PopoverMenu';
import type { Ticket } from '@/types';

export interface TicketHandlers {
  onOpen: (t: Ticket) => void;
  /** Open the ⋯ menu as a small popover under `anchor`. */
  onMenu: (t: Ticket, anchor: Anchor) => void;
  onEdit: (t: Ticket) => void;
  onCalendar: (t: Ticket) => void;
  onRetry: (t: Ticket) => void;
  onDelete: (t: Ticket) => void;
  /** When set, the card shows a "collapse" control (used by the expandable list). */
  onCollapse?: (t: Ticket) => void;
}
