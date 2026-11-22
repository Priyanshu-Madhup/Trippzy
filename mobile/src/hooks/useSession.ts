import { useAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { CACHE_OWNER_KEY } from '@/lib/queryClient';
import { apiReachable } from '@/lib/network';

export type Session = { ready: boolean; signedIn: boolean; offline: boolean };

const CLERK_WAIT_MS = 3000;

/**
 * Clerk needs the network to start up and to refresh a session. With no signal it can stay "not loaded"
 * or report signed-out, which used to lock people out of tickets they had already saved. Someone who was
 * signed in on this phone (the cache owner) keeps their saved trips and tickets until they are really signed out
 * — we only trust "signed out" when the server is actually reachable.
 */
export function useSession(): Session {
  const { isLoaded, isSignedIn } = useAuth();
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  const [waited, setWaited] = useState(false);
  const [reachable, setReachable] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(CACHE_OWNER_KEY).then((v) => live && setOwner(v));
    const t = setTimeout(() => live && setWaited(true), CLERK_WAIT_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);

  const clerkSaysOut = isLoaded && !isSignedIn;
  useEffect(() => {
    if (!clerkSaysOut || !owner) return;
    let live = true;
    void apiReachable().then((ok) => live && setReachable(ok));
    return () => {
      live = false;
    };
  }, [clerkSaysOut, owner]);

  if (isLoaded && isSignedIn) return { ready: true, signedIn: true, offline: false };
  if (owner === undefined) return { ready: false, signedIn: false, offline: false };
  if (!owner) return { ready: isLoaded, signedIn: false, offline: false };
  if (!isLoaded) return waited ? { ready: true, signedIn: true, offline: true } : { ready: false, signedIn: false, offline: false };
  // Loaded, but signed out while we hold a saved account: only believe it once the server can be reached.
  if (reachable === undefined) return { ready: false, signedIn: false, offline: false };
  return reachable ? { ready: true, signedIn: false, offline: false } : { ready: true, signedIn: true, offline: true };
}
