import type { PlaceInfo, Profile, ProfilePatch, Stats } from '@/types';
import { apiFetch } from './api';

export const getProfile = () => apiFetch<Profile>('/v1/me');
/** Only the fields you send change; send `null` to clear an optional detail (age, country…). */
export const updateProfile = (patch: ProfilePatch) => apiFetch<Profile>('/v1/me', { method: 'PATCH', body: JSON.stringify(patch) });
export const getStats = () => apiFetch<Stats>('/v1/me/stats');
/** Erases all data on the server, then the Clerk account (Play Store account-deletion requirement). */
export const deleteAccount = () => apiFetch<void>('/v1/me', { method: 'DELETE', timeoutMs: 60_000 });
export const getPlaceInfo = (place: string) => apiFetch<PlaceInfo>(`/v1/place-info?q=${encodeURIComponent(place)}`);
