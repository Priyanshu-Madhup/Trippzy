import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';
import { Text } from './Text';

/** Trippy's Switch: 48×28 track, 24px thumb, primary when on. */
export function Switch({ checked, onCheckedChange, disabled, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(checked ? 22 : 2, { stiffness: 400, damping: 30 }) }] }));
  const soft = useShadow('soft');
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      className={cn('h-7 w-12 justify-center rounded-full', checked ? 'bg-primary' : 'bg-surface-3', disabled && 'opacity-50')}
    >
      <Animated.View style={[{ width: 24, height: 24, borderRadius: 12 }, soft, thumb]} className={checked ? 'bg-white dark:bg-bg' : 'bg-white'} />
    </Pressable>
  );
}

/** Pill segmented control (Trippy's `Segmented`). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const soft = useShadow('soft');
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className={cn('flex-row self-start rounded-full bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.value)}
            style={active ? soft : undefined}
            className={cn('flex-1 flex-row items-center justify-center gap-1.5 rounded-full', size === 'sm' ? 'h-8 px-3' : 'h-9 px-4', active && 'bg-surface')}
          >
            {o.icon}
            <Text className={cn('font-geist-medium', size === 'sm' ? 'text-[13px]' : 'text-sm', active ? 'text-ink' : 'text-muted')}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={cn('flex-row items-center gap-1 self-start rounded-full bg-surface-2 px-2.5 py-1', className)}>
      {typeof children === 'string' ? <Text className="font-geist-medium text-xs text-ink-2">{children}</Text> : children}
    </View>
  );
}
