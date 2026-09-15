import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/async';
import { requireAuth } from '../auth/middleware';
import { getProgress, saveProgress } from '../repos/progress';

export const progressRouter = Router();

// Deprecated admin inspection endpoint — user activity tracking has been disabled
progressRouter.get('/admin/all', (_req, res) => {
  res.status(410).json({ error: 'User progress tracking is disabled' });
});

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
    res.json({ ok: true });
  }),
);

