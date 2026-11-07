import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { toast } from 'sonner-native';
import { pendingShare, toPickedFiles } from '@/services/share';

/**
 * Listens for files shared from other apps (Android Share sheet → "Trippzy"). When some arrive, it keeps them,
 * clears the native share state, and opens the "Add to a trip" screen. Mounted only inside the signed-in app,
 * so a share that arrives while signed out is picked up right after sign-in.
 */
export function ShareWatcher() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const shared = shareIntent.files ?? [];
    void (async () => {
      if (shared.length === 0) {
        resetShareIntent();
        if (shareIntent.text || shareIntent.webUrl) toast.error('Trippzy can add PDFs and images. Share the file itself, not a link.');
        return;
      }
      const { files, skipped } = await toPickedFiles(shared);
      resetShareIntent();
      if (skipped) toast.error(skipped === shared.length ? 'Trippzy can add PDF, PNG, JPG or WEBP files.' : `${skipped} file(s) skipped — only PDF, PNG, JPG or WEBP can be added.`);
      if (files.length === 0) return;
      pendingShare.set(files);
      router.push('/share');
    })();
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);

  return null;
}
