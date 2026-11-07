/**
 * Android hands a shared file to the app as a deep link like `trippzy://dataUrl=trippzyShareKey`. That isn't a
 * screen, so send it to Home; <ShareWatcher/> reads the shared files from the native module and opens /share.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes('dataUrl=')) return '/';
  return path;
}
