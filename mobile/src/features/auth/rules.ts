/**
 * Must match Clerk Dashboard → Configure → User & authentication → Password → "Minimum password length".
 * Clerk is the authority (it rejects shorter passwords whatever the app says); this only lets the form
 * explain the rule before a round trip. If you change it in Clerk, change it here.
 */
export const PASSWORD_MIN_LENGTH = 15;

/** Sign-in statuses that mean "Clerk wants an email code before it will start a session" (new-device check). */
export function needsEmailCode(status: string | null | undefined): boolean {
  return status === 'needs_client_trust' || status === 'needs_second_factor';
}
