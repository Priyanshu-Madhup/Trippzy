import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import { getPlaceInfo } from '@/services/account';

/** Weather, news and an overview for a destination (cached 15 min; retried soon if a source was down). */
export function usePlaceInfo(place: string | null | undefined) {
  return useQuery({
    queryKey: qk.placeInfo(place ?? ''),
    queryFn: () => getPlaceInfo(place as string),
    enabled: !!place,
    staleTime: (q) => (q.state.data?.weather && q.state.data.news.length ? 15 * 60_000 : 30_000),
    gcTime: 60 * 60_000,
    retry: 1,
  });
}
