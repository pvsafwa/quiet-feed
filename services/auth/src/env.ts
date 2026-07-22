import 'dotenv/config';
import { z } from 'zod';

// Validate and expose configuration once at startup. Fails fast with a clear message
// if anything required is missing, so the container never boots half-configured.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Postgres
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  // Comma-separated list of admin emails (everyone else signs in as a normal user).
  ADMIN_EMAILS: z.string().default(''),

  // YouTube
  YOUTUBE_API_KEY: z.string().min(1, 'YOUTUBE_API_KEY is required'),
  // How long cached YouTube responses stay fresh (minutes).
  CACHE_TTL_MINUTES: z.coerce.number().default(60),
  // How often the background worker re-warms cached channel content (minutes); 0 disables it.
  REFRESH_INTERVAL_MINUTES: z.coerce.number().default(30),

  // CORS — only needed if the frontend is served from a different origin than the API.
  // When the app is served behind one nginx (same origin), leave this empty.
  CORS_ORIGIN: z.string().default(''),

  // Cookie security: set to 'true' behind HTTPS in production.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Invalid environment:\n' + parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const env = parsed.data;

export const adminEmails = new Set(
  env.ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export const isAdminEmail = (email: string): boolean => adminEmails.has(email.trim().toLowerCase());
