import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { TransferProvider } from '@/context/TransferContext';
import { initializeMobileRuntime } from '@/lib/runtime-config';
import { MobileSamraRuntimeProvider } from '@/lib/samra-runtime';
import { tokens } from '@workspace/samra-pay-ds/tokens';
import { useDesignSystemFonts } from '@workspace/samra-pay-ds/hooks/use-fonts';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Configure the generated API client before any provider or screen can issue a
// request. Invalid API-mode builds fail explicitly during application startup.
const mobileRuntimeConfig = initializeMobileRuntime();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isReady, isSignedIn } = useAuth();

  if (!isReady) return null;

  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: tokens.color.dark.background },
      }}
    >
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const { fontsLoaded, fontError } = useDesignSystemFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <MobileSamraRuntimeProvider config={mobileRuntimeConfig}>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <AuthProvider>
                  <LanguageProvider>
                    <TransferProvider>
                      <StatusBar style="light" />
                      <RootLayoutNav />
                    </TransferProvider>
                  </LanguageProvider>
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </MobileSamraRuntimeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
