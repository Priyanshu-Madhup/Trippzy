import { Image } from 'expo-image';
import { useState } from 'react';

/** Country flag image (emoji flags are inconsistent across Android vendors). Hides itself on failure. */
export function Flag({ code, height = 14 }: { code: string | null | undefined; height?: number }) {
  const [failed, setFailed] = useState(false);
  if (!code || !/^[A-Za-z]{2}$/.test(code) || failed) return null;
  const cc = code.toLowerCase();
  return (
    <Image
      source={{ uri: `https://flagcdn.com/w80/${cc}.png` }}
      contentFit="cover"
      cachePolicy="disk"
      onError={() => setFailed(true)}
      accessibilityElementsHidden
      style={{ height, width: height * 1.4, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }}
    />
  );
}
