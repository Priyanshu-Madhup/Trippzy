import { useAuth, useUser } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import { getProfile } from '@/services/account';

export function useProfile() {
  const { isSignedIn } = useAuth();
  return useQuery({ queryKey: qk.profile, queryFn: getProfile, enabled: !!isSignedIn, staleTime: 5 * 60_000 });
}

/** Best display name: profile → Clerk → email local part (same order as Trippy). */
export function useDisplayName(): string {
  const { user } = useUser();
  const { data: profile } = useProfile();
  return profile?.name || user?.fullName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Traveller';
}
