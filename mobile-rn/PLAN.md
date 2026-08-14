# Quiet Feed — Android app (React Native / Expo)

> Status: **code written, never run.** Every screen exists and the store/lib layers are
> ported. The SDK upgrade is done and the app bundles, but it has **not been launched once**.
> Treat all screen behaviour as unverified.

**Scope: Android only, private distribution to a small circle.** No Play Store, no App
Store, no public listing. Distributed the same way the web app is — self-hosted from
`https://quietfeed.devopspractice.live`, invite-only.

**iOS: dropped.** Distributing to anyone else's iPhone requires the Apple Developer Program
($99/yr) with no exceptions — a free Apple ID only self-signs onto your own device for 7
days. Not worth the cost at this scale. The codebase stays cross-platform (Expo/RN), so iOS
remains a config-only exercise (§7) if that ever changes.

**Wider audience: on hold until further notice.** A separate branch, separate discussion.

---

## 1. Big picture

```
 Android app (Expo / React Native)  ──HTTPS──▶  existing backend /api  ──▶  Postgres + YouTube
   native UI + YouTube IFrame player            (no changes needed for the app)
   native Google Sign-In
   Bearer token in SecureStore
```

This is a **rewrite of the View layer only**. Feed de-dupe/sort, filters, Shorts rules, and
progress math (watch time, 92% completion, resume, streaks, course tracking) are plain
TypeScript ported verbatim from the web app.

**The backend already supports the app.** `POST /api/auth/google` returns a Bearer token
(`auth/routes.ts`) and `attachAuth` accepts `Authorization: Bearer` alongside the web's
cookie (`auth/middleware.ts`). No server work is required to ship the app.

---

## 2a. The Android autoplay bug — post-mortem (fixed)

Symptom: tapping a video never started playback; the user had to unhide the video and press
YouTube's own play button. Survived two blind fixes; root-caused on an emulator.

**Root cause — two stacked, provable bugs:**

1. **react-native-webview's `postMessage` command is broken on Android under the New
   Architecture.** Its Kotlin side runs `document.dispatchEvent(MessageEvent)`
   (`RNCWebViewManagerImpl.kt:335`), and an instrumented page proved the event never fires —
   while page→RN messaging and the `injectJavaScript` command both work. The library sends
   play/pause/mute **only** through the dead channel; every getter/seek already uses the
   working one. Hence: player inits, reports ready, and ignores us forever.
2. **Protocol mismatch on top:** the hosted player page (`iframe_v2.html`) switches on raw
   strings (`'playVideo'`…), but the library posts a JSON envelope
   (`{"eventName":"playVideo",…}`). Even over a working channel it would have matched nothing.

**Fix:** `patches/react-native-youtube-iframe+2.4.1.patch` (applied by `patch-package` via
`postinstall`) — reroutes the library's `sendPostMessage` through `injectJavaScript`,
dispatching the **raw eventName** as a `window` MessageEvent. One function changed.

A third, earlier-found bug was also real: `PlayerScreen` drove the player's `play` prop from
the same state it overwrote with *reported* state, so YouTube's startup `'buffering'` caused
a self-pause. Fixed by splitting intent (`wantPlay`) from reflection (`playing`) in
`PlayerOverlay.tsx` — masked until the channel fix, necessary after it.

`forceAndroidAutoplay` (desktop-UA spoof) proved **unnecessary** — autoplay verified working
on the normal mobile UA — and is not shipped.

**Verified on a Pixel-7 emulator (Android 15), release-equivalent code:** open →
`unstarted → buffering → playing` in ~1.4s with zero touches; cover tap → `paused`; tap →
`playing`. The `getDuration` probe (1344s) also proves the tracking tick's channel works.

### Debug rig (reusable)

Local emulator: `avdmanager create avd -n qf -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_7`,
boot headless (`emulator -avd qf -no-window`), `EXPO_PUBLIC_DEBUG_PLAYER=1 npx expo run:android`
mounts a dev-only player harness (`App.tsx`, `__DEV__`-gated — compiled out of release) that
skips sign-in. Observe via `adb logcat` (`[player state]` + WebView console) and
`adb exec-out screencap`. Google sign-in cannot be tested this way; everything else can.

