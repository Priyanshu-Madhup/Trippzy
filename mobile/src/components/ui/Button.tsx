import type { LucideIcon } from 'lucide-react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import { Icon } from './Icon';
import { Text } from './Text';

/** Port of Trippy's `buttonVariants` — same variants, sizes and radii. */
const button = cva('flex-row items-center justify-center gap-2 active:scale-[0.98]', {
  variants: {
    variant: {
      primary: 'bg-primary',
      secondary: 'bg-surface border border-line',
      soft: 'bg-surface-2',
      ghost: '',
      danger: 'bg-danger',
      link: '',
      glass: 'bg-white/15 border border-white/20',
    },
    size: {
      sm: 'h-9 rounded-full px-3.5',
      md: 'h-11 rounded-full px-5',
      lg: 'h-[52px] rounded-full px-6',
      icon: 'size-10 rounded-full',
      'icon-sm': 'size-8 rounded-full',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

const label = cva('font-geist-medium', {
  variants: {
    variant: {
      primary: 'text-primary-ink',
      secondary: 'text-ink',
      soft: 'text-ink',
      ghost: 'text-ink-2',
      danger: 'text-white',
      link: 'text-ink underline',
      glass: 'text-white',
    },
    size: { sm: 'text-[13px]', md: 'text-sm', lg: 'text-[15px]', icon: 'text-sm', 'icon-sm': 'text-sm' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

const ICON_COLOR = { primary: 'text-primary-ink', secondary: 'text-ink', soft: 'text-ink', ghost: 'text-ink-2', danger: 'text-white', link: 'text-ink', glass: 'text-white' } as const;
const ICON_SIZE = { sm: 16, md: 18, lg: 20, icon: 18, 'icon-sm': 16 } as const;
const SHADOWED = new Set(['primary', 'secondary']);

export interface ButtonProps extends Omit<PressableProps, 'children'>, VariantProps<typeof button> {
  children?: string;
  icon?: LucideIcon;
  /** Custom leading element (e.g. a brand glyph); replaces `icon`. */
  leading?: ReactNode;
  loading?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ variant = 'primary', size = 'md', icon, leading, loading, disabled, children, className, style, ...props }: ButtonProps) {
  const v = variant ?? 'primary';
  const s = size ?? 'md';
  const shadow = useShadow('soft');
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      className={cn(button({ variant: v, size: s }), isDisabled && 'opacity-50', className)}
      style={[SHADOWED.has(v) ? shadow : null, style]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v === 'primary' || v === 'danger' || v === 'glass' ? '#ffffff' : undefined} />
      ) : leading ? (
        leading
      ) : icon ? (
        <Icon as={icon} size={ICON_SIZE[s]} className={ICON_COLOR[v]} />
      ) : null}
      {children ? <Text className={label({ variant: v, size: s })}>{children}</Text> : null}
    </Pressable>
  );
}
