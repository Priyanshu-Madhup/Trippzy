import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { fetchLatest, type AppVersion } from '@/services/appUpdate';

/** The last answer from the server, shared by the update screen and the Settings row. */
let latest: AppVersion | null = null;
let checkedAt = 0;
let inFlight: Promise<AppVersion | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function checkNow(): Promise<AppVersion | null> {
  inFlight ??= fetchLatest()
    .then((v) => {
      if (v) {
        latest = v;
        checkedAt = Date.now();
        emit();
      }
      return v;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Checks when the app opens and again each time it comes back to the foreground (at most every 15 minutes). */
export function useAppUpdate() {
  const info = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => latest,
  );
  useEffect(() => {
    void checkNow();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - checkedAt > 15 * 60_000) void checkNow();
    });
    return () => sub.remove();
  }, []);
  const recheck = useCallback(() => checkNow(), []);
  return { info, recheck };
}
