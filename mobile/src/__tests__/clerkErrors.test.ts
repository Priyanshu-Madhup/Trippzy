import { incompleteMessage } from '@/features/auth/clerkErrors';

describe('incompleteMessage', () => {
  it('names what the Clerk instance still requires (the silent phone-number failure)', () => {
    const msg = incompleteMessage({ status: 'missing_requirements', missingFields: ['phone_number'] });
    expect(msg).toContain('phone number');
    expect(msg).toMatch(/configuration/i);
  });

  it('lists several missing fields readably', () => {
    expect(incompleteMessage({ missingFields: ['phone_number', 'username'] })).toContain('phone number, username');
  });

  it('explains an unfinished sign-in by its status', () => {
    expect(incompleteMessage({ status: 'needs_second_factor' })).toContain('needs second factor');
  });

  it('falls back to a generic retry message', () => {
    expect(incompleteMessage(null)).toBe('We couldn’t finish signing you in. Please try again.');
    expect(incompleteMessage({ status: 'complete' })).toBe('We couldn’t finish signing you in. Please try again.');
  });
});
