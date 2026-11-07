import type { Ticket } from '@/types';
import { FailedTicketCard, StaleTicketCard } from './CompactTicket';
import { FlightCard } from './FlightCard';
import { GenericDocumentCard } from './GenericDocumentCard';
import { HotelCard } from './HotelCard';
import { ReservationCard } from './ReservationCard';
import { BusCard, TrainCard } from './TransitCard';
import type { TicketHandlers } from './types';

/** Picks the right card for a ticket's status and document type. */
export function TicketCard({ ticket, handlers }: { ticket: Ticket; handlers: TicketHandlers }) {
  if (ticket.processing_status === 'failed') return <FailedTicketCard ticket={ticket} handlers={handlers} />;
  if (ticket.processing_status !== 'completed') return <StaleTicketCard ticket={ticket} handlers={handlers} />;

  switch (ticket.document_type) {
    case 'flight':
      return <FlightCard ticket={ticket} handlers={handlers} />;
    case 'hotel':
      return <HotelCard ticket={ticket} handlers={handlers} />;
    case 'train':
      return <TrainCard ticket={ticket} handlers={handlers} />;
    case 'bus':
      return <BusCard ticket={ticket} handlers={handlers} />;
    case 'restaurant':
    case 'activity':
      return <ReservationCard ticket={ticket} handlers={handlers} />;
    default:
      return <GenericDocumentCard ticket={ticket} handlers={handlers} />;
  }
}

export type { TicketHandlers };
