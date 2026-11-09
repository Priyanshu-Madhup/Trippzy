/**
 * Offline copies of tickets for upcoming trips (decision: "cache files for upcoming trips").
 * A boarding pass or hotel confirmation must open with no signal at the airport. Files live in the
 * app's private storage, keyed by document id (a round-trip PDF backs two tickets but is stored once),
 * and are wiped on sign-out and when a trip is over.
 */
import { deleteAsync, documentDirectory, downloadAsync, getInfoAsync, makeDirectoryAsync, readAsStringAsync, readDirectoryAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import type { Ticket, TripWithStats } from '@/types';
import { upcomingTrips } from '@/utils/trips';
import { getFileUrl, getPdfPages, getTicketCode, getTickets } from './tickets';

const ROOT = `${documentDirectory ?? ''}offline/`;
const MAX_TRIPS = 3;
const MAX_FILES = 40;

export type CachedAssets = { kind: 'pdf'; pages: string[] } | { kind: 'image'; uri: string };

const dirFor = (documentId: string) => `${ROOT}${documentId}/`;
const extFor = (ticket: Ticket) => (ticket.mime_type === 'image/png' ? 'png' : ticket.mime_type === 'image/webp' ? 'webp' : 'jpg');

async function exists(uri: string): Promise<boolean> {
  try {
    return (await getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

/** Local files for a ticket, or null when they aren't (completely) cached. */
export async function getCachedAssets(ticket: Ticket): Promise<CachedAssets | null> {
  if (!ticket.document_id || !documentDirectory) return null;
  const dir = dirFor(ticket.document_id);
  try {
    const manifest = JSON.parse(await readAsStringAsync(`${dir}manifest.json`)) as { kind: 'pdf' | 'image'; pages?: number; file?: string };
    if (manifest.kind === 'pdf') {
      const pages = Array.from({ length: manifest.pages ?? 0 }, (_, i) => `${dir}page-${i + 1}.webp`);
      return pages.length && (await Promise.all(pages.map(exists))).every(Boolean) ? { kind: 'pdf', pages } : null;
    }
    const uri = `${dir}${manifest.file ?? 'original.jpg'}`;
    return (await exists(uri)) ? { kind: 'image', uri } : null;
  } catch {
    return null;
  }
}

const codeFile = (ticket: Ticket) => `${dirFor(ticket.document_id ?? '')}code-${ticket.id}.png`;

/** Local copy of a ticket's QR code / barcode, or null. It must scan at a gate with no signal. */
export async function getCachedCode(ticket: Ticket): Promise<string | null> {
  if (!ticket.has_code || !ticket.document_id || !documentDirectory) return null;
  const uri = codeFile(ticket);
  return (await exists(uri)) ? uri : null;
}

/** Download a ticket's code image if it isn't cached yet. Returns true when cached. */
export async function cacheCode(ticket: Ticket): Promise<boolean> {
  if (!ticket.has_code || !ticket.document_id || !documentDirectory) return false;
  if (await getCachedCode(ticket)) return true;
  try {
    await makeDirectoryAsync(dirFor(ticket.document_id), { intermediates: true });
    const { url } = await getTicketCode(ticket.id);
    await downloadAsync(url, codeFile(ticket));
    return true;
  } catch {
    await deleteAsync(codeFile(ticket), { idempotent: true }).catch(() => undefined);
    return false;
  }
}

/** Download a ticket's files if they aren't cached yet. Safe to call repeatedly. Returns true when cached. */
export async function cacheTicket(ticket: Ticket): Promise<boolean> {
  if (!ticket.has_file || !ticket.document_id || !documentDirectory) return false;
  if (await getCachedAssets(ticket)) {
    await cacheCode(ticket);
    return true;
  }
  const dir = dirFor(ticket.document_id);
  try {
    await makeDirectoryAsync(dir, { intermediates: true });
    if (ticket.file_type === 'pdf') {
      const { pages } = await getPdfPages(ticket.id);
      if (!pages.length) return false;
      await Promise.all(pages.map((url, i) => downloadAsync(url, `${dir}page-${i + 1}.webp`)));
      await writeAsStringAsync(`${dir}manifest.json`, JSON.stringify({ kind: 'pdf', pages: pages.length }));
    } else {
      const { url } = await getFileUrl(ticket.id);
      const file = `original.${extFor(ticket)}`;
      await downloadAsync(url, `${dir}${file}`);
      await writeAsStringAsync(`${dir}manifest.json`, JSON.stringify({ kind: 'image', file }));
    }
    await cacheCode(ticket); // best effort: a missing code never invalidates the cached file
    return true;
  } catch {
    await deleteAsync(dir, { idempotent: true }).catch(() => undefined); // never leave a half-downloaded folder
    return false;
  }
}

/** The trips worth having offline: not yet finished, soonest first. */
export function upcomingForOffline(trips: TripWithStats[]): TripWithStats[] {
  return upcomingTrips(trips).slice(0, MAX_TRIPS);
}

let syncing = false;

/**
 * Background sync: cache the files of upcoming trips, and drop cached files that no longer belong to one.
 * Failures (e.g. no connection) are silent — the next run picks up where this left off.
 */
export async function syncOfflineTrips(trips: TripWithStats[]): Promise<{ cached: number; removed: number }> {
  if (syncing || !documentDirectory) return { cached: 0, removed: 0 };
  syncing = true;
  try {
    const keep = new Set<string>();
    let cached = 0;
    let budget = MAX_FILES;
    for (const trip of upcomingForOffline(trips)) {
      const tickets = (await getTickets(trip.id).catch(() => [])) as Ticket[];
      for (const t of tickets) {
        if (t.processing_status !== 'completed' || !t.has_file || !t.document_id) continue;
        keep.add(t.document_id);
        if (budget <= 0) continue;
        budget--;
        if (!(await getCachedAssets(t)) && (await cacheTicket(t))) cached++;
        else await cacheCode(t); // files were cached before this ticket had a code
      }
    }
    return { cached, removed: await prune(keep) };
  } catch {
    return { cached: 0, removed: 0 };
  } finally {
    syncing = false;
  }
}

async function prune(keep: Set<string>): Promise<number> {
  try {
    if (!(await exists(ROOT))) return 0;
    const dirs = await readDirectoryAsync(ROOT);
    let removed = 0;
    for (const d of dirs) {
      if (!keep.has(d)) {
        await deleteAsync(`${ROOT}${d}`, { idempotent: true });
        removed++;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Remove every offline file (sign-out, account deletion). */
export async function clearOffline(): Promise<void> {
  if (documentDirectory) await deleteAsync(ROOT, { idempotent: true }).catch(() => undefined);
}
