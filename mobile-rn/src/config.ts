// Runtime config from EXPO_PUBLIC_* env vars (inlined by Expo at build time).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
