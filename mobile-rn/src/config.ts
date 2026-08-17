// Runtime config from EXPO_PUBLIC_* env vars (inlined by Expo at build time),
// with production defaults for standalone APK release builds.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://quietfeed.devopspractice.live').replace(/\/+$/, '');
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '943416117987-r6r0ivdbou2884u3p0gvte5oksfng9ep.apps.googleusercontent.com';
