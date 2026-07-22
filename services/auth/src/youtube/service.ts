import { yt, YtError } from './client';
import { bestThumb, iso2sec, fmtDur } from './format';
import type { Channel, Video, PlaylistMeta, PageResult } from './types';

// Resolve a channel from @handle / URL / UC id. Ported from the frontend.
export async function resolveChannel(raw: string): Promise<Channel> {
  const input = raw.trim();
  let forUsername: string | null = null;
  let byHandle: string | null = null;
  let channelId: string | null = null;
  let custom: string | null = null;

  if (/youtube\.com|youtu\.be/.test(input)) {
    try {
      const u = new URL(input.startsWith('http') ? input : 'https://' + input);
      const seg = u.pathname.split('/').filter(Boolean);
      if (seg[0] === 'channel') channelId = seg[1];
      else if (seg[0]?.startsWith('@')) byHandle = seg[0];
      else if (seg[0] === 'user') forUsername = seg[1];
      else if (seg[0] === 'c') custom = seg[1];
      else if (seg[0]) custom = seg[0];
    } catch {
      /* ignore */
    }
  } else if (/^UC[\w-]{22}$/.test(input)) channelId = input;
  else if (input.startsWith('@')) byHandle = input;
  else byHandle = '@' + input.replace(/^@/, '');

  const part = 'snippet,contentDetails';
  let data: any;
  if (channelId) data = await yt('/channels', { part, id: channelId });
  else if (byHandle) data = await yt('/channels', { part, forHandle: byHandle });
  else if (forUsername) data = await yt('/channels', { part, forUsername });

  if (!data || !data.items?.length) {
    const q = custom || raw.replace(/^@/, '');
    const s = await yt('/search', { part: 'snippet', type: 'channel', q, maxResults: '1' });
    if (!s.items?.length) throw new YtError("Couldn't find that channel.");
    data = await yt('/channels', { part, id: s.items[0].snippet.channelId });
  }
  if (!data.items?.length) throw new YtError("Couldn't find that channel.");
  const c = data.items[0];
  return {
    id: c.id,
    title: c.snippet.title,
    thumb: c.snippet.thumbnails?.default?.url || c.snippet.thumbnails?.medium?.url || '',
    uploads: c.contentDetails.relatedPlaylists.uploads,
  };
}

// Fetch one page of a playlist (uploads or real), enriched with duration + views.
export async function fetchPlaylistPage(playlistId: string, pageToken: string, chMeta: Channel | null): Promise<PageResult> {
  const params: Record<string, string> = { part: 'snippet,contentDetails', maxResults: '50', playlistId };
  if (pageToken) params.pageToken = pageToken;
  const j = await yt('/playlistItems', params);
  const items: Video[] = (j.items || [])
    .map((it: any): Video => ({
      id: it.contentDetails?.videoId,
      title: it.snippet.title,
      channelId: chMeta ? chMeta.id : it.snippet.videoOwnerChannelId || '',
      channelTitle: chMeta ? chMeta.title : it.snippet.videoOwnerChannelTitle || '',
      channelThumb: chMeta ? chMeta.thumb : '',
      published: it.contentDetails?.videoPublishedAt || it.snippet.publishedAt,
      thumb: bestThumb(it.snippet.thumbnails),
    }))
    .filter((v: Video) => v.id && v.thumb && v.title !== 'Private video' && v.title !== 'Deleted video');

  const ids = items.map((v) => v.id);
  if (ids.length) {
    try {
      const d = await yt('/videos', { part: 'contentDetails,statistics', id: ids.join(',') });
      const map: Record<string, any> = {};
      (d.items || []).forEach((x: any) => {
        map[x.id] = x;
      });
      items.forEach((v) => {
        const x = map[v.id];
        if (x) {
          v.seconds = iso2sec(x.contentDetails.duration);
          v.dur = fmtDur(v.seconds);
          v.views = +x.statistics.viewCount || 0;
        }
      });
    } catch (e) {
      console.warn('[yt] enrich failed', e);
    }
  }
  return { items, nextPageToken: j.nextPageToken || null };
}

export async function fetchPlaylists(channelId: string, pageToken: string): Promise<{ items: PlaylistMeta[]; nextPageToken: string | null }> {
  const params: Record<string, string> = { part: 'snippet,contentDetails', maxResults: '50', channelId };
  if (pageToken) params.pageToken = pageToken;
  const j = await yt('/playlists', params);
  const items: PlaylistMeta[] = (j.items || []).map((p: any): PlaylistMeta => ({
    id: p.id,
    title: p.snippet.title,
    channelId,
    channelTitle: '',
    count: p.contentDetails?.itemCount ?? 0,
    thumb: bestThumb(p.snippet.thumbnails),
  }));
  return { items, nextPageToken: j.nextPageToken || null };
}

// Fetch a single video's full description + view count.
export async function fetchVideoMeta(id: string): Promise<{ description: string; views?: number }> {
  const j = await yt('/videos', { part: 'snippet,statistics', id });
  const v = j.items?.[0];
  return { description: v?.snippet?.description || '', views: v ? +v.statistics?.viewCount || undefined : undefined };
}

// Walk all pages of a playlist (bounded), oldest-first sort for course playlists.
export async function fetchWholePlaylist(playlistId: string, chMeta: Channel | null, maxPages = 12): Promise<Video[]> {
  let all: Video[] = [];
  let token = '';
  let pages = 0;
  do {
    const r = await fetchPlaylistPage(playlistId, token, chMeta);
    all = all.concat(r.items);
    token = r.nextPageToken || '';
    pages++;
  } while (token && pages < maxPages);
  return all;
}
