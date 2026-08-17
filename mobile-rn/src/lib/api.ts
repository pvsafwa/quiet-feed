// Backend client for the native app. Uses a Bearer token (set after sign-in) instead
// of cookies. React Native's fetch isn't bound by browser CORS, so this is simple.
import { API_URL } from '../config';
import type { Video, PlaylistMeta, ChannelLanguage } from './types';

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: 'user' | 'admin';
  created_at?: string;
  last_login?: string;
}

export interface ApiChannel {
  id: string;
  title: string;
  thumb: string;
  uploads: string;
  language?: ChannelLanguage | string;
}

export interface PageResult {
  items: Video[];
  nextPageToken: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

let _token: string | null = null;
export function setAuthToken(t: string | null) { _token = t; }

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) headers['x-timezone'] = tz;
  } catch {}
  if (opts.body) headers['Content-Type'] = 'application/json';
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  let r: Response;
  try {
    r = await fetch(`${API_URL}/api${path}`, { ...opts, headers });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }
  const text = await r.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!r.ok) throw new ApiError(j?.error || `Request failed (${r.status}).`, r.status);
  return j as T;
}

const qp = (token: string) => (token ? `?pageToken=${encodeURIComponent(token)}` : '');

export const api = {
  me: () => req<{ user: ApiUser | null }>('/auth/me'),
  // Backend returns { user, token } for native clients (token = Bearer JWT).
  google: (credential: string) => req<{ user: ApiUser; token?: string }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  channels: () => req<{ channels: ApiChannel[] }>('/channels'),
  addChannel: (input: string, language: string = 'English') => req<{ channel: ApiChannel }>('/channels', { method: 'POST', body: JSON.stringify({ input, language }) }),
  removeChannel: (id: string) => req<{ ok: boolean }>(`/channels/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  uploads: (channelId: string, token = '') => req<PageResult>(`/channels/${encodeURIComponent(channelId)}/uploads${qp(token)}`),
  channelPlaylists: (channelId: string, token = '') => req<{ items: PlaylistMeta[]; nextPageToken: string | null }>(`/channels/${encodeURIComponent(channelId)}/playlists${qp(token)}`),
  playlist: (id: string) => req<{ items: Video[] }>(`/playlists/${encodeURIComponent(id)}`),
  videoMeta: (id: string) => req<{ description: string; views?: number }>(`/videos/${encodeURIComponent(id)}/meta`),

  getProgress: () => req<{ progress: any }>('/progress'),
  putProgress: (data: unknown) => req<{ ok: boolean }>('/progress', { method: 'PUT', body: JSON.stringify(data) }),

  adminUsers: () => req<{ users: ApiUser[] }>('/auth/admin/users'),
  adminProgress: () => req<{ progressByUser: Record<string, any> }>('/progress/admin/all'),
};
