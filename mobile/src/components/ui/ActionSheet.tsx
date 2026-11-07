import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Text } from './Text';

export interface Action {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
}

/** Trippy's dropdown menu, as a phone-native action list in a bottom sheet. */
export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title: string; actions: Action[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <View className="px-3 pb-3 pt-3">
        {actions.map((a, i) => (
          <View key={a.label}>
            {a.destructive && i > 0 ? <View className="mx-3 my-1 h-px bg-line" /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                // let the sheet finish dismissing before the action opens another one
                setTimeout(a.onPress, 220);
              }}
              className={cn('flex-row items-center gap-3 rounded-xl px-3 py-3.5 active:bg-surface-2', a.destructive && 'active:bg-danger-bg')}
            >
              {a.icon ? <Icon as={a.icon} size={18} className={a.destructive ? 'text-danger' : 'text-muted'} /> : null}
              <Text className={cn('font-geist-medium text-[15px]', a.destructive && 'text-danger')}>{a.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
