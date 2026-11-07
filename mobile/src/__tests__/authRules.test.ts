import { needsEmailCode, PASSWORD_MIN_LENGTH } from '@/features/auth/rules';

describe('auth rules', () => {
  it('matches the minimum password length configured in Clerk', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(15);
  });

  it('recognises the statuses where Clerk wants an emailed code (Device Trust)', () => {
    expect(needsEmailCode('needs_client_trust')).toBe(true);
    expect(needsEmailCode('needs_second_factor')).toBe(true);
    expect(needsEmailCode('complete')).toBe(false);
    expect(needsEmailCode('needs_first_factor')).toBe(false);
    expect(needsEmailCode(null)).toBe(false);
  });
});
