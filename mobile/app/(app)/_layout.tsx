import { useAuth } from '@clerk/expo';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { UpdateGate } from '@/components/common/UpdateGate';
import { ShareWatcher } from '@/features/share/ShareWatcher';
import { shareEnabled } from '@/lib/env';
import { UIContext, type UIContextValue } from '@/hooks/useUI';
import { UploadProvider } from '@/hooks/useUpload';

/** Authenticated app chrome: the upload queue and global actions. Signed-out users are sent to /welcome. */
export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  // "New trip" / "Edit trip" are real screens (slide-up modals), not an overlay host.
  const ui = useMemo<UIContextValue>(
    () => ({
      openCreateTrip: () => {
        if (__DEV__) console.log('[ui] new trip tapped');
        router.push('/trip-form');
      },
      openEditTrip: (trip) => router.push({ pathname: '/trip-form', params: { tripId: trip.id } }),
    }),
    [router],
  );

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/welcome" />;

  return (
    <UIContext.Provider value={ui}>
      <UploadProvider>
        {shareEnabled ? <ShareWatcher /> : null}
        <UpdateGate />
        <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom', animationDuration: 260, contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Screen name="trip/[tripId]" options={{ animation: 'slide_from_right', animationDuration: 280 }} />
          <Stack.Screen name="viewer/[ticketId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="home-widgets" options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="trip-form" options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
        </Stack>
      </UploadProvider>
    </UIContext.Provider>
  );
}
