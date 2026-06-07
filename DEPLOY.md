# Quiet Feed — multi-user deployment (AWS / Docker)

This turns Quiet Feed from a single-user local page into a multi-user web app:
**Google sign-in, admin + user roles, a shared admin-curated channel list, per-user
progress stored server-side, and a cached YouTube proxy so quota stays flat no matter
how many people use it.**

```
            ┌─────────────┐      ┌──────────────┐      ┌────────────┐
 browser ──▶│ web (nginx) │──────│ server (API) │──────│ db (Postgres)
            │ SPA + /api  │ /api │ Node/Express │  SQL │            │
            └─────────────┘      └──────┬───────┘      └────────────┘
                                        │ one secret YouTube key + cache
                                        ▼
                                  YouTube Data API
```

## Why quota is no longer a worry

Every user sees the **same admin-curated channels**, so the server fetches each
channel once, caches it in Postgres (`CACHE_TTL_MINUTES`), and a background worker
re-warms it (`REFRESH_INTERVAL_MINUTES`). API cost scales with the number of
**channels**, not **users** — 1 user or 10,000 users cost the same. The YouTube key
lives only on the server and is never sent to the browser.

> Note: per-user Google API keys are intentionally **not** used — quota on YouTube is
> per *project*, not per *user*, and you cannot provision Cloud keys for arbitrary
> sign-ins. Shared server-side caching is the correct, standard solution.

---

## What you need before deploying

1. **A YouTube Data API v3 key** (Google Cloud → APIs & Services → Credentials).
   Server-side only — it can keep an "IP address" or "none" restriction (not HTTP referrer).
2. **A Google OAuth 2.0 Web client ID** (same console → Create credentials → OAuth client ID → Web application).
   Under *Authorized JavaScript origins*, add the URL users will visit, e.g.
   `http://localhost:8080` for local, and `https://yourdomain.com` for production.
3. **Docker + Docker Compose** on the host.

---

## Run locally

```bash
cp .env.example .env          # then edit: passwords, GOOGLE_CLIENT_ID, ADMIN_EMAILS, YOUTUBE_API_KEY, SESSION_SECRET
docker compose up -d --build
# web:    http://localhost:8080
# health: http://localhost:8080/api/health
```

The first account that signs in with an email listed in `ADMIN_EMAILS` becomes an admin.

---

## Deploy on a single Ubuntu EC2 box

1. **Launch** an Ubuntu 22.04/24.04 instance (t3.small is plenty to start). Security
   group: allow inbound 80/443 (and 22 for SSH).
2. **Install Docker:**
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin
   sudo usermod -aG docker $USER && newgrp docker
   ```
3. **Copy the project** to the box (`scp -r` or `git clone`), then:
   ```bash
   cp .env.example .env
   nano .env            # fill in real values; set WEB_PORT=80 and COOKIE_SECURE=true once on HTTPS
   docker compose up -d --build
   ```
4. **TLS (recommended):** put the stack behind HTTPS. Easiest options:
   - Add a Caddy or nginx reverse proxy with Let's Encrypt in front, **or**
   - Front it with an AWS Application Load Balancer + ACM certificate.
   Then set `COOKIE_SECURE=true` and add your `https://` origin to the Google OAuth client.

### Operating it

```bash
docker compose logs -f server     # tail API logs
docker compose ps                 # status
docker compose pull && docker compose up -d --build   # update
docker compose down               # stop (data persists in the dbdata volume)
```

Backups: the database lives in the `dbdata` Docker volume.
`docker compose exec db pg_dump -U quietfeed quietfeed > backup.sql`

---

## API surface (all under `/api`)

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/google` | anyone | Exchange a Google ID token for a session cookie |
| GET | `/auth/me` | anyone | Current user (or `null`) |
| POST | `/auth/logout` | signed-in | Clear session |
| GET | `/channels` | signed-in | Curated channel list |
| POST | `/channels` | **admin** | Add a channel by `@handle` / URL / `UC…` |
| DELETE | `/channels/:id` | **admin** | Remove a channel |
| GET | `/channels/:id/uploads?pageToken=` | signed-in | A page of a channel's videos (cached) |
| GET | `/channels/:id/playlists?pageToken=` | signed-in | A page of a channel's playlists (cached) |
| GET | `/playlists/:id` | signed-in | All videos in a playlist (cached) |
| GET | `/videos/:id/meta` | signed-in | Video description + views (cached) |
| GET | `/progress` | signed-in | This user's progress doc |
| PUT | `/progress` | signed-in | Save this user's progress doc |

---

## Status & next phase

**Done now:** the backend (auth, roles, cached YouTube proxy, per-user progress),
Postgres schema, the background refresh worker, and this Dockerised stack.

**Next (frontend integration):** wire the existing React SPA to this API — add the
Google Sign-In screen, an admin-only channel manager, swap the direct YouTube calls
in `source/src/lib` for the `/api/*` endpoints, and move progress persistence from
`localStorage` to `GET/PUT /api/progress`. Until that lands, the `web` container still
serves the current single-user UI; the API above is live and testable (e.g.
`curl http://localhost:8080/api/health`). Mobile (Android/iOS) is covered by making
that integrated SPA an installable PWA.
