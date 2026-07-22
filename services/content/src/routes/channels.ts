import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../http/async';
import { requireAuth, requireAdmin } from '../auth/middleware';
import { listChannels, addChannel, removeChannel } from '../repos/channels';
import { resolveChannel } from '../youtube/service';
import { friendly } from '../youtube/client';
import { cacheInvalidatePrefix } from '../youtube/cache';

export const channelsRouter = Router();

// Anyone signed in sees the curated channel list.
channelsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ channels: await listChannels() });
  }),
);

const addBody = z.object({ input: z.string().min(1) });

// Admin adds a channel by @handle / URL / UC id.
channelsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = addBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a channel handle, URL, or ID' });
      return;
    }
    try {
      const channel = await resolveChannel(parsed.data.input);
      const row = await addChannel(channel, req.auth!.uid);
      res.status(201).json({ channel: row });
    } catch (e) {
      res.status(400).json({ error: friendly(e) });
    }
  }),
);

// Admin removes a channel and drops its cached content.
channelsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const removed = await removeChannel(req.params.id);
    await cacheInvalidatePrefix(`uploads:${req.params.id}`);
    await cacheInvalidatePrefix(`playlists:${req.params.id}`);
    if (!removed) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    res.json({ ok: true });
  }),
);
