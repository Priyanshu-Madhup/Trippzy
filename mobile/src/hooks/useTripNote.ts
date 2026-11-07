import { useQuery } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTickets } from '@/hooks/useTickets';
import { getTripNote } from '@/services/note';
import { readNote, writeNote } from '@/services/noteStore';
import type { TripNote } from '@/types';
import { canReuse, ticketSignature } from '@/utils/noteCache';

type LocationApi = typeof import('expo-location');
let loaded: LocationApi | null | undefined;

/** expo-location needs native code; builds made before it was added don't have it, so load it only if present. */
function loc(): LocationApi | null {
  if (loaded === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = requireOptionalNativeModule('ExpoLocation') ? (require('expo-location') as LocationApi) : null;
  }
  return loaded;
}

export type LocationAccess = 'unavailable' | 'checking' | 'ask' | 'granted' | 'blocked';

/** Foreground ("while using the app") location permission only. */
export function useLocationAccess() {
  const [status, setStatus] = useState<LocationAccess>(() => (loc() ? 'checking' : 'unavailable'));

  const apply = useCallback((p: { granted: boolean; canAskAgain: boolean }) => setStatus(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked'), []);

  useEffect(() => {
    const L = loc();
    if (!L) return;
    void L.getForegroundPermissionsAsync().then(apply, () => setStatus('ask'));
  }, [apply]);

  const request = useCallback(async () => {
    const L = loc();
    if (!L) return;
    apply(await L.requestForegroundPermissionsAsync());
  }, [apply]);

  return { status, request };
}

async function currentPosition(L: LocationApi) {
  const fresh = L.getCurrentPositionAsync({ accuracy: L.Accuracy.Balanced });
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 12_000));
  const pos = (await Promise.race([fresh, timeout])) ?? (await L.getLastKnownPositionAsync());
  if (!pos) throw new Error('Couldn’t find your location. Check that location is on and try again.');
  return pos.coords;
}

/**
 * The "Trippzy note" for a trip: where you are → when to leave for the next flight / train / bus.
 * We only ask the server (which pays for traffic + AI) when something changed: a ticket was added or edited,
 * you've moved about a kilometre, or the note has aged out (sooner the closer the departure is).
 * Otherwise the last note is shown straight away from this phone. Refresh forces a re-check.
 */
export function useTripNote(tripId: string | undefined, enabled: boolean) {
  const { data: tickets } = useTickets(tripId);
  const sig = useMemo(() => ticketSignature(tickets), [tickets]);
  const force = useRef(false);
  const [saved, setSaved] = useState<TripNote | null>(null);

  // Show the last note instantly (if the tickets haven't changed since), while any re-check runs in the background.
  useEffect(() => {
    let live = true;
    setSaved(null);
    if (tripId) void readNote(tripId).then((s) => live && s?.sig === sig && setSaved(s.note));
    return () => {
      live = false;
    };
  }, [tripId, sig]);

  const q = useQuery({
    queryKey: ['note', tripId, sig],
    enabled: enabled && !!tripId && !!tickets,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const L = loc();
      if (!L) throw new Error('Location isn’t available in this version of the app.');
      const id = tripId as string;
      const forced = force.current;
      force.current = false;
      const stored = forced ? null : await readNote(id);

      // Cheapest path: nothing changed and the phone's last known position is still nearby → no GPS fix, no server call.
      if (stored) {
        const last = await L.getLastKnownPositionAsync().catch(() => null);
        if (last && canReuse(stored, sig, { lat: last.coords.latitude, lng: last.coords.longitude }, Date.now())) return stored.note;
      }
      const c = await currentPosition(L);
      const here = { lat: Number(c.latitude.toFixed(3)), lng: Number(c.longitude.toFixed(3)) };
      if (canReuse(stored, sig, here, Date.now())) return stored.note;

      const note = await getTripNote(id, { lat: c.latitude, lng: c.longitude, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, refresh: forced });
      await writeNote(id, { note, sig, ...here, at: Date.now() });
      return note;
    },
  });

  const data = q.data ?? saved ?? undefined;
  return {
    data,
    isLoading: !data && q.isLoading,
    isError: !data && q.isError,
    error: q.error,
    isFetching: q.isFetching,
    /** Re-check now (the server won't re-bill more than once a minute). */
    refresh: () => {
      force.current = true;
      return q.refetch();
    },
  };
}
