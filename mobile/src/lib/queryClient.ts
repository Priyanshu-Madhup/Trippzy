import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

const DAY = 24 * 60 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Must be >= the persister's maxAge, or restored data is garbage-collected immediately.
      gcTime: 7 * DAY,
      refetchOnWindowFocus: false,
      retry: 1,
      // Show cached trips/tickets when there's no signal instead of pausing silently.
      networkMode: 'offlineFirst',
    },
  },
});

/** Lightweight local cache (decision: online-first, light caching) — lets lists open instantly and offline. */
export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'trippzy.query-cache', throttleTime: 1500 });
export const PERSIST_MAX_AGE = 7 * DAY;

/** Only the user's own trip data is persisted — never signed URLs or third-party place info. */
export const persistedRoots = new Set(['trips', 'tickets', 'profile', 'stats']);

/** Centralised query keys so invalidation stays consistent (same as Trippy). */
export const qk = {
  trips: ['trips'] as const,
  trip: (id: string) => ['trips', id] as const,
  tickets: (tripId: string) => ['tickets', 'trip', tripId] as const,
  recentTickets: ['tickets', 'recent'] as const,
  profile: ['profile'] as const,
  stats: ['stats'] as const,
  placeInfo: (place: string) => ['place-info', place.toLowerCase()] as const,
};

export const CACHE_OWNER_KEY = 'trippzy.cache-owner';
