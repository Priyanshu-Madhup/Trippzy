import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import { deleteTicket, getAllTickets, getDocuments, getRecentTickets, getTickets, reprocessTicket, updateTicket } from '@/services/tickets';
import { getStats } from '@/services/account';
import type { Ticket, TicketPatch } from '@/types';
import { isStale } from '@/utils/ticket';

export function useTickets(tripId: string | undefined) {
  return useQuery({
    queryKey: qk.tickets(tripId ?? ''),
    queryFn: () => getTickets(tripId as string),
    enabled: !!tripId,
    // Processing runs on the server (it survives the app being closed), so the app just
    // watches progress. Stale tickets stop being polled — they show a Retry card instead.
    refetchInterval: (q) =>
      q.state.data?.some((t) => (t.processing_status === 'processing' || t.processing_status === 'uploaded') && !isStale(t)) ? 2000 : false,
  });
}

export const useRecentTickets = (limit = 6) => useQuery({ queryKey: qk.recentTickets, queryFn: () => getRecentTickets(limit) });
export const useAllTickets = () => useQuery({ queryKey: qk.allTickets, queryFn: getAllTickets });
export const useDocuments = () => useQuery({ queryKey: qk.documents, queryFn: getDocuments });
export const useStats = () => useQuery({ queryKey: qk.stats, queryFn: getStats });

export function useInvalidateTripData() {
  const qc = useQueryClient();
  return (tripId: string) => {
    void qc.invalidateQueries({ queryKey: qk.tickets(tripId) });
    void qc.invalidateQueries({ queryKey: qk.trip(tripId) });
    void qc.invalidateQueries({ queryKey: qk.trips });
    void qc.invalidateQueries({ queryKey: qk.recentTickets });
    void qc.invalidateQueries({ queryKey: qk.allTickets });
    void qc.invalidateQueries({ queryKey: qk.documents });
    void qc.invalidateQueries({ queryKey: qk.stats });
  };
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTripData();
  return useMutation({
    mutationFn: ({ ticket, patch }: { ticket: Ticket; patch: TicketPatch }) => updateTicket(ticket.id, patch),
    onSuccess: (updated) => {
      qc.setQueryData<Ticket[]>(qk.tickets(updated.trip_id), (list) => list?.map((t) => (t.id === updated.id ? updated : t)));
      // Edited dates / places can change the trip itself (the server re-derives it in the background).
      setTimeout(() => invalidate(updated.trip_id), 1500);
    },
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTripData();
  return useMutation({
    mutationFn: (ticket: Ticket) => deleteTicket(ticket.id),
    onMutate: async (ticket) => {
      await qc.cancelQueries({ queryKey: qk.tickets(ticket.trip_id) });
      const previous = qc.getQueryData<Ticket[]>(qk.tickets(ticket.trip_id));
      qc.setQueryData<Ticket[]>(qk.tickets(ticket.trip_id), (list) => list?.filter((t) => t.id !== ticket.id));
      return { previous };
    },
    onError: (_err, ticket, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.tickets(ticket.trip_id), ctx.previous);
    },
    onSuccess: (_v, ticket) => setTimeout(() => invalidate(ticket.trip_id), 1500),
  });
}

export function useRetryTicket() {
  const invalidate = useInvalidateTripData();
  return useMutation({
    mutationFn: (ticket: Ticket) => reprocessTicket(ticket.id),
    onSuccess: (_job, ticket) => invalidate(ticket.trip_id),
  });
}
