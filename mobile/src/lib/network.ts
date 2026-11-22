import { env } from '@/lib/env';

/** True when the Trippzy API answers (any HTTP response counts). A short probe, so "offline" is decided in seconds. */
export async function apiReachable(timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${env.apiUrl}/healthz`, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
