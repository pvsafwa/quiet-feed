import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/async';
import { verifyGoogleIdToken } from './google';
import { issueSession, clearSession } from './session';
import { requireAuth } from './middleware';
import { upsertUserFromGoogle, getUserById, publicUser } from '../repos/users';

export const authRouter = Router();

const googleBody = z.object({ credential: z.string().min(1) });

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
    const user = await upsertUserFromGoogle(profile);
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

authRouter.post('/logout', requireAuth, (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});
