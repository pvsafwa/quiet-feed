import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { useStore } from './src/store';
import { RootNavigator } from './src/navigation';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { Toast } from './src/components/Toast';
import { PlayerOverlay } from './src/components/PlayerOverlay';
import { colors } from './src/theme';

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg2, text: colors.ink, border: colors.line, primary: colors.accent },
};

// Dev-only player harness: mounts PlayerOverlay directly with a fixed public video,
// skipping sign-in, so the player can be debugged on an emulator. __DEV__ is compiled
// false in release builds, so none of this can ever ship.
const DEBUG_PLAYER = __DEV__ && process.env.EXPO_PUBLIC_DEBUG_PLAYER === '1';
const DEBUG_VIDEO = {
  id: 'M7lc1UVf-VE', // YouTube's official IFrame-API demo video (embeddable)
  title: 'IFrame API demo', channelId: 'dev', channelTitle: 'YouTube Developers',
  published: new Date().toISOString(), thumb: '', seconds: 200,
} as any;

export default function App() {
  const authReady = useStore(s => s.authReady);
  const user = useStore(s => s.user);

  useEffect(() => {
    if (DEBUG_PLAYER) { useStore.getState().openPlayer(DEBUG_VIDEO); return; }
    useStore.getState().init();
  }, []);

  if (DEBUG_PLAYER) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <PlayerOverlay />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {!authReady ? (
          <LoadingScreen />
        ) : !user ? (
          <LoginScreen />
        ) : (
          <NavigationContainer theme={navTheme as any}>
            <RootNavigator />
          </NavigationContainer>
        )}
        {/* Sits above the navigator so it can float over the feed (PiP), like the web app. */}
        {user && <PlayerOverlay />}
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
