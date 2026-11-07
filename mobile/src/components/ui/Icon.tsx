import type { LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

const applied = new WeakSet<object>();

/**
 * Lucide icon driven by Tailwind classes: `<Icon as={Plane} size={18} className="text-muted" />`.
 * (Same icon set Trippy uses.) The colour comes from the `text-*` class, so icons follow the theme.
 */
export function Icon({ as: Comp, size = 18, strokeWidth, className }: { as: LucideIcon; size?: number; strokeWidth?: number; className?: string }) {
  if (!applied.has(Comp)) {
    cssInterop(Comp, { className: { target: 'style', nativeStyleToProp: { color: true } } });
    applied.add(Comp);
  }
  return <Comp size={size} strokeWidth={strokeWidth} className={className} />;
}
