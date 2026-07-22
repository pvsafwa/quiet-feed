import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from '../env';

const COOKIE_NAME = 'qf_session';

interface SessionPayload {
  uid: string;
  role: 'user' | 'admin';
}

// Issues the session as an httpOnly cookie (for the web) AND returns the raw JWT
// (for native clients, which send it back as `Authorization: Bearer <token>`).
export function issueSession(res: Response, payload: SessionPayload): string {
  const token = jwt.sign(payload, env.SESSION_SECRET, { expiresIn: `${env.SESSION_TTL_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

export function readSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.SESSION_SECRET) as SessionPayload;
    if (!decoded?.uid) return null;
    return { uid: decoded.uid, role: decoded.role };
  } catch {
    return null;
  }
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export const SESSION_COOKIE = COOKIE_NAME;
