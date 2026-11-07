import type { Ticket } from '@/types';
import { planCalendarEvent, wallClockToInstant } from '../reminder';

const base = {
  id: 't1',
  trip_id: 'trip',
  user_id: 'u',
  document_type: 'train',
  processing_status: 'completed',
  title: 'Ranchi → Bokaro',
  provider_name: 'Indian Railways',
  booking_reference: '6952181317',
  origin: 'Ranchi',
  destination: 'Bokaro',
  travel_date: '2026-11-10',
  start_time: '13:45',
  end_date: '2026-11-10',
  end_time: '15:45',
  structured_data: null,
  user_edits: [],
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
} as unknown as Ticket;

describe('wallClockToInstant', () => {
  it('converts a wall-clock time in a zone to the right instant', () => {
    expect(wallClockToInstant('2026-11-10', '09:20', 'Asia/Kolkata')?.toISOString()).toBe('2026-11-10T03:50:00.000Z');
    expect(wallClockToInstant('2026-07-01', '12:00', 'Europe/London')?.toISOString()).toBe('2026-07-01T11:00:00.000Z');
  });
  it('rejects malformed input', () => {
    expect(wallClockToInstant('nope', '09:20', null)).toBeNull();
  });
});

describe('planCalendarEvent', () => {
  it('uses the AI wording and lead time when present', () => {
    const t = { ...base, structured_data: { reminder: { title: 'Train to Bokaro at 13:45', body: 'Coach C6, seat 50.', lead_minutes: 75 } } } as unknown as Ticket;
    const p = planCalendarEvent(t)!;
    expect(p.title).toBe('Train to Bokaro at 13:45');
    expect(p.notes).toContain('Coach C6, seat 50.');
    expect(p.alertMinutes).toBe(75);
    expect(p.allDay).toBe(false);
  });

  it('falls back to a plain title and a default lead time', () => {
    const p = planCalendarEvent(base)!;
    expect(p.title).toMatch(/Train/);
    expect(p.alertMinutes).toBe(90);
    expect(p.notes).toContain('Ref 6952181317');
  });

  it('makes an all-day event with an evening-before alert when there is no time', () => {
    const p = planCalendarEvent({ ...base, start_time: null, end_time: null })!;
    expect(p.allDay).toBe(true);
    expect(p.alertMinutes).toBe(900);
  });

  it('returns null without a date', () => {
    expect(planCalendarEvent({ ...base, travel_date: null })).toBeNull();
  });
});
