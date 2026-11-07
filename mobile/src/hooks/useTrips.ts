import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import { createTrip, deleteTrip, getTrip, getTrips, updateTrip } from '@/services/trips';
import type { Trip, TripCreate, TripPatch } from '@/types';
import { coverPending } from '@/utils/trips';

export function useTrips() {
  return useQuery({
    queryKey: qk.trips,
    queryFn: getTrips,
    // While a cover photo is being found for a new destination, check back every few seconds.
    refetchInterval: (q) => (q.state.data?.some((t) => coverPending(t)) ? 3000 : false),
  });
}

export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: qk.trip(id ?? ''),
    queryFn: () => getTrip(id as string),
    enabled: !!id,
    // The cover photo is resolved server-side just after creation / a destination change:
    // poll briefly until it lands (the hero shows its gradient meanwhile).
    refetchInterval: (q) => {
      const t = q.state.data;
      const fresh = t && Date.now() - new Date(t.updated_at).getTime() < 30_000;
      return t?.destination && !t.cover_image_url && fresh ? 2500 : false;
    },
  });
}

function useSyncTrip() {
  const qc = useQueryClient();
  return (trip: Trip) => {
    qc.setQueryData(qk.trip(trip.id), trip);
    void qc.invalidateQueries({ queryKey: qk.trips });
  };
}

export function useCreateTrip() {
  const qc = useQueryClient();
  const sync = useSyncTrip();
  return useMutation({
    mutationFn: (input: TripCreate) => createTrip(input),
    onSuccess: (trip) => {
      sync(trip);
      void qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

export function useUpdateTrip() {
  const sync = useSyncTrip();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TripPatch }) => updateTrip(id, patch),
    onSuccess: sync,
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTrip(id),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: qk.trip(id) });
      qc.removeQueries({ queryKey: qk.tickets(id) });
      void qc.invalidateQueries({ queryKey: qk.trips });
      void qc.invalidateQueries({ queryKey: qk.recentTickets });
      void qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}
