import { ExpoConfig } from 'expo/config';

// App configuration. Secrets/URLs come from EXPO_PUBLIC_* env vars (see .env.example),
// which Expo inlines at build time.
const config: ExpoConfig = {
  name: 'Quiet Feed',
  slug: 'quiet-feed',
  scheme: 'quietfeed',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  // Custom icon/splash art can be added later (see PLAN.md). Expo uses defaults until then.
  android: {
    package: 'app.quietfeed',
  },
  plugins: [
    'expo-secure-store',
    '@react-native-google-signin/google-signin',
  ],
  extra: {
    // Mirror of the EXPO_PUBLIC_* values for convenience if needed at runtime.
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  },
};

export default config;
