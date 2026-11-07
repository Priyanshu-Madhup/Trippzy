import { useEffect } from 'react';
import { syncOfflineTrips } from '@/services/offline';
import type { TripWithStats } from '@/types';

const MIN_INTERVAL_MS = 10 * 60_000;
let lastRun = 0;

/**
 * Keeps upcoming trips' files on the phone (see services/offline). Runs at most every 10 minutes,
 * in the background, and never blocks or errors the UI.
 */
export function useOfflineSync(trips: TripWithStats[] | undefined) {
  const signature = (trips ?? []).map((t) => `${t.id}:${t.tickets.filter((x) => x.processing_status === 'completed').length}`).join('|');
  useEffect(() => {
    if (!trips?.length) return;
    const stale = Date.now() - lastRun > MIN_INTERVAL_MS;
    if (!stale && lastSignature === signature) return;
    lastRun = Date.now();
    lastSignature = signature;
    void syncOfflineTrips(trips);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
}

let lastSignature = '';
