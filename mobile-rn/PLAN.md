# Quiet Feed — Android app (React Native) plan

> Status: **PLAN ONLY** — nothing here is built yet. This folder will hold the React
> Native app. The existing web app (`source/`), backend (`server/`), and Docker stack
> are untouched and remain the source of truth.

Decision: **React Native rewrite**, distributed via the **Google Play Store**.

App model: **backend-based (multi-user), confirmed.** The app is a thin native client
to the existing `server/` — Google sign-in, admin-curated channels, server-side YouTube
key + caching, and cross-device progress all stay on the backend. The app does **no**
YouTube API calls or auth on its own. ⇒ the backend must be deployed and reachable over
**HTTPS** for the app to work (a dev/staging URL for development, your domain for prod).

Playback decision: **audio-first, video retained.** The player opens in the audio UI
(hidden video, tap to play/pause, equalizer) by default — but the full video player is
always present and the user can reveal the video anytime. **Foreground playback only.**
We deliberately do **not** build background/lock-screen audio or audio extraction
(YouTube Premium feature → ToS violation + Play Store removal risk). This keeps the app
defensible for public store review while giving the audio-first experience you want.

---

## 1. Big picture

The Android app is a **native client to the existing backend**. The backend
(`server/`) stays exactly as is and remains the brain: Google auth, the curated
channel list, the cached YouTube proxy, and per-user progress. The phone app just
renders that data natively and plays videos.

```
 Android app (React Native)  ──HTTPS──▶  existing backend /api  ──▶  Postgres + YouTube
   native UI + YouTube player              (unchanged logic)
   native Google Sign-In
   Bearer token in Keychain
```

**What this means:** this is a *rewrite of the View layer only*. The hard logic —
feed de-dupe/sort, filters, Shorts/“New” rules, progress math (watch time, 92%
completion, resume, streaks, course tracking) — is plain TypeScript and **ports over
almost verbatim**. Only the DOM/CSS components become React Native components.

---

## 2. What is reused vs rewritten

| Layer | Source (web) | In the RN app |
|---|---|---|
| Types | `source/src/lib/types.ts` | **reuse as-is** |
| Formatters | `source/src/lib/format.ts` | **reuse as-is** |
| Progress math | `source/src/lib/progress.ts` | **reuse as-is** |
| API client | `source/src/lib/api.ts` | reuse, add base URL + `Authorization: Bearer` |
| Store (Zustand) | `source/src/store.ts` | reuse the logic; swap localStorage→SecureStore, web Google→native plugin |
| UI components | `source/src/components/*` | **rewrite** in RN primitives (`View`/`Text`/`FlatList`/`Image`/`Pressable`) |
| Player | YT IFrame in a `<div>` | **rewrite** with `react-native-youtube-iframe` (same tracking logic) |
| Styling | `index.css` | **rewrite** as RN `StyleSheet` (same palette/dark theme) |

Zustand works in React Native unchanged, so the store’s actions and derived selectors
(`feedItems`, `plList`, `hasMoreVideos`, etc.) carry across.

---

## 3. Tech stack

- **Expo (managed) + EAS Build** — strongly recommended over bare RN. It removes the
  Android toolchain pain, builds the Play Store AAB in the cloud, and supports the
  native modules we need via config plugins + development builds.
- **TypeScript** (matches the rest of the repo).
- **State:** Zustand (ported store).
- **Navigation:** React Navigation — a **Drawer** for the channel list (matches the web
  left pane), with an icon **tab/segment** for Videos / Playlists / Progress.
- **YouTube playback:** `react-native-youtube-iframe` (official IFrame player in an
  internal WebView; exposes play/pause/seek/state for our tracking).
- **Auth:** `@react-native-google-signin/google-signin` (native Google Sign-In via
  Android Credential Manager — **not** a WebView, so Google permits it).
- **Secure storage:** `expo-secure-store` (session token) + `AsyncStorage` (prefs).
- **Lists:** `FlatList`/`FlashList` for the video grid (virtualized — better than the
  web’s render-all approach).

---

## 4. Backend changes required (small + additive — web keeps working)

The current backend authenticates with an **httpOnly cookie**, which is clean for the
same-origin web app but awkward for a native client. Fix = add a **Bearer-token path**
alongside cookies:

1. `POST /api/auth/google` — already verifies the Google ID token and returns the user.
   **Also return a signed JWT in the JSON body** (`{ user, token }`) for native clients.
   (Web keeps using the cookie; it can ignore `token`.)
2. `attachAuth` middleware — in addition to reading the `qf_session` cookie, **also
   accept `Authorization: Bearer <jwt>`**. Same verification, same payload.
3. No CORS changes needed: React Native’s `fetch` is **not** subject to browser CORS,
   and we use tokens (not cookies), so the cross-origin cookie headaches don’t apply.

