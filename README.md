# 📺 Quiet Feed

> A private, ad-free YouTube learning companion — curated channels, distraction-free playback, background audio, and per-user progress tracking — deployed as a full-stack web app with an optional native Android client.

---

## Table of Contents

1. [What Is This?](#what-is-this)
2. [Architecture Overview](#architecture-overview)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [API Reference](#api-reference)
6. [Prerequisites](#prerequisites)
7. [Step-by-Step: Run Locally](#step-by-step-run-locally)
8. [Step-by-Step: Deploy on a Cloud Server (Ubuntu/EC2)](#step-by-step-deploy-on-a-cloud-server-ubuntuec2)
9. [Step-by-Step: Build the Android App](#step-by-step-build-the-android-app)
10. [Environment Variables Reference](#environment-variables-reference)
11. [Useful Commands](#useful-commands)
12. [Troubleshooting](#troubleshooting)

---

## What Is This?

Quiet Feed is a **self-hosted, multi-user YouTube learning app** built for distraction-free video consumption. An admin curates a list of YouTube channels; signed-in users browse videos from those channels, watch them with background audio support, and their watch progress is saved server-side.

### Key Features

- 🔑 **Google Sign-In** — secure OAuth 2.0 login, no passwords
- 👑 **Admin / User roles** — admins manage channels, users watch
- 🎥 **Distraction-free player** — no recommendations, no comments
- 🔇 **Background audio** — phone screen can lock while audio plays (Android)
- 📈 **Per-user progress tracking** — resume where you left off across devices
- ⚡ **YouTube quota-efficient** — one shared server-side cache; 1 user or 10,000 users cost the same YouTube API quota
- 📱 **Android app** — React Native + Expo native client (APK)
- 🌐 **Web app** — React SPA served via nginx, accessible from any browser

---

## Architecture Overview

```
                          ┌────────────────────────────────┐
  Browser / Android App   │         Nginx (Port 80)         │
  ─────────────────────▶  │  • Serves React SPA (static)    │
                          │  • Proxies /api/* → server:3000 │
                          └──────────────┬─────────────────┘
                                         │ HTTP (internal)
                                         ▼
                          ┌─────────────────────────────────┐
                          │     Node.js / Express (Port 3000) │
                          │  • Google OAuth token verification │
                          │  • Session management (JWT cookie) │
                          │  • Channel & video management     │
                          │  • YouTube Data API v3 proxy      │
                          │  • Per-user progress CRUD         │
                          │  • Background refresh worker      │
                          └──────────┬──────────────────────┘
                     SQL             │          HTTPS
           ┌─────────────────────────┘          │
           ▼                                    ▼
  ┌─────────────────┐               ┌───────────────────────┐
  │  PostgreSQL 16  │               │  YouTube Data API v3   │
  │  (Docker vol.)  │               │  (Google Cloud)        │
  └─────────────────┘               └───────────────────────┘
```

### How Data Flows

1. **User opens the web app or Android app** → Nginx/CDN serves the React SPA.
2. **User signs in with Google** → The client sends the Google ID token to `POST /api/auth/google`. The server verifies it with Google, creates/finds the user in Postgres, and returns a signed session cookie.
3. **User browses channels** → React calls `GET /api/channels`. The server reads admin-curated channels from Postgres.
4. **User opens a channel** → React calls `GET /api/channels/:id/uploads`. The server checks its Postgres cache. If stale, it fetches from the YouTube Data API, stores the result, and returns it. If fresh, no YouTube call is made.
5. **User watches a video** → The embedded YouTube iframe player handles streaming. The client ticks progress to `PUT /api/progress` every few seconds.
6. **Background worker** — runs inside the server container every `REFRESH_INTERVAL_MINUTES` to pre-warm stale channel caches so users never wait for a cold fetch.

### Why Quota Is Never a Problem

Every user watches videos from the **same admin-curated set of channels**. The server fetches each channel once and caches it. Whether you have 1 or 10,000 users, only the number of channels determines YouTube API usage.

---

## Tech Stack

### Backend (`/server`)

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Database | PostgreSQL 16 |
| DB client | `pg` (node-postgres) |
| Auth | Google OAuth 2.0 (`google-auth-library`) + JWT session cookies (`jsonwebtoken`) |
| Env validation | Zod |
| Security | Helmet, CORS |
| Background jobs | In-process `setInterval` refresh worker |

### Frontend Web App (`/source`)

| Component | Technology |
|-----------|-----------|
| Framework | React 18 |
| Language | TypeScript 5 |
| Build tool | Vite 5 |
| State management | Zustand 4 |
| Animations | Framer Motion 11 |
| Styling | Tailwind CSS 3 + Vanilla CSS |
| Served by | Nginx 1.27 (inside Docker) |

### Android Mobile App (`/mobile-rn`)

| Component | Technology |
|-----------|-----------|
| Framework | React Native 0.86 + Expo SDK 57 |
| Language | TypeScript 6 |
| Navigation | React Navigation v7 (Stack + Drawer + BottomTabs) |
| State management | Zustand 5 |
| Auth | `@react-native-google-signin/google-signin` |
| Token storage | `expo-secure-store` |
| Video player | `react-native-youtube-iframe` (embedded WebView) |
| Animations | React Native Reanimated 4 + Gesture Handler |
| Background audio | Custom native `AudioForegroundService` (Kotlin) |
| Lock screen controls | Android `MediaSession` + `MediaStyle` notification |
| Native module | `expo-pip` (custom Expo module for PiP + playback state bridge) |
| Build system | Gradle (Android) |

### Infrastructure

| Component | Technology |
|-----------|-----------|
| Containerization | Docker + Docker Compose |
| Reverse proxy | Nginx |
| Database | PostgreSQL 16 (Alpine Docker image) |
| TLS (production) | Let's Encrypt via Caddy or AWS ALB |

---

## Project Structure

```
quiet-feed/
├── .env.example              # Template for all required environment variables
├── .env                      # Your actual secrets (never commit this!)
├── docker-compose.yml        # Full stack: db + server + web (nginx)
├── DEPLOY.md                 # Legacy deployment notes
│
├── source/                   # React web frontend (SPA)
│   ├── Dockerfile            # Builds SPA with Vite, serves via nginx
│   ├── src/
│   │   ├── App.tsx           # Root component, routing
│   │   ├── store.ts          # Zustand global state + all API calls
│   │   ├── index.css         # All styles (dark theme)
│   │   ├── components/       # Player, Shell, Auth, Feed, etc.
│   │   └── lib/              # YouTube helpers, format utilities, progress logic
│   └── vite.config.ts
│
├── server/                   # Node.js + Express API backend
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts          # App entry point, Express setup
│   │   ├── env.ts            # Zod-validated environment config (fails fast)
│   │   ├── auth/             # Google OAuth verification, JWT session middleware
│   │   ├── db/               # Postgres pool, schema migrations (schema.sql)
│   │   ├── routes/           # channels.ts, content.ts, progress.ts
│   │   ├── repos/            # Data access layer (SQL queries)
│   │   ├── youtube/          # YouTube Data API v3 client + cache logic
│   │   └── worker/           # Background refresh worker
│   └── package.json
│
├── mobile-rn/                # React Native + Expo Android/iOS app
│   ├── app.config.ts         # Expo app configuration (name, package, plugins)
│   ├── App.tsx               # Root component
│   ├── android/              # Native Android project (Gradle, Kotlin)
│   │   └── app/src/main/java/app/quietfeed/
│   │       └── MainActivity.kt  # AudioForegroundService, MediaSession, wakelock
│   ├── modules/
│   │   └── expo-pip/         # Custom native Expo module (PiP + playback bridge)
│   ├── plugins/
│   │   ├── withBackgroundAudio.js  # Expo config plugin: injects foreground service
│   │   └── withReleaseSigning.js   # Expo config plugin: APK signing config
│   └── src/
│       ├── screens/          # LoginScreen, FeedScreen, PlaylistsScreen, etc.
│       ├── components/       # PlayerOverlay, VideoCard, ChannelDrawer
│       ├── navigation/       # Stack + Drawer + BottomTabs setup
│       ├── lib/              # api.ts, auth.ts, progress.ts, format.ts
│       ├── store.ts          # Zustand store (full app state + server sync)
│       └── theme.ts          # Color palette + spacing tokens
│
└── deploy/
    └── nginx.conf            # Nginx config: serves SPA, proxies /api to server
```

---

## API Reference

All endpoints live under `/api`. Authentication is via an HTTP-only session cookie set by `/api/auth/google`.

| Method | Path | Auth Required | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/health` | None | Health check → `{ ok: true }` |
| `POST` | `/api/auth/google` | None | Verify Google ID token, create session |
| `GET` | `/api/auth/me` | None | Current logged-in user or `null` |
| `POST` | `/api/auth/logout` | User | Clear session cookie |
| `GET` | `/api/channels` | User | List all admin-curated channels |
| `POST` | `/api/channels` | **Admin** | Add a channel (by `@handle`, URL, or `UC…` ID) |
| `DELETE` | `/api/channels/:id` | **Admin** | Remove a channel |
| `GET` | `/api/channels/:id/uploads` | User | Paginated video list (cached) |
| `GET` | `/api/channels/:id/playlists` | User | Paginated playlist list (cached) |
| `GET` | `/api/playlists/:id` | User | All videos in a playlist (cached) |
| `GET` | `/api/videos/:id/meta` | User | Video description + view count (cached) |
| `GET` | `/api/progress` | User | Fetch this user's watch progress |
| `PUT` | `/api/progress` | User | Save this user's watch progress |

---

## Prerequisites

Before you start, install and set up the following. Each item includes what you need to do.

### For Running Locally (Web App Only)

| Tool | Version | How to Install |
|------|---------|---------------|
| **Docker Desktop** | Latest | https://docs.docker.com/get-docker/ |
| **Docker Compose** | v2+ (bundled with Docker Desktop) | Included with Docker Desktop |
| **Google Cloud account** | — | https://console.cloud.google.com |
| **YouTube Data API v3 key** | — | See step below |
| **Google OAuth Web Client ID** | — | See step below |

### For Building the Android App (Additional)

| Tool | Version | How to Install |
|------|---------|---------------|
| **Node.js** | 20+ | https://nodejs.org or `brew install node` |
| **JDK** (Java 17+) | 17 | `brew install --cask temurin` (Mac) or `sudo apt install default-jdk` |
| **Android Studio** | Latest | https://developer.android.com/studio |
| **Android SDK** | API 36 | Installed via Android Studio → SDK Manager |
| **Gradle** | Bundled | Included in `/mobile-rn/android/` |

---

### One-Time Google Cloud Setup

You need two things from Google Cloud. Do this once.

#### Step A — YouTube Data API Key

1. Go to https://console.cloud.google.com
2. Create a new project (top-left dropdown → **New Project**)
3. In the left sidebar → **APIs & Services** → **Library**
4. Search **YouTube Data API v3** → Click it → Click **Enable**
5. Go to **APIs & Services** → **Credentials** → **+ Create Credentials** → **API key**
6. Copy the key (starts with `AIza...`) — this is your `YOUTUBE_API_KEY`
7. *(Optional but recommended)* Click **Restrict Key** → Application restrictions → IP addresses → add your server's IP

#### Step B — Google OAuth Web Client ID

1. Still in Google Cloud → **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Choose **Web application**
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8080` (for local development)
   - Your production domain, e.g. `https://yourdomain.com` (when deploying)
5. Click **Create**
6. Copy the **Client ID** (looks like `123456789-abc123.apps.googleusercontent.com`) — this is your `GOOGLE_CLIENT_ID`

---

## Step-by-Step: Run Locally

These instructions assume you have Docker Desktop installed and running.

### Step 1 — Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/quiet-feed.git
cd quiet-feed
git checkout feature/microservices-migration
```

### Step 2 — Create Your Environment File

```bash
cp .env.example .env
```

Now open `.env` in any text editor and fill in every value:

```bash
# Database credentials (you can use any values for local setup)
POSTGRES_USER=quietfeed
POSTGRES_PASSWORD=my-super-secret-password-123
POSTGRES_DB=quietfeed

# From Google Cloud — your OAuth Web Client ID
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com

# Your own email — this account gets admin rights to manage channels
ADMIN_EMAILS=you@gmail.com

# Generate a random secret: run this in terminal → openssl rand -hex 32
SESSION_SECRET=paste-the-64-char-hex-output-here
SESSION_TTL_DAYS=30

# From Google Cloud — your YouTube Data API v3 key
YOUTUBE_API_KEY=AIzaSyABC123...

# Cache settings (you can leave these as-is)
CACHE_TTL_MINUTES=60
REFRESH_INTERVAL_MINUTES=30

# Leave false for local HTTP
COOKIE_SECURE=false

# Leave blank — frontend and API are on the same origin
CORS_ORIGIN=

# The local port the web app will be available on
WEB_PORT=8080
```

> **Tip:** Generate the `SESSION_SECRET` by running: `openssl rand -hex 32`

### Step 3 — Start the Full Stack

```bash
docker compose up -d --build
```

This command will:
- Pull the PostgreSQL 16 Docker image
- Build the Node.js server Docker image
- Build the React SPA with Vite and package it inside an nginx Docker image
- Start all three containers and connect them on an internal Docker network
- Run automatic database schema migrations on first start

The first build takes ~2-5 minutes. Subsequent starts are much faster.

### Step 4 — Verify Everything Is Running

```bash
docker compose ps
```

You should see three services all with status `Up`:
```
NAME              STATUS
quiet-feed-db-1     Up (healthy)
quiet-feed-server-1  Up
quiet-feed-web-1    Up
```

Check the health endpoint:
```bash
curl http://localhost:8080/api/health
# Expected output: {"ok":true,"ts":1234567890}
```

### Step 5 — Open the App

Open your browser and go to: **http://localhost:8080**

1. Click **Sign in with Google**
2. Choose the Google account whose email matches `ADMIN_EMAILS` in your `.env`
3. You'll be logged in as an **Admin**
4. Go to **Settings** → **Channels** → Add a YouTube channel by its `@handle` (e.g. `@mkbhd`) or channel URL

### Step 6 — Stop the App

```bash
docker compose down
```

Your database data is preserved in a Docker volume (`dbdata`). To also delete the database:
```bash
docker compose down -v
```

---

## Step-by-Step: Deploy on a Cloud Server (Ubuntu/EC2)

### Step 1 — Launch an Ubuntu Server

- On AWS EC2, choose **Ubuntu 22.04 or 24.04 LTS**
- Instance type: **t3.small** is enough to start
- Security Group inbound rules:
  - Port **22** (SSH) — from your IP only
  - Port **80** (HTTP) — from anywhere (`0.0.0.0/0`)
  - Port **443** (HTTPS) — from anywhere (for TLS later)

### Step 2 — SSH Into Your Server

```bash
ssh -i your-key.pem ubuntu@YOUR_SERVER_IP
```

### Step 3 — Install Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Verify:
```bash
docker --version
docker compose version
```

### Step 4 — Get the Code on the Server

**Option A — Git clone:**
```bash
git clone https://github.com/YOUR_USERNAME/quiet-feed.git
cd quiet-feed
git checkout feature/microservices-migration
```

**Option B — SCP from your Mac:**
```bash
scp -i your-key.pem -r /path/to/quiet-feed ubuntu@YOUR_SERVER_IP:~/quiet-feed
```

### Step 5 — Configure Environment

```bash
cd ~/quiet-feed
cp .env.example .env
nano .env
```

Fill in all values exactly as described in [Step 2 of the local guide](#step-2--create-your-environment-file), with these differences for production:

```bash
COOKIE_SECURE=true          # Must be true when serving over HTTPS
WEB_PORT=80                 # Serve directly on port 80
CORS_ORIGIN=                # Leave blank — same origin
```

Also add your production domain to **Authorized JavaScript origins** in Google Cloud Console (e.g., `https://yourdomain.com`).

### Step 6 — Start the App

```bash
docker compose up -d --build
```

Check it's running:
```bash
docker compose ps
curl http://YOUR_SERVER_IP/api/health
```

Visit `http://YOUR_SERVER_IP` in your browser.

### Step 7 — Set Up HTTPS with Caddy (Recommended)

Caddy automatically provisions Let's Encrypt TLS certificates. Your server must have a real domain name pointing to it.

**Install Caddy:**
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

**Edit the Caddyfile:**
```bash
sudo nano /etc/caddy/Caddyfile
```

Replace contents with:
```
yourdomain.com {
    reverse_proxy localhost:8080
}
```

**Restart Caddy:**
```bash
sudo systemctl restart caddy
```

Caddy will automatically get and renew a TLS certificate. Your app is now live at `https://yourdomain.com`.

Finally, update your `.env`:
```bash
nano .env
# Set: COOKIE_SECURE=true
docker compose up -d --build  # restart to pick up changes
```

---

## Step-by-Step: Build the Android App

### Step 1 — Install Prerequisites

1. Install **Node.js 20+**: https://nodejs.org
2. Install **JDK 17**: `brew install --cask temurin` (Mac) or from https://adoptium.net
3. Install **Android Studio**: https://developer.android.com/studio
4. In Android Studio → SDK Manager → Install:
   - Android SDK Platform 36
   - Android SDK Build-Tools 36.0.0
   - NDK (Side by side) — any recent version

### Step 2 — Set Up Environment Variables

Add these to your shell profile (`~/.zshrc` or `~/.bash_profile`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"   # Mac path (adjust if on Linux)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"  # Mac
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools"
```

Apply:
```bash
source ~/.zshrc
```

### Step 3 — Configure the Mobile App

```bash
cd mobile-rn
cp .env.example .env
nano .env
```

Fill in:
```bash
# Your deployed backend URL (no trailing slash)
EXPO_PUBLIC_API_URL=https://yourdomain.com

# Same Google OAuth Web Client ID as the server
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

### Step 4 — Install JavaScript Dependencies

```bash
cd mobile-rn
npm install
```

### Step 5 — Add SHA-1 Fingerprint to Google Cloud (for Google Sign-In)

Get the SHA-1 of your release keystore:
```bash
keytool -list -v -keystore credentials/quietfeed-release.keystore -alias quietfeed -storepass YOUR_KEYSTORE_PASS | grep SHA1
```

Go to **Google Cloud Console** → **APIs & Services** → **Credentials** → your OAuth Client → **Add Android app** → enter:
- Package name: `app.quietfeed`
- SHA-1 fingerprint: the value from above

### Step 6 — Build the Release APK

```bash
cd android
./gradlew assembleRelease
```

The APK will be at:
```
android/app/build/outputs/apk/release/app-release.apk
```

Install on a connected Android device:
```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | Yes | `quietfeed` | PostgreSQL username |
| `POSTGRES_PASSWORD` | **Yes** | — | PostgreSQL password (use a strong random value) |
| `POSTGRES_DB` | Yes | `quietfeed` | PostgreSQL database name |
| `GOOGLE_CLIENT_ID` | **Yes** | — | Google OAuth 2.0 Web Client ID |
| `ADMIN_EMAILS` | Yes | — | Comma-separated list of admin email addresses |
| `SESSION_SECRET` | **Yes** | — | Secret for signing JWT session cookies (min 16 chars; use 32+ hex chars) |
| `SESSION_TTL_DAYS` | No | `30` | How many days a login session stays valid |
| `YOUTUBE_API_KEY` | **Yes** | — | YouTube Data API v3 server-side key |
| `CACHE_TTL_MINUTES` | No | `60` | How long cached YouTube responses are considered fresh |
| `REFRESH_INTERVAL_MINUTES` | No | `30` | How often the background worker re-warms the cache (0 = disabled) |
| `COOKIE_SECURE` | No | `false` | Set to `true` when serving over HTTPS |
| `CORS_ORIGIN` | No | `` (empty) | Allowed CORS origin(s); leave blank when frontend and API share an origin |
| `WEB_PORT` | No | `8080` | Host port the nginx web container is published on |

**Mobile app only (`mobile-rn/.env`):**

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | **Yes** | Base URL of the deployed backend (no trailing slash) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | **Yes** | Same Google OAuth Web Client ID as the server |

---

## Useful Commands

### Docker

```bash
# Start everything in the background
docker compose up -d --build

# View live logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f server
docker compose logs -f web

# Restart a single service
docker compose restart server

# Stop everything (keep data)
docker compose down

# Stop everything AND delete the database volume
docker compose down -v

# Check running containers
docker compose ps

# Back up the database
docker compose exec db pg_dump -U quietfeed quietfeed > backup.sql

# Restore from backup
cat backup.sql | docker compose exec -T db psql -U quietfeed quietfeed
```

### Android Build

```bash
# Build release APK (from mobile-rn/android/)
./gradlew assembleRelease

# Clean build cache (if something is broken)
./gradlew clean

# Install APK on connected device via ADB
adb install -r app/build/outputs/apk/release/app-release.apk

# View connected devices
adb devices
```

### Development (No Docker)

```bash
# Run the server in dev mode with hot reload
cd server && npm install && npm run dev

# Run the web frontend in dev mode
cd source && npm install && npm run dev

# Run the mobile app with Expo dev server
cd mobile-rn && npm install && npx expo start
```

---

## Troubleshooting

### "POSTGRES_PASSWORD is not set" error on startup

Make sure you copied `.env.example` to `.env` and filled in all required values.

```bash
cp .env.example .env
nano .env   # fill in POSTGRES_PASSWORD, GOOGLE_CLIENT_ID, SESSION_SECRET, YOUTUBE_API_KEY
```

### Can't sign in with Google (login loop)

1. Check that `GOOGLE_CLIENT_ID` in `.env` exactly matches the Client ID in Google Cloud Console.
2. Check that your URL (e.g. `http://localhost:8080`) is listed under **Authorized JavaScript origins** in the Google Cloud OAuth client.
3. On HTTPS production: make sure `COOKIE_SECURE=true` is set.

### Google Sign-In fails on Android

The SHA-1 fingerprint of your release keystore must be registered in Google Cloud:
1. Get the SHA-1: `keytool -list -v -keystore credentials/quietfeed-release.keystore ...`
2. Add it to your Android OAuth client in Google Cloud Console.

### "Bad Gateway" or 502 errors

The `web` nginx container can't reach the `server` container. Check server logs:
```bash
docker compose logs server
```
A common cause is a missing or invalid environment variable causing the server to crash on startup. Look for "Invalid environment:" in the logs.

### APK build fails with JAVA_HOME error

Make sure Java 17+ is installed and the `JAVA_HOME` environment variable is set correctly:
```bash
echo $JAVA_HOME
java -version
```

### Videos don't load / YouTube API errors

Your `YOUTUBE_API_KEY` may be invalid, expired, or quota-exceeded. Check:
1. The key is enabled for **YouTube Data API v3** in Google Cloud.
2. The key doesn't have HTTP referrer restrictions (use IP or no restriction for server-side keys).
3. Your project hasn't exceeded its daily quota (10,000 units/day on the free tier).

---

## License

Private repository. All rights reserved.
