import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { House, Map, Plus, Settings, UserRound, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useUI } from '@/hooks/useUI';
import { cn } from '@/lib/utils';
import { useShadow } from '@/theme/useShadow';

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Home', icon: House },
  trips: { label: 'Trips', icon: Map },
  profile: { label: 'Profile', icon: UserRound },
  settings: { label: 'Settings', icon: Settings },
};
// Home · Trips · [+] · Profile · Settings — same order as Trippy's phone navigation.
const LEFT = ['index', 'trips'];
const RIGHT = ['profile', 'settings'];

/** Trippy's MobileNav: hairline top border, 4 tabs and a raised 58px "New trip" button. */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { openCreateTrip } = useUI();
  const float = useShadow('float');
  const active = state.routes[state.index]?.name;

  const tab = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    const { label, icon } = TABS[name];
    const focused = active === name;
    return (
      <Pressable
        key={name}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigateToTab(route.key);
        }}
        className="h-14 flex-1 items-center justify-center gap-1"
      >
        <Icon as={icon} size={22} className={focused ? 'text-ink' : 'text-faint'} />
        <Text className={cn('font-geist-medium text-[11px]', focused ? 'text-ink' : 'text-faint')}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View className="border-t border-line bg-bg-elevated/95" style={{ paddingBottom: insets.bottom }}>
      <View className="mx-auto w-full max-w-md flex-row items-center px-3">
        {LEFT.map(tab)}
        <View className="flex-1 items-center">
          <Pressable
            onPress={openCreateTrip}
            accessibilityRole="button"
            accessibilityLabel="New trip"
            style={float}
            className="-mt-7 size-[58px] items-center justify-center rounded-full border-[5px] border-bg bg-primary active:scale-95"
          >
            <Icon as={Plus} size={24} className="text-primary-ink" />
          </Pressable>
        </View>
        {RIGHT.map(tab)}
      </View>
    </View>
  );
}
