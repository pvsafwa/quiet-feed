import { ExpoConfig } from 'expo/config';

// App configuration. Secrets/URLs come from EXPO_PUBLIC_* env vars (see .env.example),
// which Expo inlines at build time.
const config: ExpoConfig = {
  name: 'My Tube',
  slug: 'my-tube',
  scheme: 'mytube',
  version: '1.0.18',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  android: {
    package: 'app.mytube',
    versionCode: 20,
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#14120f',
    },
  },
  ios: {
    bundleIdentifier: 'app.mytube',
  },
  plugins: [
    'expo-secure-store',
    '@react-native-google-signin/google-signin',
    // Signs release builds with our own keystore instead of the shared Android debug key.
    './plugins/withReleaseSigning',
    './plugins/withBackgroundAudio',
  ],
  extra: {
    // Mirror of the EXPO_PUBLIC_* values for convenience if needed at runtime.
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  },
};

export default config;
