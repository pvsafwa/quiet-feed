import { env } from '../env';

const API = 'https://www.googleapis.com/youtube/v3';

export class YtError extends Error {
  reason: string;
  status?: number;
  constructor(message: string, reason = '', status?: number) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

// Low-level YouTube Data API call using the server's secret key. The key is never
// sent to the browser — all YouTube traffic flows through this backend.
export async function yt(path: string, params: Record<string, string>): Promise<any> {
  const u = new URL(API + path);
  u.search = new URLSearchParams({ ...params, key: env.YOUTUBE_API_KEY }).toString();
  let r: Response;
  try {
    r = await fetch(u.toString());
  } catch {
    throw new YtError("Couldn't reach YouTube.", 'network');
  }
  let j: any = {};
  try {
    j = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
    throw new YtError(j?.error?.message || `Request failed (${r.status}).`, reason, r.status);
  }
  return j;
}

// Plain-English explanation of an API error for logs / admin surfaces.
export function friendly(e: any): string {
  const t = `${e?.message || ''} ${e?.reason || ''}`;
  if (/quotaExceeded/i.test(t)) return 'Daily YouTube API quota reached — try again later.';
  if (/accessNotConfigured|is disabled|has not been enabled|SERVICE_DISABLED/i.test(t))
    return 'The YouTube Data API v3 is not enabled for this key’s project.';
  if (/API key not valid|keyInvalid|API_KEY_INVALID/i.test(t)) return 'The server YouTube API key is not valid.';
  if (/forbidden|PERMISSION_DENIED|blocked/i.test(t)) return 'The server YouTube API key is restricted and blocked this call.';
  return e?.message || 'Something went wrong talking to YouTube.';
}
