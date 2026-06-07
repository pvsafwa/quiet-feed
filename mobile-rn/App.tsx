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
import { colors } from './src/theme';

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg2, text: colors.ink, border: colors.line, primary: colors.accent },
};

export default function App() {
  const authReady = useStore(s => s.authReady);
  const user = useStore(s => s.user);

  useEffect(() => { useStore.getState().init(); }, []);

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
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
