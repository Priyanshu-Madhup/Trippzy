import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoredNote } from '@/utils/noteCache';

const key = (tripId: string) => `trippzy.note.${tripId}`;

/** The last note for a trip, kept on this phone only (with a rounded position, so we can tell whether you've moved). */
export async function readNote(tripId: string): Promise<StoredNote | null> {
  try {
    const raw = await AsyncStorage.getItem(key(tripId));
    return raw ? (JSON.parse(raw) as StoredNote) : null;
  } catch {
    return null;
  }
}

export async function writeNote(tripId: string, value: StoredNote): Promise<void> {
  try {
    await AsyncStorage.setItem(key(tripId), JSON.stringify(value));
  } catch {
    /* a cache that can't be written just means we ask again next time */
  }
}
