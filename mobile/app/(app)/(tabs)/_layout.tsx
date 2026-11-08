import { Tabs } from 'expo-router';
import { TabBar } from '@/components/layout/TabBar';
import { useTheme } from '@/theme/ThemeProvider';
import { hex } from '@/theme/tokens';

export default function TabsLayout() {
  const { resolved } = useTheme();
  // 'shift' slides the next tab in from the side (in the direction of the tab bar), which reads far smoother than a cross-fade.
  // The scene needs a solid background so the two tabs never show through each other mid-slide.
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'shift', sceneStyle: { backgroundColor: hex[resolved].bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
