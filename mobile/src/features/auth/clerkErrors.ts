import { isClerkAPIResponseError } from '@clerk/expo';

/**
 * A sign-in / sign-up that Clerk accepted but did NOT turn into a session — usually because the Clerk
 * instance requires something the app doesn't collect (e.g. a phone number). Say what is missing
 * instead of failing silently.
 */
export function incompleteMessage(attempt: { status?: string | null; missingFields?: string[] } | null | undefined): string {
  const missing = attempt?.missingFields ?? [];
  if (missing.length) {
    const what = missing.map((f) => f.replace(/_/g, ' ')).join(', ');
    return `Your account can’t be created yet: Trippzy’s sign-up setup still requires ${what}. This is a configuration issue, not something you did wrong.`;
  }
  if (attempt?.status && attempt.status !== 'complete') {
    return `We couldn’t finish signing you in (${attempt.status.replace(/_/g, ' ')}). Please try again.`;
  }
  return 'We couldn’t finish signing you in. Please try again.';
}

/** Friendly copy for Clerk errors (same tone as Trippy's `friendlyAuthError`). */
export function friendlyAuthError(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const e = err.errors?.[0];
    switch (e?.code) {
      case 'form_identifier_not_found':
      case 'form_password_incorrect':
        return 'That email and password don’t match.';
      case 'form_identifier_exists':
        return 'An account with this email already exists. Try signing in.';
      case 'form_code_incorrect':
        return 'That code isn’t right. Check it and try again.';
      case 'verification_expired':
        return 'That code has expired. Tap “Resend code” for a new one.';
      case 'form_password_pwned':
        return 'That password has appeared in a data breach. Please choose a different one.';
      // Password rules are configured in Clerk (length, strength…), so show Clerk's own wording — it
      // states the real requirement instead of a number the app might have wrong.
      case 'form_password_length_too_short':
      case 'form_password_size_in_bytes_exceeded':
      case 'form_password_not_strong_enough':
      case 'form_password_validation_failed':
        return e.longMessage ?? e.message ?? 'That password doesn’t meet the requirements.';
      case 'too_many_requests':
        return 'Too many attempts. Please wait a moment and try again.';
      default:
        return e?.longMessage ?? e?.message ?? 'Something went wrong. Please try again.';
    }
  }
  if (err instanceof Error && /cancel/i.test(err.message)) return '';
  return 'Something went wrong. Please try again.';
}
