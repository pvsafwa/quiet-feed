import { YtError, type Channel, type Video, type PlaylistMeta } from './types';
import { bestThumb, iso2sec, fmtDur } from './format';

const API = 'https://www.googleapis.com/youtube/v3';

export async function yt(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  const u = new URL(API + path);
  u.search = new URLSearchParams({ ...params, key: apiKey }).toString();
  let r: Response;
  try { r = await fetch(u.toString()); }
  catch { throw new YtError("Couldn't reach YouTube.", 'network'); }
  let j: any = {};
  try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok) {
    const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
    throw new YtError(j?.error?.message || `Request failed (${r.status}).`, reason, r.status);
  }
  return j;
}

// Plain-English explanation of an API error — ported 1:1.
export function friendly(e: any): string {
  const t = ((e && e.message) || '') + ' ' + ((e && e.reason) || '');
  if (/quotaExceeded/i.test(t)) return 'Daily API quota reached — try again tomorrow.';
  if (/not been used in project|accessNotConfigured|is disabled|has not been enabled|SERVICE_DISABLED/i.test(t))
    return 'The YouTube Data API isn\u2019t switched on. In Google Cloud \u2192 \u201cAPIs & Services \u2192 Library\u201d, search \u201cYouTube Data API v3\u201d, Enable, wait ~1 min, retry.';
  if (/referer|referrer|HTTP_REFERRER/i.test(t))
    return 'Your key has a website (HTTP-referrer) restriction, which blocks this file. Open the key \u2192 Application restrictions \u2192 \u201cNone\u201d (or restrict by API) \u2192 Save, retry.';
  if (/API key not valid|keyInvalid|invalid api key|API_KEY_INVALID/i.test(t))
    return 'That API key isn\u2019t valid. Re-copy it from Cloud Console \u2192 Credentials and Save again.';
  if (/forbidden|PERMISSION_DENIED|blocked/i.test(t))
    return 'Your key\u2019s restrictions are blocking this. Set Application restrictions to \u201cNone\u201d and allow \u201cYouTube Data API v3\u201d under API restrictions.';
  if (/network/i.test(t)) {
    if (typeof window !== 'undefined' && window.self !== window.top)
      return 'This is running inside a preview pane (embedded in another app), which is sandboxed and blocked from calling YouTube. Download this file and open it in its own browser tab.';
    const filePart = location.protocol === 'file:'
      ? 'If your browser is locked-down, opening from disk (file://) can block API calls \u2014 run it from a local server instead.\n\n'
      : '';
    return filePart + 'The request to googleapis.com is being blocked \u2014 usually an ad-blocker, privacy extension (Brave Shields, uBlock), a VPN, or a work/school network. Disable those for this page or switch network. Open the browser console (F12) for the exact reason.';
  }
  return (e && e.message) || 'Something went wrong.';
}

// Resolve a channel from @handle / URL / UC id — ported 1:1.
export async function resolveChannel(raw: string, apiKey: string): Promise<Channel> {
  let input = raw.trim();
  let forUsername: string | null = null, byHandle: string | null = null, channelId: string | null = null, custom: string | null = null;
  if (/youtube\.com|youtu\.be/.test(input)) {
    try {
      const u = new URL(input.startsWith('http') ? input : 'https://' + input);
      const seg = u.pathname.split('/').filter(Boolean);
      if (seg[0] === 'channel') channelId = seg[1];
      else if (seg[0]?.startsWith('@')) byHandle = seg[0];
      else if (seg[0] === 'user') forUsername = seg[1];
      else if (seg[0] === 'c') custom = seg[1];
      else if (seg[0]) custom = seg[0];
    } catch { /* ignore */ }
  } else if (/^UC[\w-]{22}$/.test(input)) channelId = input;
  else if (input.startsWith('@')) byHandle = input;
  else byHandle = '@' + input.replace(/^@/, '');

  const part = 'snippet,contentDetails';
  let data: any;
  if (channelId) data = await yt('/channels', { part, id: channelId }, apiKey);
  else if (byHandle) data = await yt('/channels', { part, forHandle: byHandle }, apiKey);
  else if (forUsername) data = await yt('/channels', { part, forUsername }, apiKey);

  if (!data || !data.items?.length) {
    const q = custom || raw.replace(/^@/, '');
    const s = await yt('/search', { part: 'snippet', type: 'channel', q, maxResults: '1' }, apiKey);
    if (!s.items?.length) throw new YtError("Couldn't find that channel.");
    data = await yt('/channels', { part, id: s.items[0].snippet.channelId }, apiKey);
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

export interface PageResult { items: Video[]; nextPageToken: string | null }

// Fetch one page of a playlist (uploads or real), enriched with duration + views — ported 1:1.
export async function fetchPlaylistPage(
  playlistId: string, pageToken: string, chMeta: Channel | null, apiKey: string,
): Promise<PageResult> {
  const params: Record<string, string> = { part: 'snippet,contentDetails', maxResults: '50', playlistId };
  if (pageToken) params.pageToken = pageToken;
  const j = await yt('/playlistItems', params, apiKey);
  let items: Video[] = (j.items || []).map((it: any): Video => ({
    id: it.contentDetails?.videoId,
    title: it.snippet.title,
    channelId: chMeta ? chMeta.id : (it.snippet.videoOwnerChannelId || ''),
    channelTitle: chMeta ? chMeta.title : (it.snippet.videoOwnerChannelTitle || ''),
    channelThumb: chMeta ? chMeta.thumb : '',
    published: it.contentDetails?.videoPublishedAt || it.snippet.publishedAt,
    thumb: bestThumb(it.snippet.thumbnails),
  })).filter((v: Video) => v.id && v.thumb && v.title !== 'Private video' && v.title !== 'Deleted video');

  const ids = items.map(v => v.id);
  if (ids.length) {
    try {
      const d = await yt('/videos', { part: 'contentDetails,statistics', id: ids.join(',') }, apiKey);
      const map: Record<string, any> = {};
      (d.items || []).forEach((x: any) => { map[x.id] = x; });
      items.forEach(v => {
        const x = map[v.id];
        if (x) { v.seconds = iso2sec(x.contentDetails.duration); v.dur = fmtDur(v.seconds); v.views = +x.statistics.viewCount || 0; }
      });
    } catch (e) { console.warn('enrich failed', e); }
  }
  return { items, nextPageToken: j.nextPageToken || null };
}

// Fetch a single video's full description + view count (not available from playlistItems).
export async function fetchVideoMeta(id: string, apiKey: string): Promise<{ description: string; views?: number }> {
  const j = await yt('/videos', { part: 'snippet,statistics', id }, apiKey);
  const v = j.items?.[0];
  return { description: v?.snippet?.description || '', views: v ? +v.statistics?.viewCount || undefined : undefined };
}

export async function fetchPlaylists(channelId: string, pageToken: string, apiKey: string): Promise<{ items: PlaylistMeta[]; nextPageToken: string | null; channelTitle: string }> {
  const params: Record<string, string> = { part: 'snippet,contentDetails', maxResults: '50', channelId };
  if (pageToken) params.pageToken = pageToken;
  const j = await yt('/playlists', params, apiKey);
  const items: PlaylistMeta[] = (j.items || []).map((p: any): PlaylistMeta => ({
    id: p.id, title: p.snippet.title,
    channelId, channelTitle: '',
    count: p.contentDetails?.itemCount ?? 0,
    thumb: bestThumb(p.snippet.thumbnails),
  }));
  return { items, nextPageToken: j.nextPageToken || null, channelTitle: '' };
}
