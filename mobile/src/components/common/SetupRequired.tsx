import { View } from 'react-native';
import { Logo } from '@/components/brand/Logo';
import { Text } from '@/components/ui/Text';

/** Shown in development when the app has no API URL / Clerk key yet. */
export function SetupRequired() {
  return (
    <View className="flex-1 justify-center bg-bg px-8">
      <Logo />
      <Text className="mt-8 font-geist-semibold text-2xl tracking-tight">Almost there</Text>
      <Text className="mt-2 text-[15px] leading-[22px] text-muted">
        Add your Clerk publishable key and the API URL to <Text className="font-geist-mono">mobile/.env</Text>, then restart the dev server:
      </Text>
      <View className="mt-5 rounded-2xl bg-surface-2 p-4">
        <Text className="font-geist-mono text-[13px] leading-5">EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_…{'\n'}EXPO_PUBLIC_API_URL=https://your-api.example.com</Text>
      </View>
    </View>
  );
}
