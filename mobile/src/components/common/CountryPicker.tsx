import { Check, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { COUNTRIES, flagEmoji } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { hex } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Searchable country list in a bottom sheet. */
export function CountryPicker({ open, onClose, value, onSelect }: { open: boolean; onClose: () => void; value: string | null | undefined; onSelect: (code: string) => void }) {
  const { resolved } = useTheme();
  const { height } = useWindowDimensions();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle) : COUNTRIES;
  }, [q]);

  return (
    <Sheet open={open} onClose={onClose} title="Country">
      <View className="px-6 pb-2 pt-3">
        <View className="h-11 flex-row items-center rounded-full border border-line bg-surface-2 px-4">
          <Icon as={Search} size={18} className="text-faint" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search countries"
            placeholderTextColor={hex[resolved].faint}
            accessibilityLabel="Search countries"
            autoCorrect={false}
            className="h-full flex-1 px-3 font-geist text-[15px] text-ink"
          />
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.code}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={{ maxHeight: height * 0.5 }}
        initialNumToRender={18}
        ListEmptyComponent={<Text className="px-6 py-6 text-sm text-muted">No country matches “{q}”.</Text>}
        renderItem={({ item }) => {
          const active = item.code === value;
          return (
            <Pressable
              onPress={() => {
                onSelect(item.code);
                setQ('');
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={cn('flex-row items-center gap-3 px-6 py-3 active:bg-surface-2', active && 'bg-surface-2')}
            >
              <Text className="text-[20px]">{flagEmoji(item.code)}</Text>
              <Text className="flex-1 text-[15px]">{item.name}</Text>
              {active ? <Icon as={Check} size={18} className="text-ink" /> : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}
