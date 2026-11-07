import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { env } from '@/lib/env';
import { releaseNotes } from '@/utils/releaseNotes';

export { releaseNotes };

export interface AppVersion {
  latest: string | null;
  update_available: boolean;
  notes: string;
  published_at: string | null;
  size: number | null;
  download_url: string | null;
}

const SEEN_KEY = 'trippzy.update.seenVersion';
export const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

/** Asks our server for the newest release. Public endpoint; fails quietly (offline, server down, no release yet). */
export async function fetchLatest(): Promise<AppVersion | null> {
  if (!env.apiUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${env.apiUrl}/v1/app/latest?current=${encodeURIComponent(currentVersion)}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as AppVersion;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The version whose "What's new" the user has already seen. Null on a fresh install. */
export const getSeenVersion = () => AsyncStorage.getItem(SEEN_KEY);
export const markSeen = (v: string) => AsyncStorage.setItem(SEEN_KEY, v);

/** Hands the APK to the phone's downloader; Android then offers to install it. */
export function startUpdate(v: AppVersion) {
  if (v.download_url) void Linking.openURL(v.download_url);
}

export function formatSize(bytes: number | null): string {
  return bytes ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : '';
}
