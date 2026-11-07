import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner-native';
import { randomUUID } from 'expo-crypto';
import { useInvalidateTripData } from './useTickets';
import { ApiError } from '@/services/api';
import { uploadTicket, validateFile, type PickedFile } from '@/services/upload';

/**
 * Client-side phases only. Once the server has the file, reading it (reading → identifying →
 * extracting → building) happens in the background and shows up on the ticket row itself —
 * so closing the app mid-way never strands a ticket (unlike Trippy's browser-driven pipeline).
 */
export type UploadStage = 'queued' | 'uploading' | 'handoff' | 'failed';

export interface UploadItem {
  key: string;
  tripId: string;
  ticketId: string | null;
  fileName: string;
  fileSize: number;
  stage: UploadStage;
  progress: number;
  error: string | null;
}

interface UploadContextValue {
  items: UploadItem[];
  enqueue: (tripId: string, files: PickedFile[]) => void;
  dismiss: (key: string) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);
// One file at a time, in the order they were picked: a bulk upload is a proper queue, and the phone's connection isn't split
// across several big files (each one finishes, then the server starts reading it while the next one uploads).
const CONCURRENCY = 1;

function friendly(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'You appear to be offline. Retry when you’re connected.';
    if (err.status === 401) return 'Your session expired — sign in again and retry.';
    if (err.status === 429) return 'Too many uploads at once — wait a moment and retry.';
    return err.message;
  }
  return err instanceof Error && err.message ? err.message : 'Upload failed.';
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const invalidate = useInvalidateTripData();
  const [items, setItems] = useState<UploadItem[]>([]);
  const queue = useRef<{ key: string; tripId: string; file: PickedFile }[]>([]);
  const running = useRef(0);

  const patch = useCallback((key: string, p: Partial<UploadItem>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...p } : i))), []);
  const remove = useCallback((key: string, delay = 0) => setTimeout(() => setItems((l) => l.filter((i) => i.key !== key)), delay), []);

  const run = useCallback(
    async (job: { key: string; tripId: string; file: PickedFile }) => {
      try {
        patch(job.key, { stage: 'uploading', progress: 0 });
        await uploadTicket(
          job.tripId,
          job.file,
          (progress) => patch(job.key, { progress }),
          (ticketId) => patch(job.key, { ticketId }),
        );
        patch(job.key, { stage: 'handoff', progress: 1 });
        invalidate(job.tripId); // the ticket row (processing) takes over from the upload card
        remove(job.key, 600);
      } catch (err) {
        const message = friendly(err);
        patch(job.key, { stage: 'failed', error: message });
        toast.error(message);
        remove(job.key, 5000);
      }
    },
    [patch, invalidate, remove],
  );

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY && queue.current.length > 0) {
      const job = queue.current.shift()!;
      running.current++;
      void run(job).finally(() => {
        running.current--;
        pump();
      });
    }
  }, [run]);

  const enqueue = useCallback(
    (tripId: string, files: PickedFile[]) => {
      const fresh: UploadItem[] = [];
      for (const file of files) {
        const problem = validateFile(file);
        if (problem) {
          toast.error(problem);
          continue;
        }
        const key = randomUUID();
        queue.current.push({ key, tripId, file });
        fresh.push({ key, tripId, ticketId: null, fileName: file.name, fileSize: file.size, stage: 'queued', progress: 0, error: null });
      }
      if (!fresh.length) return;
      setItems((l) => [...l, ...fresh]);
      pump();
    },
    [pump],
  );

  const dismiss = useCallback((key: string) => setItems((l) => l.filter((i) => i.key !== key)), []);
  const value = useMemo(() => ({ items, enqueue, dismiss }), [items, enqueue, dismiss]);
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUploads must be used inside UploadProvider');
  return ctx;
}
