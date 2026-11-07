import { getInfoAsync } from 'expo-file-system/legacy';
import type { ShareIntentFile } from 'expo-share-intent';
import { ACCEPTED_MIME, type PickedFile } from './upload';

/** Files handed over by another app's Share sheet, waiting for the user to choose a trip. */
let pending: PickedFile[] = [];
const listeners = new Set<() => void>();

export const pendingShare = {
  get: () => pending,
  set(files: PickedFile[]) {
    pending = files;
    listeners.forEach((l) => l());
  },
  clear() {
    this.set([]);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

const EXT_MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Normalise shared files into upload-ready ones. Anything that isn't a PDF / PNG / JPG / WEBP is skipped. */
export async function toPickedFiles(files: ShareIntentFile[]): Promise<{ files: PickedFile[]; skipped: number }> {
  const out: PickedFile[] = [];
  let skipped = 0;
  for (const f of files) {
    const uri = f.path.startsWith('/') ? `file://${f.path}` : f.path;
    const name = f.fileName || uri.split('/').pop() || 'document';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = (ACCEPTED_MIME as readonly string[]).includes(f.mimeType) ? f.mimeType : (EXT_MIME[ext] ?? f.mimeType);
    if (!(ACCEPTED_MIME as readonly string[]).includes(mimeType)) {
      skipped++;
      continue;
    }
    let size = f.size ?? 0;
    if (!size) {
      try {
        const info = await getInfoAsync(uri);
        size = info.exists && 'size' in info ? info.size : 0;
      } catch {
        /* validateFile reports an unreadable / empty file */
      }
    }
    out.push({ uri, name, mimeType, size });
  }
  return { files: out, skipped };
}
