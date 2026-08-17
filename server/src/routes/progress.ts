import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/async';
import { requireAuth, requireAdmin } from '../auth/middleware';
import { getProgress, saveProgress, getAllUsersProgress } from '../repos/progress';
import { updateUserActivity } from '../repos/users';

export const progressRouter = Router();

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

// Admin can retrieve progress across all users
progressRouter.get(
  '/admin/all',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ progressByUser: await getAllUsersProgress() });
  }),
);

// The whole per-user progress doc — fetched on load, saved (debounced) by the client.
progressRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ progress: await getProgress(req.auth!.uid) });
  }),
);

// Accept the progress shape loosely; the client owns its structure.
const progressBody = z.object({
  v: z.record(z.any()).optional(),
  day: z.record(z.any()).optional(),
  pl: z.record(z.any()).optional(),
  mon: z.record(z.any()).optional(),
}).passthrough();

progressRouter.put(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = progressBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid progress payload' });
      return;
    }
    await saveProgress(req.auth!.uid, parsed.data);

    // Update user activity, location, and timezone
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const timezone = (req.headers['x-timezone'] as string) || '';
    const location = resolveLocation(timezone, req.headers);
    await updateUserActivity(req.auth!.uid, { ip: clientIp, timezone, location }).catch(() => {});

    res.json({ ok: true });
  }),
);