That’s the entire backend delta — a few lines, fully backward-compatible.

---

## 5. Google Cloud / OAuth setup

- Create an **Android OAuth client** (Credentials → OAuth client ID → Android) with the
  app’s **package name** (e.g. `app.quietfeed`) and the **SHA‑1** of the signing key
  (from Play App Signing / EAS credentials).
- The native sign-in library is configured with your existing **Web client ID** as
  `webClientId` so the returned **ID token’s audience matches** what the backend already
  verifies (`GOOGLE_CLIENT_ID`). No backend audience change.
- Move the **OAuth consent screen** to **Production** before public launch. We only use
  basic profile + email (non-sensitive scopes), so heavy Google verification shouldn’t
  be required.

---

## 6. Screen map

- **Login** — logo + native “Sign in with Google” button → token stored in SecureStore.
- **Feed (Videos)** — `FlatList` of cards (thumb, title, channel, duration, progress bar,
  “New” badge); search + Hide Shorts; pull-to-refresh; “Load more”.
- **Channels drawer** — vertical list, “All channels”, per-channel filter; admin-only
  add/remove.
- **Playlists** + **Playlist detail** — grid, course progress, “Mark all watched”,
  track/untrack.
- **Player** — `react-native-youtube-iframe`, our tracking tick (watch time, ≥92% done,
  resume point). **Audio-first by default** (video hidden, tap to play/pause, equalizer),
  with a toggle to reveal the video. Foreground only. Optional **native Picture-in-Picture**;
  end-of-video card (replay / back).
- **Progress** — stat cards, last-14-days chart, tracked courses by channel.
- **Settings/Account** — signed-in identity, sign out, admin channel manager,
  auto-refresh, reset progress.

---

## 7. Native features we gain (and one we should NOT build)

- ✅ **OS-level Picture-in-Picture** — floats over other apps (real PiP, unlike the web’s
  in-page version). Via an Expo config plugin / Android PiP APIs.
- ✅ Native splash screen, app icon, notifications (e.g. “new uploads”).
- ✅ Virtualized lists, native scrolling/gestures, offline shell.
- ⚠️ **Background audio (screen off) for YouTube content — do NOT implement.** Background
  play is a YouTube **Premium** feature; doing it for embedded content **violates
  YouTube’s Terms** and is a common cause of **Play Store removal**. Our “hide the video”
  mode is *foreground* playback (allowed) and we keep it that way.

---

## 8. Proposed folder layout (created during build, not now)

```
mobile-rn/
  PLAN.md                ← this file
  app.config.ts          ← Expo config (plugins: google-signin, pip, icons/splash)
  eas.json               ← EAS Build profiles (preview APK + production AAB)
  package.json
  src/
    api/        ← ported api.ts (Bearer)
    store/      ← ported Zustand store (SecureStore + native auth)
    lib/        ← types.ts, format.ts, progress.ts (copied/shared)
    screens/    ← Login, Feed, Playlists, PlaylistDetail, Progress, Settings
    components/ ← Card, Drawer, Tabs, Player, AudioViz, EmptyState, …
    theme.ts    ← palette + typography (ported from index.css)
  assets/       ← icon.png, splash.png, adaptive-icon
```

---

## 9. Build phases

1. **Scaffold** Expo + TS app, theme, navigation shell.
2. **Auth** — native Google Sign-In → `/api/auth/google` → store Bearer token; auth gate.
3. **Backend** — add Bearer-token path (the §4 change).
4. **Feed** — cards + drawer + filters/search/Shorts + pagination.
5. **Player** — youtube-iframe + tracking + audio-only default + PiP + end card.
6. **Playlists + Progress** screens + course tracking.
7. **Settings/admin** + polish (icons, splash, empty states).
8. **Release** — EAS build → Play **internal testing** track → store listing → production.

Rough estimate: **2–4 weeks** of focused work for a polished, store-ready app.

---

## 10. Prerequisites checklist (before/with the build)

- [ ] Public **HTTPS backend** (the AWS deploy) — the app can’t talk to `localhost` in
      the wild. (Use a dev/staging HTTPS URL while developing.)
- [ ] **Google Play Developer account** ($25 one-time).
- [ ] **Android OAuth client** + signing SHA‑1 (from EAS/Play App Signing).
- [ ] **Privacy policy URL** + Play **Data safety** form (we collect Google email/profile
      + watch progress).
- [ ] App identity: package name, app name, icon, splash.

---

## 11. Open questions to confirm before building

- Package name / app display name (e.g. `app.quietfeed`, “Quiet Feed”)?
- Use **Expo + EAS** (recommended) or **bare React Native**?
- Backend base URL the app should target for dev and prod (your domain)?
- Include **native PiP** in v1, or ship v1 without it and add later?