---

## 2. The player — parity with the web app

**Decision: port as-is. No changes.** `PlayerScreen.tsx` is already a faithful port of
`source/src/components/player.tsx`, so parity requires no work.

The audio-only player is **an existing, deliberate web-app feature**, not a mobile
invention: `player.tsx:37` defaults `videoOff` to `true`, `:189` renders the `audiocover`
overlay, `:114` sets `autoplay: 1`, `:120` covers YouTube's end-screen with its own card,
and `:22` reads *"Audio Only (v2)"*. It has been running in production.

### Recorded for the record (not a blocker, not planned work)

An earlier revision of this plan proposed rewriting the player to remove the audio-only mode.
That recommendation was made **before** establishing that the web app already ships this
feature, and it was framed as though the Android app would *introduce* the exposure. **That
framing was wrong.** The relevant facts, stated once:

- **Developer Policies §III.I.7** — must not "separate, isolate, or modify the audio or video
  components of any YouTube audiovisual content."
- **Developer Policies §III.I.6** — must not "modify, build upon, or block any portion or
  functionality of a YouTube player."
- **Required Minimum Functionality** — must not "display overlays, frames, or other visual
  elements in front of any part of a YouTube embedded player, including player controls";
  autoplay only once "more than half of the player is visible."

`YOUTUBE_API_KEY` is one server-side key shared by web and app, so the exposure is
**pre-existing and product-wide**. The Android app **replicates it; it does not create it**,
and removing it from the app alone would not reduce it — it would only make the app behave
differently from the web app you use daily.

⇒ Therefore this is **a product decision about Quiet Feed as a whole, web included — not an
Android question**, and it is explicitly **out of scope for this plan**. Parity wins here.

---

## 3. Dependency upgrade — ✅ DONE

Upgraded from **SDK 51 / RN 0.74** (mid-2024, past EAS Build support) to **SDK 57 / RN 0.86 /
React 19**. Versions are the canonical SDK 57 set (Expo's `bundledNativeModules.json` +
`expo install --fix`) — not hand-picked.

| Package | Was | Now | Note |
|---|---|---|---|
| `expo` | ~51.0.28 | **~57.0.6** | |
| `react-native` | 0.74.5 | **0.86.0** | |
| `react` | 18.2.0 | **19.2.3** | RN 0.86 requires `^19.2.3` exactly |
| `@react-native-google-signin/google-signin` | ^13.1.0 | **^16.1.2** | |
| `react-native-webview` | 13.8.6 | **13.16.1** | SDK 57 pins 13.x, *not* 14.x |
| `react-native-reanimated` | ~3.10.1 | **4.5.0** | |
| `react-native-worklets` | — | **0.10.0** | **new** required peer of reanimated 4 |
| `react-native-screens` | 3.31.1 | **4.25.2** | |
| `react-native-youtube-iframe` | ^2.3.0 | **^2.4.1** | see risk below |
| `@react-navigation/*` | 6.x | **7.x** | |
| `zustand` | ^4.5.5 | **^5.0.8** | |
| `expo-secure-store` / `-constants` / `-status-bar` | 13/16/1.x | **57.x** | expo-* now SDK-matched |
| `expo-font` | — | **~57.0.1** | **new** peer of `@expo/vector-icons`; Expo warns of crashes outside Expo Go without it |
| `typescript` | ~5.3.3 | **~6.0.3** | major jump; deprecates `baseUrl` |

Also: `babel.config.js` → `react-native-worklets/plugin` (reanimated 4 moved it);
`tsconfig.json` → dropped `baseUrl` + the unused `@/*` alias (TS 6 errors on `baseUrl`).

**Verified:** `tsc --noEmit` clean (20 files, `strict: true`) · `expo-doctor` 20/20 · **both
platforms bundle** (3.7MB Hermes each).

**Player risk, reduced not eliminated:** `react-native-youtube-iframe` (2.4.1) is unpublished
since July 2025 and effectively unmaintained. It **resolves and bundles** under the New
Architecture — it's a thin JS wrapper over the maintained `react-native-webview` — so the
bundling risk is retired. **Runtime behaviour is still unverified** (needs a device).
Fallback: drive the IFrame API directly in a `react-native-webview` via injected JS, which is
essentially what the library does internally.

