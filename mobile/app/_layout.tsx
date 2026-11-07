import '../global.css';
import '@/components/ui/interop';

import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_500Medium, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import { useEffect, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppToaster } from '@/components/common/AppToaster';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SetupRequired } from '@/components/common/SetupRequired';
import { env, isConfigured, shareEnabled } from '@/lib/env';
import { CACHE_OWNER_KEY, PERSIST_MAX_AGE, persistedRoots, queryClient, queryPersister } from '@/lib/queryClient';
import { setTokenGetter } from '@/services/api';
import { clearOffline } from '@/services/offline';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Gives the API client the Clerk session token, and drops cached data when the user changes. */
function AuthBridge() {
  const { getToken, userId, isLoaded } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  // The query cache and offline files persist across app restarts. They belong to ONE user: if a different
  // user signs in, or this one signs out, everything is wiped so nobody ever sees another account's tickets.
  useEffect(() => {
    if (!isLoaded) return;
    void (async () => {
      const owner = await AsyncStorage.getItem(CACHE_OWNER_KEY);
      const wipe = async () => {
        queryClient.clear();
        await queryPersister.removeClient();
        await clearOffline();
      };
      if (userId) {
        if (owner && owner !== userId) await wipe();
        await AsyncStorage.setItem(CACHE_OWNER_KEY, userId);
      } else if (owner) {
        await wipe();
        await AsyncStorage.removeItem(CACHE_OWNER_KEY);
      }
    })();
  }, [isLoaded, userId]);
  return null;
}

/** Holds the files another app shares to us (must wrap everything); skipped in Expo Go, which lacks the native module. */
function MaybeShareProvider({ children }: { children: ReactNode }) {
  if (!shareEnabled) return <>{children}</>;
  return <ShareIntentProvider options={{ resetOnBackground: false }}>{children}</ShareIntentProvider>;
}

function Themed() {
  const { resolved } = useTheme();
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Slot />
      <AppToaster />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <MaybeShareProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            {isConfigured ? (
              <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
                <PersistQueryClientProvider
                  client={queryClient}
                  persistOptions={{
                    persister: queryPersister,
                    maxAge: PERSIST_MAX_AGE,
                    dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && persistedRoots.has(String(q.queryKey[0])) },
                  }}
                >
                  <AuthBridge />
                  <Themed />
                </PersistQueryClientProvider>
              </ClerkProvider>
            ) : (
              <SetupRequired />
            )}
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
      </MaybeShareProvider>
    </ErrorBoundary>
  );
}
