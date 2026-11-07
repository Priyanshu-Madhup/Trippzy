import { Text as RNText, type TextProps } from 'react-native';
import { cn } from '@/lib/utils';

/**
 * Text with Trippy's defaults (Geist, ink). React Native has no variable-font weights, so
 * weight is chosen with a font-family class: font-geist / -medium / -semibold / -bold,
 * font-geist-mono(-semibold), font-serif-italic. If the caller passes any `font-*`, we
 * don't add the default family (so the two never fight).
 */
export function Text({ className, ...props }: TextProps & { className?: string }) {
  const hasFont = !!className && /(^|\s)font-/.test(className);
  return <RNText className={cn(hasFont ? 'text-ink' : 'font-geist text-ink', className)} {...props} />;
}
