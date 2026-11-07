import { useQuery } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useCallback, useEffect, useState } from 'react';
import { getTripNote } from '@/services/note';

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

/** The "Trippzy note" for a trip: where you are → when to leave for the next flight / train / bus. Never cached to disk. */
export function useTripNote(tripId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['note', tripId],
    enabled: enabled && !!tripId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const L = loc();
      if (!L) throw new Error('Location isn’t available in this version of the app.');
      const c = await currentPosition(L);
      return getTripNote(tripId as string, { lat: c.latitude, lng: c.longitude, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null });
    },
  });
}
