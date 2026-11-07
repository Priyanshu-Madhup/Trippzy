import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/ui/Text';

/**
 * Landing screen for the browser sign-in redirect (`trippzy://sso-callback`, or `exp://…/--/sso-callback` in
 * Expo Go). It gives the redirect a real route to land on, so Expo Router doesn't treat it as "unmatched" or
 * reload the app. Once Clerk activates the session, the (auth) layout sends the user Home; if nothing
 * happens (cancelled / failed), go back to the login screen instead of hanging here.
 */
export default function SsoCallback() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace('/login'), 12_000);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-bg">
      <ActivityIndicator />
      <Text className="text-sm text-muted">Finishing sign-in…</Text>
    </View>
  );
}
