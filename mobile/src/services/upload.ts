import { completeUpload, createUpload, deleteTicket } from './tickets';
import type { Ticket } from '@/types';

export const ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export function validateFile(f: PickedFile): string | null {
  if (!(ACCEPTED_MIME as readonly string[]).includes(f.mimeType)) return `${f.name} isn’t a PDF, PNG, JPG or WEBP file.`;
  if (f.size > MAX_FILE_BYTES) return `${f.name} is larger than 20 MB.`;
  if (f.size === 0) return `${f.name} is empty.`;
  return null;
}

/**
 * Upload a file straight to R2 through the presigned URL the API issued (the file never passes
 * through our servers). Reports real progress, like Trippy's XHR upload.
 */
export async function putToStorage(
  target: { url: string; headers: Record<string, string> },
  fileUri: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  // Read the file as a Blob (works for picker/camera cache URIs in Expo Go and in real builds, unlike the
  // native upload task which can reject them as "not readable"), then PUT it with XHR for upload progress.
  const blob = await (await fetch(fileUri)).blob();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && e.total > 0 && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.ontimeout = xhr.onerror;
    xhr.send(blob);
  });
  onProgress?.(1);
}

/** create → PUT → complete. If the transfer fails, the half-created ticket is removed again. */
export async function uploadTicket(
  tripId: string,
  file: PickedFile,
  onProgress?: (fraction: number) => void,
  onTicket?: (ticketId: string) => void,
): Promise<Ticket> {
  const { ticket, upload } = await createUpload(tripId, { file_name: file.name, mime_type: file.mimeType, size: file.size });
  onTicket?.(ticket.id);
  try {
    await putToStorage(upload, file.uri, onProgress);
  } catch (err) {
    await deleteTicket(ticket.id).catch(() => undefined);
    throw err;
  }
  return completeUpload(ticket.id); // the server now reads it in the background
}
