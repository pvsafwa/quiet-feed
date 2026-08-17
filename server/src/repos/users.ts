import { query } from '../db/pool';
import { isAdminEmail } from '../env';

export interface User {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  picture: string;
  role: 'user' | 'admin';
  created_at: string;
  last_login: string;
  location: string;
  timezone: string;
  last_ip: string;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface UserActivityMeta {
  location?: string;
  timezone?: string;
  ip?: string;
}

// Create or update the user from a verified Google profile. Role is derived from
// the admin email allowlist on every login, so promoting/demoting an admin is just
// an env change + re-login.
export async function upsertUserFromGoogle(
  p: GoogleProfile,
  meta?: UserActivityMeta,
): Promise<User> {
  const role = isAdminEmail(p.email) ? 'admin' : 'user';
  const location = meta?.location || '';
  const timezone = meta?.timezone || '';
  const last_ip = meta?.ip || '';

  const { rows } = await query<User>(
    `INSERT INTO users (google_sub, email, name, picture, role, last_login, location, timezone, last_ip)
     VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           picture = EXCLUDED.picture,
           role = EXCLUDED.role,
           last_login = now(),
           location = CASE WHEN EXCLUDED.location <> '' THEN EXCLUDED.location ELSE users.location END,
           timezone = CASE WHEN EXCLUDED.timezone <> '' THEN EXCLUDED.timezone ELSE users.timezone END,
           last_ip = CASE WHEN EXCLUDED.last_ip <> '' THEN EXCLUDED.last_ip ELSE users.last_ip END
     RETURNING *`,
    [p.sub, p.email.toLowerCase(), p.name || '', p.picture || '', role, location, timezone, last_ip],
  );
  return rows[0];
}

export async function updateUserActivity(id: string, meta: UserActivityMeta): Promise<void> {
  await query(
    `UPDATE users
     SET last_login = now(),
         location = CASE WHEN $2 <> '' THEN $2 ELSE location END,
         timezone = CASE WHEN $3 <> '' THEN $3 ELSE timezone END,
         last_ip = CASE WHEN $4 <> '' THEN $4 ELSE last_ip END
     WHERE id = $1`,
    [id, meta.location || '', meta.timezone || '', meta.ip || ''],
  );
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listAllUsers(): Promise<User[]> {
  const { rows } = await query<User>(
    'SELECT id, google_sub, email, name, picture, role, created_at, last_login, location, timezone, last_ip FROM users ORDER BY last_login DESC',
  );
  return rows;
}

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    role: u.role,
    created_at: u.created_at,
    last_login: u.last_login,
    location: u.location || '',
    timezone: u.timezone || '',
  };
}
export type PublicUser = ReturnType<typeof publicUser>;
