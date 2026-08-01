# 📺 Quiet Feed

> A private, ad-free YouTube learning companion — curated channels, distraction-free playback, background audio, and per-user progress tracking.

---

## Table of Contents

1. [What Is This?](#what-is-this)
2. [Architecture — DevOps / Build & Release View](#architecture--devops--build--release-view)
   - [Current State vs. Target State](#current-state-vs-target-state)
   - [Service Inventory](#service-inventory)
   - [Service Dependency & Startup Order](#service-dependency--startup-order)
   - [Internal Communication Map](#internal-communication-map)
   - [Port Allocation](#port-allocation)
   - [Data Stores](#data-stores)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [API Reference](#api-reference)
6. [Prerequisites](#prerequisites)
7. [Environment Variables Reference](#environment-variables-reference)
8. [One-Time Google Cloud Setup](#one-time-google-cloud-setup)
9. [Running the Full Stack Locally — No Containers](#running-the-full-stack-locally--no-containers)
10. [Building the Android APK](#building-the-android-apk)
11. [Useful Commands](#useful-commands)
12. [Troubleshooting](#troubleshooting)

---

## What Is This?

Quiet Feed is a **self-hosted, multi-user YouTube learning app**. An admin curates a list of YouTube channels; signed-in users browse videos, watch them with background audio, and their watch progress is saved server-side.

**Key features:**
- Google OAuth 2.0 login (no passwords)
- Admin / User roles — admins manage channels, users watch
- Distraction-free player (no recommendations, no comments)
- Background audio on Android (screen can lock while audio continues)
- Per-user watch progress — resume across devices
- YouTube quota-efficient — one shared server-side cache per channel
- Native Android APK (React Native + Expo)
- Web SPA (React + Vite) served via reverse proxy

---

## Architecture — DevOps / Build & Release View

### Current State vs. Target State

This branch (`feature/microservices-migration`) is a **work in progress**. Two states exist:

| State | Description |
|-------|-------------|
| ✅ **Fully built (runs today)** | A single Node.js monolith (`/server`) handles auth, content, progress, and background refresh in one process. This is what can be run right now. |
| 🚧 **Target (in progress)** | A microservices decomposition is planned: Auth, Content, Progress, Worker, and API Gateway as separate services. The `docker-compose.yml` on this branch maps it out. The individual service source folders under `/services/` are still being implemented. |

The rest of this document describes how to run the **current working system (monolith)**.

---

### Service Inventory

#### Current Architecture — Monolith (What Runs Today)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [1] PostgreSQL 16  — one shared database                            │
│     Tables: users, channels, content_cache, progress               │
├─────────────────────────────────────────────────────────────────────┤
│ [2] Node.js API Server (port 3000)  — single process                │
│     ├─ Auth module       Google OAuth token verify, JWT cookies     │
│     ├─ Channels module   admin CRUD for channel list                │
│     ├─ Content module    YouTube API proxy + Postgres cache         │
│     ├─ Progress module   per-user watch progress read/write         │
│     └─ Refresh worker    background setInterval re-warms cache      │
├─────────────────────────────────────────────────────────────────────┤
│ [3] Nginx / Vite dev server (port 8080 / 5173)                      │
│     Serves React SPA static files + reverse proxies /api → :3000   │
├─────────────────────────────────────────────────────────────────────┤
│ [4] React SPA  — runs in the user's browser (client-side)          │
│ [5] Android APK  — optional native client                          │
└─────────────────────────────────────────────────────────────────────┘
```

#### Target Architecture — Microservices (Planned)

```
Infrastructure Layer  (must be FULLY UP before any service starts)
──────────────────────────────────────────────────────────────────
[1] PostgreSQL 16    port 5432    one separate DB per service
[2] Redis            port 6379    in-memory cache for content_service
[3] RabbitMQ         port 5672    message broker for async refresh jobs
                     port 15672   management/admin UI

Application Services  (start in parallel AFTER infrastructure is ready)
──────────────────────────────────────────────────────────────────────
[4] auth_service      port 3001   Google OAuth, session cookies, user roles
[5] content_service   port 3002   YouTube proxy, PostgreSQL + Redis cache,
                                  publishes refresh jobs → RabbitMQ
[6] progress_service  port 3003   per-user watch progress CRUD
[7] worker_service    no port     consumes RabbitMQ refresh jobs,
                                  calls YouTube API, warms cache

Routing Layer  (start AFTER all application services are healthy)
─────────────────────────────────────────────────────────────────
[8] API Gateway       port 3000   nginx reverse proxy, routes by URL path:
                                   /api/auth/*     → auth_service:3001
                                   /api/channels/* → content_service:3002
                                   /api/progress/* → progress_service:3003

Presentation Layer  (start AFTER Gateway is healthy)
────────────────────────────────────────────────────
[9] Web (nginx)       port 8080   serves React SPA static files,
                                  proxies /api/* → Gateway:3000

[10] Browser / Android APK  — user-facing, requires Web to be up
```

---

### Service Dependency & Startup Order

**This is critical. Never start a service before its dependency is healthy.** Starting out of order causes connection refused errors or silent data corruption.

```
STEP  SERVICE               DEPENDS ON         READINESS CHECK
────  ──────────────────    ───────────────    ────────────────────────────────────
 1.   PostgreSQL            (none)             pg_isready -U quietfeed -d quietfeed
                                               → "accepting connections"

 2.   Redis                 (none)             redis-cli ping → "PONG"
      ⚠ Only needed for microservices target

 3.   RabbitMQ              (none)             rabbitmq-diagnostics check_port_connectivity
      ⚠ Only needed for microservices target   OR: curl -s http://localhost:15672 returns HTML

──── Wait for steps 1-3 before proceeding ──────────────────────────────────────

 4a.  Node.js server        PostgreSQL         curl http://localhost:3000/api/health
      [MONOLITH]                               → {"ok":true}

 4b.  auth_service          PostgreSQL         curl http://localhost:3001/health
      content_service       PostgreSQL         curl http://localhost:3002/health
      progress_service      Redis              curl http://localhost:3003/health
      worker_service        RabbitMQ           check process is running (no HTTP port)
      [MICROSERVICES]       RabbitMQ
      ↳ All four can start in parallel

──── Wait for step 4a OR step 4b before proceeding ────────────────────────────

 5.   API Gateway (nginx)   4a or 4b           curl http://localhost:3000/api/health

──── Wait for step 5 before proceeding ────────────────────────────────────────

 6.   Web nginx /           Gateway (step 5)   http://localhost:8080 returns HTML
      Vite dev server

──── Step 7 is user-facing ─────────────────────────────────────────────────────

 7.   Browser / Android     Web (step 6)       App loads and Google sign-in works
```

---

### Internal Communication Map

```
FROM                    TO                      PROTOCOL    CONNECTION STRING
────────────────────    ──────────────────────  ─────────   ──────────────────────────────
Browser / APK           Web nginx               HTTP(S)     http://localhost:8080 (local)
Web nginx               API server              HTTP        proxy_pass http://localhost:3000
API server (monolith)   PostgreSQL              TCP/SQL     DATABASE_URL env var
API server (monolith)   YouTube Data API v3     HTTPS       outbound, needs internet access
auth_service            PostgreSQL              TCP/SQL     DATABASE_URL (quietfeed_auth DB)
content_service         PostgreSQL              TCP/SQL     DATABASE_URL (quietfeed_content DB)
content_service         Redis                   TCP         REDIS_URL env var
content_service         RabbitMQ                AMQP        RABBITMQ_URL env var (publisher)
progress_service        PostgreSQL              TCP/SQL     DATABASE_URL (quietfeed_progress DB)
worker_service          RabbitMQ                AMQP        RABBITMQ_URL env var (consumer)
worker_service          YouTube Data API v3     HTTPS       outbound, needs internet access
API Gateway             auth_service            HTTP        upstream localhost:3001
API Gateway             content_service         HTTP        upstream localhost:3002
API Gateway             progress_service        HTTP        upstream localhost:3003
```

> **Firewall rule:** Only port **8080** (or 80 in production) needs to be reachable from outside.
> All other ports are internal and should be blocked from the public internet.

---

### Port Allocation

| Service | Port | Protocol | Visibility |
|---------|------|----------|------------|
| PostgreSQL | `5432` | TCP | Internal only |
| Redis | `6379` | TCP | Internal only |
| RabbitMQ — AMQP | `5672` | AMQP | Internal only |
| RabbitMQ — Management UI | `15672` | HTTP | Internal only (dev debugging) |
| auth_service | `3001` | HTTP | Internal only |
| content_service | `3002` | HTTP | Internal only |
| progress_service | `3003` | HTTP | Internal only |
| API server (monolith) | `3000` | HTTP | Internal only |
| API Gateway (nginx) | `3000` | HTTP | Internal only |
| Web server (nginx / Vite) | `8080` | HTTP | **Public-facing** |

---

### Data Stores

| Store | Used By | What It Holds |
|-------|---------|---------------|
| PostgreSQL `quietfeed` (monolith) | server | `users`, `channels`, `content_cache`, `progress` |
| PostgreSQL `quietfeed_auth` | auth_service | `users` table |
| PostgreSQL `quietfeed_content` | content_service | `channels`, `content_cache` |
| PostgreSQL `quietfeed_progress` | progress_service | `progress` |
| Redis | content_service | Hot cache for YouTube API responses (TTL-based) |
| RabbitMQ | content_service → worker_service | Async job queue for cache refresh tasks |

> In the microservices model, each service **owns its own database** and never queries another service's DB directly. This is intentional service isolation.

---

## Tech Stack

### Backend API Server (`/server`)

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Express | 4.x |
| Language | TypeScript | 5.x |
| Database client | `pg` (node-postgres) | 8.x |
| Auth | `google-auth-library` + `jsonwebtoken` | — |
| Env validation | `zod` | 3.x |
| HTTP security | `helmet`, `cors` | — |
| Dev hot-reload | `tsx watch` | — |

### Frontend Web App (`/source`)

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 18.x |
| Language | TypeScript | 5.x |
| Build tool | Vite | 5.x |
| State management | Zustand | 4.x |
| Animations | Framer Motion | 11.x |
| Styling | Tailwind CSS + Vanilla CSS | 3.x |
| Dev server | Vite Dev Server | — |
| Production server | Nginx | 1.27 |

### Android Mobile App (`/mobile-rn`)

| Component | Technology |
|-----------|-----------|
| Framework | React Native 0.86 + Expo SDK 57 |
| Language | TypeScript |
| Navigation | React Navigation v7 |
| State management | Zustand 5 |
| Auth | `@react-native-google-signin/google-signin` |
| Secure token storage | `expo-secure-store` |
| Video player | `react-native-youtube-iframe` (WebView) |
| Animations | Reanimated 4 + Gesture Handler |
| Background audio | Custom Kotlin `AudioForegroundService` |
| Lock screen controls | Android `MediaSession` + `MediaStyle` notification |
| Native module bridge | Custom `expo-pip` Expo module |
| Build system | Gradle |

### Infrastructure (Target Microservices)

| Component | Technology | Version |
|-----------|-----------|---------|
| Message broker | RabbitMQ | 3.x |
| In-memory cache | Redis | Latest Alpine |
| Relational DB | PostgreSQL | 16 Alpine |
| API Gateway | Nginx | Alpine |

---

## Project Structure

```
quiet-feed/
├── .env.example              # All required env vars — copy to .env and fill in
├── .env                      # Your secrets — NEVER commit this file
├── docker-compose.yml        # Target microservices stack (for DevOps reference)
│
├── source/                   # React Web Frontend (SPA)
│   ├── src/
│   │   ├── App.tsx           # Root component, auth gate, view routing
│   │   ├── store.ts          # Zustand store — all API calls + global state
│   │   ├── index.css         # All styles (dark theme)
│   │   ├── components/       # Player, Shell, Auth, Feed UI components
│   │   └── lib/              # YouTube helpers, format utilities, progress logic
│   ├── vite.config.ts        # Vite config — must include /api proxy for local dev
│   └── package.json
│
├── server/                   # Node.js + Express API Backend (monolith — runs today)
│   ├── src/
│   │   ├── index.ts          # Express app entrypoint — mounts all routers
│   │   ├── env.ts            # Zod-validated env config — fails fast if misconfigured
│   │   ├── auth/             # Google ID token verify, JWT session middleware
│   │   ├── db/
│   │   │   ├── schema.sql    # PostgreSQL schema (idempotent, runs on every boot)
│   │   │   ├── migrate.ts    # Runs schema.sql against the connected DB
│   │   │   └── pool.ts       # pg connection pool
│   │   ├── routes/           # channels.ts, content.ts, progress.ts
│   │   ├── repos/            # SQL query functions (data access layer)
│   │   ├── youtube/          # YouTube Data API v3 client + Postgres cache
│   │   └── worker/           # Background refresh worker (setInterval)
│   └── package.json
│
├── services/                 # Microservices (work in progress — not yet runnable)
│   ├── content/              # content_service: YouTube proxy + cache
│   └── worker/               # worker_service: async refresh consumer
│
├── mobile-rn/                # React Native Android App
│   ├── app.config.ts         # Expo config (app name, package ID, plugins)
│   ├── App.tsx               # Root component
│   ├── android/              # Native Android project (Gradle + Kotlin)
│   │   └── app/src/main/java/app/quietfeed/
│   │       └── MainActivity.kt  # AudioForegroundService, MediaSession, wakelock
│   ├── modules/expo-pip/     # Custom Expo module: playback state bridge
│   ├── plugins/              # Expo config plugins (background audio, signing)
│   └── src/
│       ├── screens/          # LoginScreen, FeedScreen, PlaylistsScreen, etc.
│       ├── components/       # PlayerOverlay, VideoCard, ChannelDrawer
│       ├── navigation/       # Stack + Drawer + BottomTabs setup
│       ├── lib/              # api.ts, auth.ts, progress.ts, format.ts
│       ├── store.ts          # Zustand store
│       └── theme.ts          # Color palette + spacing tokens
│
└── deploy/
    └── nginx.conf            # Nginx: static SPA files + /api proxy rule
```

---

## API Reference

All endpoints are under `/api`. Authentication uses an HTTP-only session cookie set by `/api/auth/google`.

| Method | Path | Auth Required | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/health` | None | Health check → `{ ok: true }` |
| `POST` | `/api/auth/google` | None | Verify Google ID token, create session |
| `GET` | `/api/auth/me` | None | Current user or `null` |
| `POST` | `/api/auth/logout` | User | Clear session cookie |
| `GET` | `/api/channels` | User | List admin-curated channels |
| `POST` | `/api/channels` | **Admin** | Add channel by `@handle`, URL, or `UC…` ID |
| `DELETE` | `/api/channels/:id` | **Admin** | Remove a channel |
| `GET` | `/api/channels/:id/uploads` | User | Paginated video list (cached) |
| `GET` | `/api/channels/:id/playlists` | User | Paginated playlist list (cached) |
| `GET` | `/api/playlists/:id` | User | All videos in a playlist (cached) |
| `GET` | `/api/videos/:id/meta` | User | Video description + view count (cached) |
| `GET` | `/api/progress` | User | Fetch this user's watch progress |
| `PUT` | `/api/progress` | User | Save this user's watch progress |

---

## Prerequisites

Install everything below before running the project. Verify each tool using the command shown.

### For Running the Web + API Locally

| Tool | Min Version | Install | Verify Command |
|------|------------|---------|----------------|
| **Node.js** | 20 LTS | https://nodejs.org | `node -v` → `v20.x.x` |
| **npm** | 10+ | Bundled with Node.js | `npm -v` |
| **PostgreSQL** | 16 | Mac: `brew install postgresql@16`<br>Ubuntu: `sudo apt install postgresql-16` | `psql --version` |
| **Git** | Any | Mac: `brew install git`<br>Ubuntu: `sudo apt install git` | `git --version` |

### Additionally — For Building the Android APK

| Tool | Min Version | Install | Verify Command |
|------|------------|---------|----------------|
| **JDK** | 17 | Mac: `brew install --cask temurin@17`<br>Ubuntu: `sudo apt install openjdk-17-jdk` | `java -version` |
| **Android Studio** | Latest | https://developer.android.com/studio | Open the app |
| **Android SDK API** | 36 | Android Studio → SDK Manager → SDK Platforms | — |
| **Android Build Tools** | 36.0.0 | Android Studio → SDK Manager → SDK Tools | — |

---

## Environment Variables Reference

### API Server — `server/.env`

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development` or `production` |
| `PORT` | No | `3000` | Port the API server listens on |
| `DATABASE_URL` | **Yes** | — | Full Postgres connection string, e.g. `postgres://user:pass@localhost:5432/quietfeed` |
| `GOOGLE_CLIENT_ID` | **Yes** | — | Google OAuth 2.0 Web Client ID |
| `SESSION_SECRET` | **Yes** | — | JWT signing secret (min 16 chars; use `openssl rand -hex 32`) |
| `SESSION_TTL_DAYS` | No | `30` | Login session validity in days |
| `ADMIN_EMAILS` | No | `` | Comma-separated emails that get admin role on login |
| `YOUTUBE_API_KEY` | **Yes** | — | YouTube Data API v3 key (server-side only, never sent to browser) |
| `CACHE_TTL_MINUTES` | No | `60` | How long YouTube responses are considered fresh |
| `REFRESH_INTERVAL_MINUTES` | No | `30` | How often the background worker re-warms cache (0 = disabled) |
| `COOKIE_SECURE` | No | `false` | Set to `true` when running behind HTTPS |
| `CORS_ORIGIN` | No | `` | Allowed CORS origins (comma-separated); leave blank when on same origin |

### Web Frontend — `source/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GOOGLE_CLIENT_ID` | **Yes** | Google OAuth Web Client ID (inlined at build time by Vite) |

### Android App — `mobile-rn/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | **Yes** | Backend base URL, e.g. `http://192.168.1.100:3000` (local) or `https://yourdomain.com` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | **Yes** | Same Google OAuth Web Client ID as the server |

---

## One-Time Google Cloud Setup

Do this once. You need a YouTube API key and a Google OAuth Client ID.

### Step A — Create a Google Cloud Project

1. Open https://console.cloud.google.com
2. Top-left project dropdown → **New Project** → name it (e.g. `quiet-feed`) → **Create**
3. Confirm the new project is selected in the dropdown

### Step B — Enable YouTube Data API v3

1. Left sidebar → **APIs & Services** → **Library**
2. Search `YouTube Data API v3` → click it → click **Enable**

### Step C — Create the YouTube API Key

1. **APIs & Services** → **Credentials** → **+ Create Credentials** → **API key**
2. Copy the key (starts with `AIza...`) — this is `YOUTUBE_API_KEY`
3. *(Recommended)* Click **Restrict Key** → IP addresses → add your server's IP

### Step D — Create the OAuth 2.0 Web Client ID

1. **Credentials** → **+ Create Credentials** → **OAuth client ID** → **Web application**
2. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` ← Vite dev server
   - `http://localhost:8080` ← if testing production build locally
3. **Create** → copy the Client ID (`123456-abc.apps.googleusercontent.com`) — this is `GOOGLE_CLIENT_ID`

---

## Running the Full Stack Locally — No Containers

Run everything as **native processes** directly on your machine. No Docker required. This is the definitive guide for understanding how each service runs independently.

> Complete [Prerequisites](#prerequisites) and [Google Cloud Setup](#one-time-google-cloud-setup) before starting.

---

### Part 1 — Start PostgreSQL

**1.1 — Start the service**

macOS:
```bash
brew services start postgresql@16
```

Ubuntu:
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql    # auto-start on reboot
```

**1.2 — Confirm it's running**
```bash
pg_isready
# Expected: /tmp:5432 - accepting connections
```

**1.3 — Create the database user and database**

```bash
psql postgres
```

Inside the psql shell, run:
```sql
CREATE USER quietfeed WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE quietfeed OWNER quietfeed;
GRANT ALL PRIVILEGES ON DATABASE quietfeed TO quietfeed;
\q
```

**1.4 — Test the connection**
```bash
psql -U quietfeed -d quietfeed -h localhost -c "SELECT 1;"
# Expected: (1 row)
```

PostgreSQL is ready. Leave it running.

---

### Part 2 — Configure the API Server

**2.1 — Install dependencies**
```bash
cd /path/to/quiet-feed/server
npm install
```

**2.2 — Generate a session secret**
```bash
openssl rand -hex 32
# Save the output — you'll use it as SESSION_SECRET
```

**2.3 — Create `server/.env`**

Create a file called `.env` inside the `server/` directory:
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://quietfeed:choose-a-strong-password@localhost:5432/quietfeed
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
SESSION_SECRET=paste-the-64-char-hex-from-step-2.2-here
SESSION_TTL_DAYS=30
ADMIN_EMAILS=your-email@gmail.com
YOUTUBE_API_KEY=AIzaSy-your-youtube-key
CACHE_TTL_MINUTES=60
REFRESH_INTERVAL_MINUTES=30
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:5173
```

Replace every placeholder with real values.

**2.4 — Start the server**
```bash
npm run dev
```

Expected output:
```
[server] listening on :3000 (development)
[worker] refresh worker started, interval=30min
```

> The server runs `schema.sql` automatically on startup. All DB tables are created fresh on first boot.

**2.5 — Verify it's working**

Open a new terminal and run:
```bash
curl http://localhost:3000/api/health
# Expected: {"ok":true,"ts":1700000000000}
```

Keep this terminal running.

---

### Part 3 — Configure and Start the Web Frontend

**3.1 — Install dependencies**

Open another new terminal:
```bash
cd /path/to/quiet-feed/source
npm install
```

**3.2 — Create `source/.env`**

```bash
echo 'VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com' > .env
```

Replace with your actual Client ID.

**3.3 — Verify the API proxy is configured**

Open `source/vite.config.ts`. It should contain a `server.proxy` section:
```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
```

If this block is missing, add it. Without it, browser API calls will fail — they'll hit the Vite dev server on port 5173 instead of the Node server on port 3000.

**3.4 — Start the frontend dev server**
```bash
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in 300 ms
  ➜  Local:   http://localhost:5173/
```

**3.5 — Open the app in your browser**

Go to: **http://localhost:5173**

1. Click **Sign in with Google**
2. Sign in with the email listed in `ADMIN_EMAILS` in your `server/.env`
3. You now have admin access
4. Use the channel management UI to add YouTube channels by `@handle`

Keep this terminal running.

---

### Part 4 — Confirm All Three Processes Are Running

| # | Process | Terminal | Port | How to Check |
|---|---------|----------|------|-------------|
| 1 | PostgreSQL | (system service) | 5432 | `pg_isready` → "accepting connections" |
| 2 | Node.js API server | Terminal 1 | 3000 | `curl localhost:3000/api/health` → `{"ok":true}` |
| 3 | Vite dev server | Terminal 2 | 5173 | Browser at `http://localhost:5173` shows the app |

All three must be running. If any one of them stops, the app will stop working.

---

### Stopping Everything

```bash
# Terminal 1 — stop Node server:   Ctrl+C
# Terminal 2 — stop Vite server:   Ctrl+C

# Stop PostgreSQL:
brew services stop postgresql@16       # macOS
sudo systemctl stop postgresql         # Ubuntu
```

---

## Building the Android APK

### Step 1 — Configure Android Studio

1. Open **Android Studio**
2. **Tools** → **SDK Manager**
3. **SDK Platforms** tab → tick **Android API 36** → Apply
4. **SDK Tools** tab → tick **Android SDK Build-Tools 36.0.0** → Apply
5. Let it download and install

### Step 2 — Export Shell Environment Variables

Add to your `~/.zshrc` (macOS) or `~/.bashrc` (Ubuntu):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"    # macOS path
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"  # macOS
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools"
```

Apply:
```bash
source ~/.zshrc
```

Verify:
```bash
adb --version       # prints ADB version
java -version       # prints Java 17+
```

### Step 3 — Configure `mobile-rn/.env`

```bash
cd /path/to/quiet-feed/mobile-rn
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_API_URL=http://YOUR_MACHINE_LOCAL_IP:3000
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

> Use your machine's local network IP (not `localhost`). Find it:
> - macOS: `ipconfig getifaddr en0`
> - Ubuntu: `hostname -I | awk '{print $1}'`

### Step 4 — Install JS Dependencies

```bash
cd /path/to/quiet-feed/mobile-rn
npm install
```

### Step 5 — Register Android SHA-1 with Google (One-Time)

Google Sign-In on Android requires the release keystore's SHA-1 fingerprint to be registered in Google Cloud.

```bash
keytool -list -v \
  -keystore credentials/quietfeed-release.keystore \
  -alias quietfeed \
  -storepass YOUR_KEYSTORE_PASS \
  | grep SHA1
```

Take the `SHA1:` value and:
1. Go to **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Click your OAuth Client ID → **Add Android app**
3. Package name: `app.quietfeed`
4. SHA-1: paste the fingerprint
5. **Save**

### Step 6 — Build the Release APK

```bash
cd /path/to/quiet-feed/mobile-rn/android
./gradlew assembleRelease
```

First build: 5–10 minutes (downloads Gradle + Android dependencies).
Subsequent builds: 1–3 minutes.

APK location:
```
mobile-rn/android/app/build/outputs/apk/release/app-release.apk
```

### Step 7 — Install on an Android Device

Connect device via USB, enable **USB Debugging** (Developer Options), then:
```bash
adb install -r mobile-rn/android/app/build/outputs/apk/release/app-release.apk
```

---

## Useful Commands

### API Server
```bash
cd server
npm run dev          # dev mode with hot-reload (uses tsx watch)
npm run build        # compile TypeScript → dist/
npm start            # run compiled build (production)
npm run typecheck    # type-check only, no build output
```

### Web Frontend
```bash
cd source
npm run dev          # Vite dev server with HMR
npm run build        # production build → dist/
npm run preview      # serve production build locally
npm run typecheck    # type-check only
```

### PostgreSQL
```bash
# Open DB shell
psql -U quietfeed -d quietfeed -h localhost

# Show tables
\dt

# Manually run DB migration
cd server && npx tsx src/db/migrate.ts

# Export a full backup
pg_dump -U quietfeed -d quietfeed -h localhost > backup-$(date +%Y%m%d).sql

# Restore from backup
psql -U quietfeed -d quietfeed -h localhost < backup.sql
```

### Android
```bash
# Release APK
cd mobile-rn/android && ./gradlew assembleRelease

# Debug APK (no keystore needed)
cd mobile-rn/android && ./gradlew assembleDebug

# Wipe build cache
cd mobile-rn/android && ./gradlew clean

# Install via ADB
adb install -r app/build/outputs/apk/release/app-release.apk

# List connected devices
adb devices

# Device logs
adb logcat | grep quietfeed
```

---

## Troubleshooting

### Server crashes immediately

The server validates all env vars at startup. Run:
```bash
cd server && npm run dev
```
Look for `[config] Invalid environment:` in output. It tells you exactly which variable is missing or wrong.

### Google sign-in loops or fails in browser

1. `VITE_GOOGLE_CLIENT_ID` in `source/.env` must exactly match the Client ID in Google Cloud Console.
2. `http://localhost:5173` must be in **Authorized JavaScript origins** of your OAuth client.
3. Clear browser cookies and try again.

### "connection refused" on psql or server startup

PostgreSQL is not running. Start it:
```bash
brew services start postgresql@16    # macOS
sudo systemctl start postgresql      # Ubuntu
```
Then verify: `pg_isready`

### API calls fail in the browser (404 or wrong response)

The Vite proxy is not configured. Check `source/vite.config.ts` has:
```typescript
server: { proxy: { '/api': 'http://localhost:3000' } }
```

### YouTube API returns 403

1. The API key must be enabled for **YouTube Data API v3** in Google Cloud.
2. Check for API restrictions — server-side keys should use IP restrictions, not HTTP referrer.
3. Check quota: Google Cloud → APIs & Services → Quotas. Free tier = 10,000 units/day.

### Android build fails — JAVA_HOME not set

```bash
echo $JAVA_HOME      # must print a valid JDK path
java -version        # must be Java 17+
```

Add the `export JAVA_HOME=...` line to your shell profile and re-source it.

### Google Sign-In on Android shows "developer error"

Your release keystore's SHA-1 is not registered. See [Step 5 of Building the Android APK](#step-5--register-android-sha-1-with-google-one-time).

---

## License

Private repository. All rights reserved.
