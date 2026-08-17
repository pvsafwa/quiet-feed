import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/async';
import { verifyGoogleIdToken } from './google';
import { issueSession, clearSession } from './session';
import { requireAuth, requireAdmin } from './middleware';
import { upsertUserFromGoogle, getUserById, listAllUsers, publicUser } from '../repos/users';

export const authRouter = Router();

const googleBody = z.object({
  credential: z.string().min(1),
  timezone: z.string().optional(),
});

function resolveLocation(timezone?: string, headers?: any): string {
  const city = headers?.['cf-ipcity'] || headers?.['x-city'] || '';
  const country = headers?.['cf-ipcountry'] || headers?.['x-country'] || '';
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  if (timezone) {
    const parts = timezone.split('/');
    if (parts.length > 1) {
      const cityOrRegion = parts[parts.length - 1].replace(/_/g, ' ');
      const continent = parts[0].replace(/_/g, ' ');
      return `${cityOrRegion}, ${continent}`;
    }
    return timezone;
  }
  return '';
}

// Exchange a Google ID token for a session cookie.
authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    const parsed = googleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing Google credential' });
      return;
    }
    let profile;
    try {
      profile = await verifyGoogleIdToken(parsed.data.credential);
    } catch (e) {
      console.warn('[auth] google verify failed', (e as Error).message);
      res.status(401).json({ error: 'Could not verify Google sign-in' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const timezone = (req.headers['x-timezone'] as string) || parsed.data.timezone || '';
    const location = resolveLocation(timezone, req.headers);

    const user = await upsertUserFromGoogle(profile, {
      ip: clientIp,
      timezone,
      location,
    });
    const token = issueSession(res, { uid: user.id, role: user.role });
    // `token` is for native clients (Bearer); the web ignores it and uses the cookie.
    res.json({ user: publicUser(user), token });
  }),
);

// Who am I? (null when signed out.)
authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      res.json({ user: null });
      return;
    }
    const user = await getUserById(req.auth.uid);
    res.json({ user: user ? publicUser(user) : null });
  }),
);

// Admin: List all registered users
authRouter.get(
  '/admin/users',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await listAllUsers();
    res.json({ users: users.map(publicUser) });
  }),
);

authRouter.post('/logout', requireAuth, (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});
