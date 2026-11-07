import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';
import { hex } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  className?: string;
  invalid?: boolean;
  multiline?: boolean;
}

/** Port of Trippy's Input/Textarea: rounded-2xl, hairline border, surface fill. */
export const Input = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function Input({ className, invalid, multiline, style, ...props }, ref) {
  const { resolved } = useTheme();
  return (
    <TextInput
      ref={ref}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      placeholderTextColor={hex[resolved].faint}
      cursorColor={hex[resolved].ink}
      selectionColor={hex[resolved].sun}
      className={cn(
        'w-full rounded-2xl border bg-surface px-4 font-geist text-[15px] text-ink focus:border-line-strong',
        multiline ? 'min-h-24 py-3 leading-[22px]' : 'h-12',
        invalid ? 'border-danger/60' : 'border-line',
        className,
      )}
      style={style}
      {...props}
    />
  );
});

export function Label({ children }: { children: ReactNode }) {
  return <Text className="mb-1.5 font-geist-medium text-[13px] text-ink-2">{children}</Text>;
}

/** Label + control + error/hint, like Trippy's `Field`. */
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <View className={className}>
      <Label>{label}</Label>
      {children}
      {error ? (
        <Text accessibilityRole="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </Text>
      ) : hint ? (
        typeof hint === 'string' ? <Text className="mt-1.5 text-[13px] text-muted">{hint}</Text> : <View className="mt-1.5">{hint}</View>
      ) : null}
    </View>
  );
}
