import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { Ticket } from '@/types';
import { planCalendarEvent } from '@/utils/reminder';

const EVENTS_KEY = 'trippzy.calendar.events'; // { [ticketId]: eventId }
const CALENDAR_KEY = 'trippzy.calendar.id';
export const AUTO_KEY = 'trippzy.calendar.auto';
const CALENDAR_NAME = 'Trippzy';

// SDK 58's main entry point throws on the id-based functions used here; they live in the /legacy entry.
type CalendarApi = typeof import('expo-calendar/legacy');
let loaded: CalendarApi | null | undefined;

/** expo-calendar needs native code. Builds made before it was added don't have it: report that instead of crashing. */
function cal(): CalendarApi | null {
  if (loaded === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = requireOptionalNativeModule('ExpoCalendar') ? (require('expo-calendar/legacy') as CalendarApi) : null;
  }
  return loaded;
}
export let lastCalendarError = '';
export const calendarAvailable = () => cal() !== null;

export type AddResult = 'added' | 'updated' | 'denied' | 'no_date' | 'unavailable' | 'failed';

async function readMap(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(EVENTS_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export async function getAutoAdd(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTO_KEY)) === '1';
}
export async function setAutoAdd(on: boolean): Promise<void> {
  await AsyncStorage.setItem(AUTO_KEY, on ? '1' : '0');
}

/** Ask for calendar access (a no-op when already granted). */
export async function ensureCalendarAccess(): Promise<boolean> {
  const Calendar = cal();
  if (!Calendar) return false;
  const cur = await Calendar.getCalendarPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

/** A dedicated "Trippzy" calendar, so the user can hide or delete every reminder in one place. */
async function trippzyCalendarId(Calendar: CalendarApi): Promise<string> {
  const saved = await AsyncStorage.getItem(CALENDAR_KEY);
  const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (saved && all.some((c) => c.id === saved)) return saved;
  const existing = all.find((c) => c.title === CALENDAR_NAME && c.allowsModifications);
  if (existing) {
    await AsyncStorage.setItem(CALENDAR_KEY, existing.id);
    return existing.id;
  }
  const id =
    Platform.OS === 'android'
      ? await Calendar.createCalendarAsync({
          title: CALENDAR_NAME,
          name: CALENDAR_NAME,
          color: '#E9A23B',
          entityType: Calendar.EntityTypes.EVENT,
          source: { isLocalAccount: true, name: CALENDAR_NAME, type: Calendar.SourceType.LOCAL },
          accessLevel: Calendar.CalendarAccessLevel.OWNER,
          ownerAccount: CALENDAR_NAME,
          isVisible: true,
          isSynced: false,
        })
      : (all.find((c) => c.allowsModifications)?.id ?? '');
  if (!id) throw new Error('No writable calendar on this phone.');
  await AsyncStorage.setItem(CALENDAR_KEY, id);
  return id;
}

/** Create (or refresh) the calendar event + alert for a ticket. Safe to call repeatedly. */
export async function addTicketToCalendar(ticket: Ticket): Promise<AddResult> {
  const plan = planCalendarEvent(ticket);
  if (!plan) return 'no_date';
  const Calendar = cal();
  if (!Calendar) return 'unavailable';
  try {
    if (!(await ensureCalendarAccess())) return 'denied';
    const calendarId = await trippzyCalendarId(Calendar);
    const details = {
      title: plan.title,
      notes: plan.notes,
      location: plan.location ?? undefined,
      startDate: plan.start,
      endDate: plan.end,
      allDay: plan.allDay,
      timeZone: plan.timeZone ?? undefined,
      alarms: [{ relativeOffset: -plan.alertMinutes, method: Calendar.AlarmMethod.ALERT }],
    };
    const map = await readMap();
    const existing = map[ticket.id];
    if (existing) {
      try {
        await Calendar.updateEventAsync(existing, details);
        return 'updated';
      } catch {
        /* the user deleted it from their calendar → create a fresh one below */
      }
    }
    map[ticket.id] = await Calendar.createEventAsync(calendarId, details);
    await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(map));
    return 'added';
  } catch (e) {
    lastCalendarError = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn('[calendar]', lastCalendarError);
    return 'failed';
  }
}

export async function removeTicketFromCalendar(ticketId: string): Promise<void> {
  const map = await readMap();
  const id = map[ticketId];
  const Calendar = cal();
  if (!id || !Calendar) return;
  try {
    if ((await Calendar.getCalendarPermissionsAsync()).granted) await Calendar.deleteEventAsync(id);
  } catch {
    /* already gone */
  }
  delete map[ticketId];
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(map));
}
