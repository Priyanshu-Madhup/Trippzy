/** Only EXPO_PUBLIC_* values are bundled into the app. They are public by design:
 *  the Clerk *publishable* key and the API URL. No secret ever belongs here. */
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Share-to-Trippzy needs native code: absent in Expo Go and in builds made before it was added. */
export const shareEnabled = requireOptionalNativeModule('ExpoShareIntentModule') !== null;

export const env = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, ''),
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
};

/** Apple sign-in needs the provider enabled in Clerk (and Apple developer setup). Off until you turn it on. */
export const enableApple = process.env.EXPO_PUBLIC_ENABLE_APPLE === 'true';

export const isConfigured = !!env.apiUrl && !!env.clerkPublishableKey;
