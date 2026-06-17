import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/src/providers/AuthProvider';
import { LibraryProvider } from '@/src/providers/LibraryProvider';
import { PlayerProvider } from '@/src/providers/PlayerProvider';
import { OfflineProvider } from '@/src/providers/OfflineProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LibraryProvider>
          <OfflineProvider>
            <PlayerProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#070707' },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            </Stack>
          </PlayerProvider>
          </OfflineProvider>
        </LibraryProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
