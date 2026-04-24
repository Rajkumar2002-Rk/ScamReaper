import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { ONBOARDING_KEY } from '@/app/onboarding';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CallScreeningService } from '@/services/CallScreeningService';
import { attachNotificationResponseHandler } from '@/services/NotificationService';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    CallScreeningService.init();
    const detach = attachNotificationResponseHandler((callId) => {
      router.push({ pathname: '/call-detail', params: { id: callId } });
    });
    return detach;
  }, [router]);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((raw) => {
      const completed = raw === 'true';
      const first = segments[0];
      if (!completed && first !== 'onboarding') {
        router.replace('/onboarding');
      }
      setChecked(true);
    });
  }, [router, segments]);

  if (!checked) {
    return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="call-detail" options={{ headerShown: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="security-log" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
