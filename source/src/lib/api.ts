// Thin client for the Quiet Feed backend. Same-origin (served behind nginx), so the
// session cookie is sent automatically with credentials: 'include'.
import type { Video, PlaylistMeta, ChannelLanguage, ApiUser } from './types';

export { type ApiUser };
export interface ApiChannel {
  id: string;
  title: string;
  thumb: string;
  uploads: string;
  language?: ChannelLanguage | string;
}

export interface PageResult { items: Video[]; nextPageToken: string | null }

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  let r: Response;
  const headers: Record<string, string> = {};
  if (opts.body) headers['Content-Type'] = 'application/json';
  try {
    const tz = typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    if (tz) headers['x-timezone'] = tz;
  } catch {}
  try {
    r = await fetch('/api' + path, {
      credentials: 'include',
      headers: { ...headers, ...(opts.headers as any) },
      ...opts,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Is it running?", 0);
  }
  const text = await r.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!r.ok) throw new ApiError(j?.error || `Request failed (${r.status}).`, r.status);
  return j as T;
}

const qp = (token: string) => (token ? `?pageToken=${encodeURIComponent(token)}` : '');

export const api = {
  // auth
  me: () => req<{ user: ApiUser | null }>('/auth/me'),
  google: (credential: string) => req<{ user: ApiUser }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  // channels
  channels: () => req<{ channels: ApiChannel[] }>('/channels'),
  addChannel: (input: string, language: string = 'English') => req<{ channel: ApiChannel }>('/channels', { method: 'POST', body: JSON.stringify({ input, language }) }),
  removeChannel: (id: string) => req<{ ok: boolean }>(`/channels/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // content (cached server-side)
  uploads: (channelId: string, token = '') => req<PageResult>(`/channels/${encodeURIComponent(channelId)}/uploads${qp(token)}`),
  channelPlaylists: (channelId: string, token = '') => req<{ items: PlaylistMeta[]; nextPageToken: string | null }>(`/channels/${encodeURIComponent(channelId)}/playlists${qp(token)}`),
  playlist: (id: string) => req<{ items: Video[] }>(`/playlists/${encodeURIComponent(id)}`),
  videoMeta: (id: string) => req<{ description: string; views?: number }>(`/videos/${encodeURIComponent(id)}/meta`),

  // per-user progress
  getProgress: () => req<{ progress: any }>('/progress'),
  putProgress: (data: unknown) => req<{ ok: boolean }>('/progress', { method: 'PUT', body: JSON.stringify(data) }),

  // admin
  adminUsers: () => req<{ users: ApiUser[] }>('/auth/admin/users'),
  adminProgress: () => req<{ progressByUser: Record<string, any> }>('/progress/admin/all'),
};