---

## 4. Auth — same as the web app

No changes. The app signs in through the same `/api/auth/google`, gets a Bearer token, and
is subject to exactly the same rules as the web app. `ADMIN_EMAILS` decides admin vs user,
same as today. Access control is **by distribution** — only people you give the APK to have
the app — which mirrors how the web app is shared today.

> An earlier revision of this plan proposed adding an `ALLOWED_EMAILS` allowlist. **That was
> scope I invented, not something asked for, and it's removed.** The underlying observation
> is recorded in §10 as information only — it applies to the web app as it stands today and
> is unaffected by shipping the Android app.

---

## 5. Quota & caching review

**The central claim holds.** All four content endpoints (`routes/content.ts`) wrap `cached()`
with **content-derived keys** — `uploads:<ch>:<token>`, `playlists:<ch>:<token>`,
`playlist:<id>`, `videometa:<id>`. No user identity in any key. The YouTube key lives only in
`youtube/client.ts` and never reaches a client. **Adding users genuinely costs ~0 extra
quota** — cost scales with *channels and playlists*, not people. `DEPLOY.md` is accurate.

Current settings: `CACHE_TTL_MINUTES=60`, `REFRESH_INTERVAL_MINUTES=30`. Interval < TTL, so
the worker re-warms `uploads:<ch>:first` and `playlists:<ch>:first` before they expire — the
feed is always warm. Worker cost ≈ **3 units/channel/cycle** (playlistItems 1 + videos 1 +
playlists 1) → 48 cycles/day × 3 × N channels = **~144N units/day**. Ten channels ≈ 1,440/day
against the default 10,000. Comfortable.

**Bottom line: your read was right — the quota is central, cached, and per-content.** The
Android app adds nothing to it; it hits the same cached endpoints the web app does.

