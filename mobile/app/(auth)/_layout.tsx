import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// Completes the browser-based OAuth round trip (Apple) when the app is re-opened by the redirect.
WebBrowser.maybeCompleteAuthSession();

export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  // Signed in → Home. (`/` is the Home tab; there must be no other screen that also answers to `/`.)
  if (isLoaded && isSignedIn) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />;
}
