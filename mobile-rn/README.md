# Quiet Feed — Android app (React Native / Expo)

Native client for the Quiet Feed backend. Audio-first, video retained, foreground only.
See `PLAN.md` for the full plan. **The existing web app and backend are untouched.**

## What's here (Phase 1 + auth wiring)
- Expo + TypeScript app, dark theme ported from the web palette.
- Navigation: left **drawer** (channels) + bottom **tabs** (Videos / Playlists / Progress) + stack (Player, Playlist detail, Settings).
- Reused logic: `src/lib/` (types, formatters, progress math) + the Zustand `store`.
- **Native Google Sign-In** → backend `/api/auth/google` → **Bearer token** stored in SecureStore.
- Feed (search + Hide Shorts + pull-to-refresh + paging), Playlists, Playlist detail
  (track / mark-all-watched), Progress (stats + 14-day chart + tracked courses), Settings
  (account, admin channel manager, auto-refresh, reset), and an **audio-first Player**
  (`react-native-youtube-iframe`) with the watch-time / 92%-completion / resume tracking.

## Prerequisites
- Node 18+, and the **Expo** tooling (`npm i -g eas-cli` optional for builds).
- Your **backend reachable over HTTPS** (a dev/staging URL for development, your domain for prod).
- An **Android OAuth client** in Google Cloud (package `app.quietfeed` + your signing SHA-1),
  and your existing **Web client ID** (used as `webClientId` so the backend can verify the token).

## Run (dev)
```bash
cd mobile-rn
cp .env.example .env          # set EXPO_PUBLIC_API_URL + EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
npm install
npx expo start                # press 'a' for Android, or scan with a dev build
```
> Native Google Sign-In needs a **development build** (not Expo Go): `npx expo run:android`
> or an EAS dev build. Google sign-in won't work in plain Expo Go.

## Build for Play Store
```bash
eas build -p android --profile preview      # installable APK for testing
eas build -p android --profile production    # AAB for the Play Store
eas submit -p android --latest               # upload to Play (after store setup)
```

## Backend note
The backend now returns a Bearer `token` from `POST /api/auth/google` and accepts
`Authorization: Bearer <token>` on all routes (additive; the web cookie path is unchanged).

## Status / next
- Phase 1 ✅ scaffold + theme + navigation + reused logic.
- Auth ✅ native Google Sign-In + token (needs the Android OAuth client + a dev build to test).
- Next: OS-level Picture-in-Picture, app icon/splash, richer player polish, then EAS release.

> This code is written but **not yet run on a device/emulator** — run `npx expo run:android`
> on your machine; we'll iterate on anything that needs fixing.
