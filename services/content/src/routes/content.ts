import { Router } from 'express';
import { asyncHandler } from '../http/async';
import { requireAuth } from '../auth/middleware';
import { getChannel } from '../repos/channels';
import { cached } from '../youtube/cache';
import { fetchPlaylistPage, fetchPlaylists, fetchWholePlaylist, fetchVideoMeta } from '../youtube/service';
import { friendly } from '../youtube/client';

export const contentRouter = Router();

// All content endpoints require sign-in and serve from the shared cache, so user
// count does not multiply YouTube quota.

// One page of a channel's uploads (the video feed), enriched + cached.
contentRouter.get(
  '/channels/:id/uploads',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ch = await getChannel(req.params.id);
    if (!ch) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const token = typeof req.query.pageToken === 'string' ? req.query.pageToken : '';
    const key = `uploads:${ch.id}:${token || 'first'}`;
    try {
      const data = await cached(key, () => fetchPlaylistPage(ch.uploads, token, { id: ch.id, title: ch.title, thumb: ch.thumb, uploads: ch.uploads }));
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: friendly(e) });
    }
  }),
);

// One page of a channel's playlists, cached.
contentRouter.get(
  '/channels/:id/playlists',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ch = await getChannel(req.params.id);
    if (!ch) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const token = typeof req.query.pageToken === 'string' ? req.query.pageToken : '';
    const key = `playlists:${ch.id}:${token || 'first'}`;
    try {
      const data = await cached(key, async () => {
        const r = await fetchPlaylists(ch.id, token);
        return { items: r.items.map((p) => ({ ...p, channelTitle: ch.title })), nextPageToken: r.nextPageToken };
      });
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: friendly(e) });
    }
  }),
);

// All videos in a playlist (bounded), cached.
contentRouter.get(
  '/playlists/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = `playlist:${req.params.id}`;
    try {
      const items = await cached(key, () => fetchWholePlaylist(req.params.id, null));
      res.json({ items });
    } catch (e) {
      res.status(502).json({ error: friendly(e) });
    }
  }),
);

// A single video's description + view count, cached.
contentRouter.get(
  '/videos/:id/meta',
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = `videometa:${req.params.id}`;
    try {
      const meta = await cached(key, () => fetchVideoMeta(req.params.id), 360);
      res.json(meta);
    } catch (e) {
      res.status(502).json({ error: friendly(e) });
    }
  }),
);
