import { ArrowUpDown, Search, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { cn } from '@/lib/utils';
import { hex } from '@/theme/tokens';
import { useShadow } from '@/theme/useShadow';
import { useTheme } from '@/theme/ThemeProvider';

/** Trippy's pill search field. */
export function SearchBar({ value, onChange, placeholder = 'Search', trailing }: { value: string; onChange: (v: string) => void; placeholder?: string; trailing?: ReactNode }) {
  const { resolved } = useTheme();
  const soft = useShadow('soft');
  return (
    <View style={soft} className="h-11 flex-row items-center rounded-full border border-line bg-surface pl-4 pr-2">
      <Icon as={Search} size={18} className="text-faint" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={hex[resolved].faint}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        className="h-full flex-1 px-3 font-geist text-[15px] text-ink"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search" className="size-7 items-center justify-center rounded-full active:bg-surface-2">
          <Icon as={X} size={16} className="text-muted" />
        </Pressable>
      ) : null}
      {trailing}
    </View>
  );
}

/** Horizontally scrolling filter pills with counts (hides empty filters). */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  counts,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
  counts?: Partial<Record<T, number>>;
  label: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label} contentContainerStyle={{ gap: 6 }}>
      {options.map((o) => {
        const active = o.key === value;
        const count = counts?.[o.key];
        if (count === 0 && o.key !== 'all' && !active) return null;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            className={cn('h-9 flex-row items-center gap-1.5 rounded-full px-4', active ? 'bg-primary' : 'border border-line bg-surface')}
          >
            <Text className={cn('font-geist-medium text-sm', active ? 'text-primary-ink' : 'text-ink-2')}>{o.label}</Text>
            {count !== undefined ? <Text className={cn('text-xs', active ? 'text-primary-ink opacity-70' : 'text-faint')}>{count}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export type SortKey = 'date' | 'recent' | 'type';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date', label: 'Travel date' },
  { key: 'recent', label: 'Recently uploaded' },
  { key: 'type', label: 'Type' },
];

export const SORT_OPTIONS = SORTS;

/** Round icon-only sort pill that sits beside the search bar; the options open in an action sheet owned by the screen. */
export function SortButton({ value, onOpen }: { value: SortKey; onOpen: () => void }) {
  const soft = useShadow('soft');
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Sort tickets: ${SORTS.find((s) => s.key === value)?.label}`}
      style={soft}
      className="size-11 items-center justify-center rounded-full border border-line bg-surface active:bg-surface-2"
    >
      <Icon as={ArrowUpDown} size={18} className="text-ink-2" />
    </Pressable>
  );
}