export interface Channel {
  id: string;
  title: string;
  thumb: string;
  uploads: string;
}

export interface Video {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  channelThumb: string;
  published: string;
  thumb: string;
  dur?: string;
  seconds?: number;
  views?: number;
}

export interface PlaylistMeta {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  count: number;
  thumb: string;
}

export interface PageResult {
  items: Video[];
  nextPageToken: string | null;
}
