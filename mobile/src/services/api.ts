import { env } from '@/lib/env';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;

/** Wired up once by <AuthBridge/> so services can attach the Clerk session token. */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

const TIMEOUT_MS = 30_000;

/** Calls the Trippzy API with the user's Clerk session token (same contract as Trippy's apiFetch). */
export async function apiFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError(0, 'network', 'You appear to be offline.');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (e.g. a platform error page) */
  }

  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, b.error ?? 'error', b.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}