Specific findings from this review are recorded in **§10** as information only. The one worth
knowing about is §10.2 (playlist durations — the single path that isn't flat). Nothing here
blocks the app, and nothing here is scheduled.

---

## 6. Screen map (built; needs verification)

- **Login** — native Google Sign-In → Bearer token in SecureStore.
- **Feed (Videos)** — `FlatList` cards, search, Hide Shorts, pull-to-refresh, paging.
- **Channels drawer** — all/per-channel filter; admin-only add/remove.
- **Playlists** + **detail** — course progress, track/untrack, mark-all-watched.
- **Player** — visible IFrame player + watch-time / 92% / resume tracking. **Rewritten for
  compliance** (§2).
- **Progress** — stats, 14-day chart, tracked courses.
- **Settings** — account, admin channel manager, auto-refresh, reset progress.

---

## 7. Distribution — Android, private

EAS builds an **APK**; host it on the existing domain and share the link. Recipients enable
"install from unknown sources" once. **No store account, no fee, and no local Android
toolchain** (EAS builds in the cloud) — an EAS APK installs straight onto a physical phone.

- **Signing:** no Play App Signing, so **EAS manages the keystore**. The Android OAuth
  client's **SHA-1 comes from `eas credentials`**, not Play.
- **Updates:** native changes need a re-shared APK. **EAS Update (OTA)** ships JS/asset
  changes instantly to installed apps with no redistribution — worth wiring up early given
  there's no store to push updates.

*(If iOS ever returns: add `ios.bundleIdentifier`, an iOS OAuth client + the
reversed-client-ID `iosUrlScheme` on the google-signin plugin, and EAS iOS profiles. Then
TestFlight internal — no review, 100 testers, 90-day build expiry — or Ad Hoc with UDIDs.
All gated on the $99/yr.)*

---

## 8. Phases

Scope: **ship the existing app, at parity with the web app.** No new features, no behaviour
changes, no backend work.

1. **Upgrade** — ✅ **done.** SDK 51→57, typecheck clean, doctor 20/20, bundles.
2. **Build config** — ✅ **done.** `eas.json` rewritten (see below), `.env` + `.env.example`
   set to the live backend, `expo-system-ui` added so `userInterfaceStyle: 'dark'` actually
   applies. Validated with `expo prebuild` (all config plugins apply; `applicationId` =
   `app.quietfeed`; google-signin + secure-store autolink correctly).
3. **Local Android toolchain** — ✅ **done.** JDK 17 (`brew install openjdk@17`, keg-only at
   `/opt/homebrew/opt/openjdk@17`) + Android command line tools
   (`/opt/homebrew/share/android-commandlinetools`) + platform-tools. Neither needed sudo.
   **No Expo account and no EAS required — builds run locally.**
   ```
   export JAVA_HOME=/opt/homebrew/opt/openjdk@17
   export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
   cd mobile-rn && npx expo prebuild -p android --clean --no-install
   cd android && ./gradlew assembleRelease
   # → android/app/build/outputs/apk/release/app-release.apk
   ```
4. **Release signing** — ✅ **done.** See below. **SHA-1 to register:**
   `11:E4:B0:6E:F7:66:62:7B:8D:77:2B:CD:78:10:A2:55:B7:C5:D3:D3`
5. **Android OAuth client** — Google Cloud → Credentials → OAuth client ID → **Android**,
   package `app.quietfeed`, the SHA-1 above, **same project as the existing web client**.
   *Ordering note:* the app only embeds `webClientId`; the Android client ID is never
   referenced in code — Play Services matches it by package + signature. **So the APK can be
   built and installed first; creating the client afterwards makes sign-in start working with
   no rebuild.**

### Release signing — why this wasn't left at the default

The RN template signs **release** builds with the **shared Android debug key** (`CN=Android
Debug`, password `android`, SHA-1 `5E:8F:16:06:…`) — byte-identical in every RN/Expo project
worldwide. Its own comment says *"In production, you need to generate your own keystore."*
Registering that SHA-1 for Google Sign-In would let **anyone** build an `app.quietfeed` clone
and use this OAuth client.

Worse, **the first APK handed out locks the key in**: Android refuses to install an update
signed by a different key, so switching later forces every user to uninstall and reinstall.
So it had to be settled before anything shipped.

- Keystore: `credentials/quietfeed-release.keystore` (RSA 2048, valid to 2053), random
  28-char password, credentials in `credentials/keystore.json`.
- **Both are gitignored** (`/credentials`) — `keystore.json` holds the password.
- `plugins/withReleaseSigning.js` — an Expo config plugin that injects the release signing
  config on every `expo prebuild`. Needed because `android/` is regenerated each time and
  would otherwise **silently revert to the debug key**. It fails loudly if the RN template
  changes shape, and warns (rather than failing) if `keystore.json` is absent.

> ⚠️ **Back up `credentials/` somewhere safe.** It is gitignored by design, so it exists only
> on this Mac. Lose it and you cannot ship an update that installs over the existing app —
> every user would have to uninstall and reinstall.
6. **First build** — ✅ **it compiles.** `BUILD SUCCESSFUL in 19m 28s` (first run; most of that
   was downloading Gradle 9.3.1 + dependencies — later builds are far quicker). Only benign
   `react-native-gesture-handler` Kotlin deprecation warnings. **The first time this code has
   ever been built.**
7. **Screen verification + fixes** — ⏳ walk everything on the phone; fix what the never-run
   code actually got wrong. **This is where the real remaining work is.** Blind for now (no
   USB), so it depends on your report of what breaks.
8. **Assets** — icon + splash.

### APK size

The universal APK is **88MB**, because the RN template builds four architectures:
`reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64`.

`x86` / `x86_64` are **emulator-only** — no physical phone uses them, and on Apple Silicon
even Android emulators run arm64 images. Pure dead weight here. Dropping them is zero-risk.
Also dropping `armeabi-v7a` (32-bit ARM, pre-~2017 phones) shrinks it further but would
exclude any older phone in the circle. The Poco F6 is `arm64-v8a`.

Pass it at build time — **do not edit `android/gradle.properties`; prebuild regenerates it**:

```bash
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

**Not changed** — it alters what ships, so it's your call.

### What changed in `eas.json`

*(Kept for reference. EAS is no longer needed now that builds are local, but the file is
valid if you ever want cloud builds.)*

The old file would not have worked:
- `production` built an **app-bundle (AAB)** — a Play Store artifact that **cannot be
  sideloaded**. Now `apk` on every profile.
- **No `env` block.** `.env` is gitignored, so EAS never uploads it → the APK would have
  built with no `EXPO_PUBLIC_API_URL` and `config.ts:2` silently falls back to
  `http://localhost:8080`. **The app would have installed and then failed to reach the
  backend with no obvious cause.** Values now live in `eas.json` (they are public — the web
  app already inlines the same client ID via `VITE_GOOGLE_CLIENT_ID`).
- `channel` fields required `expo-updates`, which is not installed. Removed.
- `submit` (Play Store) removed. `cli.version` floor raised 5.9 → 21.
- Added a `development` profile (`developmentClient: true`) — needed because **native Google
  Sign-In does not work in Expo Go**.

Optional, only if wanted:
- **EAS Update (OTA)** — ship JS changes without re-sharing the APK. Useful with no store,
  but not required to ship.
- Anything in §10 (observations) — none of it is scheduled.

---

## 9. Open items

**Toolchain — not on the critical path.** No JDK/Android Studio here (`ANDROID_HOME` unset),
and **none needed**: EAS builds in the cloud and the APK installs on a real phone. Install
Android Studio only if you want an emulator for faster iteration.

**Accounts:**
- [ ] Free **Expo account** — for EAS builds. *(The only account still required.)*
- [x] ~~Google Play Developer ($25)~~ — not needed.
- [x] ~~Apple Developer Program ($99/yr)~~ — **iOS dropped.**

**Config:**
- [ ] **Android OAuth client** — SHA-1 from `eas credentials`.
- [ ] Confirm package name: `app.quietfeed`.
- [x] ~~Privacy policy, Data safety, App Privacy, store listings~~ — dropped with the stores.

**Assets:**
- [ ] App icon + splash art (`assets/` does not exist).

---

## 10. Observations — information only, NOT planned work

Recorded because they were found while reviewing the repo (§5 was an explicitly requested
review). **None of these are scheduled, none block the Android app, and none are things I
will act on unless you ask.** All of them describe the *existing* system and are unchanged by
shipping the app.

1. **`fetchWholePlaylist` truncates silently at 600 videos** (`service.ts:114`,
   `maxPages = 12` × 50/page). Because `registerPlaylist` feeds course totals and "mark all
   watched", a longer course playlist yields **quietly wrong progress** with no signal.
   Affects web today. *(A genuine bug, not a preference.)*

2. **Playlist durations are the one unbounded quota path** (§5.1) — `computePlaylistDurations`
   fetches every listed playlist in full; `playlist:<id>` has a 60-minute TTL and the worker
   never warms it. Realistically ~2,400–4,800 units/day, worst case ~28,800 against a 10,000
   quota. Hasn't bitten because the circle is small. A longer TTL would defuse it.

3. **No sign-in allowlist.** `upsertUserFromGoogle` (`repos/users.ts:25`) creates a user for
   any verified Google profile; `ADMIN_EMAILS` sets *role* only. Access is by distribution
   (who has the URL / APK). This is how the web app works today and matches "same as web."

4. **`cached()` has no single-flight lock** (`cache.ts:23`) — concurrent cold requests each
   run the loader. Negligible at this scale.

5. **No negative caching** — failing loaders retry every request. Largely self-limiting;
   Google doesn't charge quota for `quotaExceeded` rejections.

6. **Expo's default Android permissions are broader than this app needs.** The generated
   manifest requests `SYSTEM_ALERT_WINDOW` (draw over other apps), `VIBRATE`, and
   `READ_/WRITE_EXTERNAL_STORAGE` alongside the `INTERNET` it actually uses. These are Expo
   defaults, not something the code asks for — but people you share the APK with will see
   them on install. Trimmable via `android.permissions` / `blockedPermissions` in
   `app.config.ts`. **Not changed** — it alters what the build produces, so it's your call.

7. **`orientation: 'portrait'` is locked** (`app.config.ts`). Fine for the feed; worth
   knowing it constrains fullscreen landscape video in the player. Matches nothing in
   particular on web (browsers rotate freely), so this is the one place the port is *not*
   automatically at parity. **Not changed.**
