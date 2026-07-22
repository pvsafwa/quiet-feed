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
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

// Create or update the user from a verified Google profile. Role is derived from
// the admin email allowlist on every login, so promoting/demoting an admin is just
// an env change + re-login.
export async function upsertUserFromGoogle(p: GoogleProfile): Promise<User> {
  const role = isAdminEmail(p.email) ? 'admin' : 'user';
  const { rows } = await query<User>(
    `INSERT INTO users (google_sub, email, name, picture, role, last_login)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           picture = EXCLUDED.picture,
           role = EXCLUDED.role,
           last_login = now()
     RETURNING *`,
    [p.sub, p.email.toLowerCase(), p.name || '', p.picture || '', role],
  );
  return rows[0];
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, picture: u.picture, role: u.role };
}
export type PublicUser = ReturnType<typeof publicUser>;
