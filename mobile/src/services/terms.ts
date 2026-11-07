import Constants from 'expo-constants';
import type { Profile } from '@/types';
import { apiFetch } from './api';

/** Records, on the server, that this user agreed to the given version of the Terms & Privacy Policy. */
export const acceptTerms = (version: string) =>
  apiFetch<Profile>('/v1/me/terms', { method: 'POST', body: JSON.stringify({ version, app_version: Constants.expoConfig?.version ?? null }) });

/** True when the user has to (re)accept: never agreed, or agreed to an older version. Unknown (not loaded) → false, so we never block on a hiccup. */
export function needsTerms(p: Pick<Profile, 'terms_accepted_version' | 'terms_current_version'> | undefined): boolean {
  if (!p?.terms_current_version) return false;
  return p.terms_accepted_version !== p.terms_current_version;
}
