import type { Request, Response, NextFunction } from 'express';
import { readSession, SESSION_COOKIE } from './session';

// Carry the authenticated session on the request.
export interface AuthInfo {
  uid: string;
  role: 'user' | 'admin';
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

// Populate req.auth from the session cookie (web) or an Authorization: Bearer token
// (native apps). Does not block.
export function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  let token: string | undefined = req.cookies?.[SESSION_COOKIE];
  const header = req.headers['authorization'];
  if (!token && typeof header === 'string' && header.startsWith('Bearer ')) token = header.slice(7);
  const session = readSession(token);
  if (session) req.auth = session;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  if (req.auth.role !== 'admin') {
    res.status(403).json({ error: 'Admins only' });
    return;
  }
  next();
}
