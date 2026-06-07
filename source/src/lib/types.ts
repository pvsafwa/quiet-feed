export interface Channel { id: string; title: string; thumb: string; uploads: string }

export interface Video {
  id: string; title: string;
  channelId: string; channelTitle: string; channelThumb: string;
  published: string; thumb: string;
  dur?: string; seconds?: number; views?: number;
}

export interface PlaylistMeta {
  id: string; title: string;
  channelId: string; channelTitle: string;
  count: number; thumb: string;
}

export interface VProg { p: number; d: number; done: 0 | 1; w: number; t: number }
export interface PlMembership { ids: string[]; total: number; title: string; channel: string; channelId?: string }
export interface MonMeta { title: string; channelId?: string; channelTitle: string; count: number }

export interface Prog {
  v: Record<string, VProg>;
  day: Record<string, number>;
  pl: Record<string, PlMembership>;
  mon: Record<string, MonMeta>;
}

export interface Cursor { token: string; done: boolean }
export type Tab = 'videos' | 'playlists' | 'stats';

export class YtError extends Error {
  reason: string; status?: number;
  constructor(message: string, reason = '', status?: number) {
    super(message); this.reason = reason; this.status = status;
  }
}
