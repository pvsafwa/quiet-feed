import { listChannels } from '../repos/channels';
import { cacheSet, cachePurgeExpired } from '../youtube/cache';
import { fetchPlaylistPage, fetchPlaylists } from '../youtube/service';
import { env } from '../env';

let timer: NodeJS.Timeout | null = null;

// Re-warm the first page of uploads + playlists for every curated channel, so the
// feed is always instant and quota stays bounded regardless of how many users hit it.
export async function refreshAll(): Promise<void> {
  const channels = await listChannels();
  for (const ch of channels) {
    try {
      const uploads = await fetchPlaylistPage(ch.uploads, '', { id: ch.id, title: ch.title, thumb: ch.thumb, uploads: ch.uploads });
      await cacheSet(`uploads:${ch.id}:first`, uploads);
    } catch (e) {
      console.warn('[worker] uploads refresh failed for', ch.title, (e as Error).message);
    }
    try {
      const r = await fetchPlaylists(ch.id, '');
      await cacheSet(`playlists:${ch.id}:first`, { items: r.items.map((p) => ({ ...p, channelTitle: ch.title })), nextPageToken: r.nextPageToken });
    } catch (e) {
      console.warn('[worker] playlists refresh failed for', ch.title, (e as Error).message);
    }
  }
  await cachePurgeExpired();
  console.log(`[worker] refreshed ${channels.length} channel(s)`);
}

export function startRefreshWorker(): void {
  if (env.REFRESH_INTERVAL_MINUTES <= 0) {
    console.log('[worker] background refresh disabled (REFRESH_INTERVAL_MINUTES=0)');
    return;
  }
  const ms = env.REFRESH_INTERVAL_MINUTES * 60 * 1000;
  // Warm shortly after boot so startup isn't blocked on YouTube.
  setTimeout(() => {
    refreshAll().catch((e) => console.error('[worker] initial refresh failed', e));
  }, 5000);
  timer = setInterval(() => {
    refreshAll().catch((e) => console.error('[worker] refresh failed', e));
  }, ms);
  timer.unref?.();
  console.log(`[worker] refreshing cached content every ${env.REFRESH_INTERVAL_MINUTES} minute(s)`);
}

export function stopRefreshWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
