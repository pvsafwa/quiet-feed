import { create } from 'zustand';
import type { Channel, Video, PlaylistMeta, Prog, Cursor, Tab } from './lib/types';
import { api, ApiError, type ApiUser } from './lib/api';
import { normProg, emptyProg, registerPlaylist, markDone } from './lib/progress';

// Only UI preferences live in the browser now; channels + progress live on the server.
const LS = { prefs: 'qf_prefs', visit: 'qf_lastvisit' };
function loadJSON<T>(k: string, d: T): T { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } }

interface Prefs { hideShorts: boolean; autoRefreshMins: number }
const defaultPrefs: Prefs = { hideShorts: false, autoRefreshMins: 0 };

// Durations at or below this (in seconds) are treated as YouTube Shorts.
export const SHORT_MAX = 60;

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');

let _saveT: any;
// Persist progress to the server (debounced) so it follows the user across devices.
function debouncedSaveProg(prog: Prog) {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => { api.putProgress(prog).catch((e) => console.warn('progress save failed', e)); }, 700);
}
function savePrefs(s: { hideShorts: boolean; autoRefreshMins: number }) {
  try { localStorage.setItem(LS.prefs, JSON.stringify({ hideShorts: s.hideShorts, autoRefreshMins: s.autoRefreshMins })); } catch { /* ignore */ }
}

interface VidState { buffers: Record<string, Video[]>; cursors: Record<string, Cursor>; loaded: boolean }
interface PlState { items: PlaylistMeta[]; cursors: Record<string, Cursor>; loaded: boolean }

export interface Store {
  user: ApiUser | null;
  authReady: boolean;
  channels: Channel[];
  filter: string;
  search: string;
  sidebarOpen: boolean;
  hideShorts: boolean;
  autoRefreshMins: number;
  lastSeen: number;
  tab: Tab;
  busy: boolean;
  vid: VidState;
  pl: PlState;
  sel: PlaylistMeta | null;
  selVideos: Video[];
  plDur: Record<string, number | undefined>;
  plDurLoading: Set<string>;
  prog: Prog;
  progV: number;
  cur: Video | null;
  panelOpen: boolean;
  banner: string | null;
  toastMsg: { msg: string; err: boolean; id: number } | null;

  init(): void;
  loadAuth(): Promise<void>;
  signIn(credential: string): Promise<void>;
  signOut(): Promise<void>;
  afterLogin(): Promise<void>;
  loadChannels(): Promise<void>;
  commitProg(): void;
  persistProg(): void;
  toast(msg: string, err?: boolean): void;
  showError(msg: string): void;
  hideError(): void;
  setPanel(open?: boolean): void;
  addChannel(raw: string): Promise<void>;
  removeChannel(id: string): Promise<void>;
  setFilter(f: string): void;
  setSearch(q: string): void;
  toggleSidebar(open?: boolean): void;
  setHideShorts(v: boolean): void;
  setAutoRefresh(mins: number): void;
  switchTab(t: Tab): void;
  refreshCurrent(): void;
  runVideos(reset: boolean): Promise<void>;
  runPlaylists(reset: boolean): Promise<void>;
  computePlaylistDurations(list: PlaylistMeta[]): Promise<void>;
  openPlaylist(p: PlaylistMeta): Promise<void>;
  closePlaylist(): void;
  toggleMonitor(p: { id: string; title: string; channelTitle: string; channelId?: string; count: number }): Promise<void>;
  markAllWatched(vids: Video[]): void;
  openPlayer(v: Video): void;
  closePlayer(): void;
  resetProg(): void;
}

const _prefs = loadJSON<Prefs>(LS.prefs, defaultPrefs);

export const useStore = create<Store>((set, get) => ({
  user: null,
  authReady: false,
  channels: [],
  filter: 'all',
  search: '',
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 980 : true,
  hideShorts: !!_prefs.hideShorts,
  autoRefreshMins: +_prefs.autoRefreshMins || 0,
  lastSeen: Number(localStorage.getItem(LS.visit)) || 0,
  tab: 'videos',
  busy: false,
  vid: { buffers: {}, cursors: {}, loaded: false },
  pl: { items: [], cursors: {}, loaded: false },
  sel: null,
  selVideos: [],
  plDur: {},
  plDurLoading: new Set<string>(),
  prog: emptyProg(),
  progV: 0,
  cur: null,
  panelOpen: false,
  banner: null,
  toastMsg: null,

  init() {
    // Remember the previous visit, then stamp this one (powers the "New" badge).
    try { localStorage.setItem(LS.visit, String(Date.now())); } catch { /* ignore */ }
    get().loadAuth();
  },

  async loadAuth() {
    try {
      const { user } = await api.me();
      set({ user, authReady: true });
      if (user) await get().afterLogin();
    } catch (e) {
      set({ user: null, authReady: true });
      console.warn('auth check failed', e);
    }
  },

  async signIn(credential) {
    try {
      const { user } = await api.google(credential);
      set({ user, banner: null });
      get().toast(`Signed in as ${user.name || user.email}`);
      await get().afterLogin();
    } catch (e) { get().showError(errMsg(e)); }
  },

  async signOut() {
    clearTimeout(_saveT);
    try { await api.logout(); } catch { /* ignore */ }
    set({
      user: null,
      channels: [],
      vid: { buffers: {}, cursors: {}, loaded: false },
      pl: { items: [], cursors: {}, loaded: false },
      sel: null, selVideos: [], plDur: {}, plDurLoading: new Set<string>(),
      prog: emptyProg(), progV: get().progV + 1,
      filter: 'all', tab: 'videos', panelOpen: false, banner: null,
    });
    get().toast('Signed out');
  },

  async afterLogin() {
    await get().loadChannels();
    try { const { progress } = await api.getProgress(); set({ prog: normProg(progress), progV: get().progV + 1 }); }
    catch (e) { console.warn('progress load failed', e); }
    if (get().channels.length) get().runVideos(true);
  },

  async loadChannels() {
    try { const { channels } = await api.channels(); set({ channels }); }
    catch (e) { get().showError(errMsg(e)); }
  },

  // Replace the top-level prog reference so referential-equality subscribers re-render
  // reliably; nested objects are mutated in place during playback ticks by design.
  commitProg() { debouncedSaveProg(get().prog); set(s => ({ prog: { ...s.prog }, progV: s.progV + 1 })); },
  persistProg() { debouncedSaveProg(get().prog); },

  toast(msg, err = false) { set({ toastMsg: { msg, err, id: Date.now() } }); },
  showError(msg) { console.error('[Quiet Feed]', msg); set({ banner: msg }); },
  hideError() { set({ banner: null }); },
  setPanel(open) { set(s => ({ panelOpen: open ?? !s.panelOpen })); },

  async addChannel(raw) {
    if (!raw.trim()) return;
    if (get().user?.role !== 'admin') { get().toast('Only admins can add channels', true); return; }
    get().hideError();
    try {
      const { channel } = await api.addChannel(raw.trim());
      await get().loadChannels();
      get().toast('Added ' + channel.title);
      get().refreshCurrent();
    } catch (e) { get().showError(errMsg(e)); }
  },

  async removeChannel(id) {
    if (get().user?.role !== 'admin') { get().toast('Only admins can remove channels', true); return; }
    try { await api.removeChannel(id); } catch (e) { get().toast(errMsg(e), true); return; }
    const s = get();
    const channels = s.channels.filter(c => c.id !== id);
    const buffers = { ...s.vid.buffers }; delete buffers[id];
    const cursors = { ...s.vid.cursors }; delete cursors[id];
    const plCursors = { ...s.pl.cursors }; delete plCursors[id];
    const items = s.pl.items.filter(p => p.channelId !== id);
    const patch: Partial<Store> = {
      channels,
      vid: { buffers, cursors, loaded: s.vid.loaded },
      pl: { items, cursors: plCursors, loaded: s.pl.loaded },
      filter: s.filter === id ? 'all' : s.filter,
    };
    if (s.sel && s.sel.channelId === id) { patch.sel = null; patch.selVideos = []; }
    set(patch);
    get().toast('Channel removed');
  },

  setFilter(f) { set({ filter: f }); },
  setSearch(q) { set({ search: q }); },
  toggleSidebar(open) { set(s => ({ sidebarOpen: open ?? !s.sidebarOpen })); },
  setHideShorts(v) { set({ hideShorts: v }); savePrefs(get()); },
  setAutoRefresh(mins) { set({ autoRefreshMins: Math.max(0, mins) }); savePrefs(get()); },

  switchTab(t) {
    const s = get();
    if (s.tab === t && !s.sel) return;
    set({ tab: t, sel: null, selVideos: [] });
    if (t === 'videos' && !get().vid.loaded) { get().runVideos(true); return; }
    if (t === 'playlists' && !get().pl.loaded) { get().runPlaylists(true); return; }
  },
  refreshCurrent() {
    const s = get();
    if (s.tab === 'stats') { set(x => ({ progV: x.progV + 1 })); return; }
    if (s.sel) { get().openPlaylist(s.sel); return; }
    if (s.tab === 'videos') { get().runVideos(true); return; }
    get().runPlaylists(true);
  },

  async runVideos(reset) {
    let s = get();
    if (!s.channels.length) return;
    set({ busy: true });
    if (reset) set({ vid: { buffers: {}, cursors: {}, loaded: false } });
    s = get();
    const relevant = s.filter === 'all' ? s.channels : s.channels.filter(c => c.id === s.filter);
    const chans = reset ? s.channels : relevant.filter(c => !s.vid.cursors[c.id]?.done);
    const buffers = { ...get().vid.buffers };
    const cursors = { ...get().vid.cursors };
    let err: any = null;
    await Promise.all(chans.map(async c => {
      const token = reset ? '' : (cursors[c.id]?.token || '');
      try {
        const r = await api.uploads(c.id, token);
        buffers[c.id] = (buffers[c.id] || []).concat(r.items);
        cursors[c.id] = { token: r.nextPageToken || '', done: !r.nextPageToken };
      } catch (e) { err = err || e; cursors[c.id] = { token: '', done: true }; }
    }));
    set({ vid: { buffers, cursors, loaded: true }, busy: false });
    if (feedItems(get()).length === 0 && err) { get().showError(errMsg(err)); }
    else get().hideError();
  },

  async runPlaylists(reset) {
    let s = get();
    if (!s.channels.length) return;
    set({ busy: true });
    if (reset) set({ pl: { items: [], cursors: {}, loaded: false } });
    s = get();
    const relevant = s.filter === 'all' ? s.channels : s.channels.filter(c => c.id === s.filter);
    const chans = reset ? s.channels : relevant.filter(c => !s.pl.cursors[c.id]?.done);
    let items = [...get().pl.items];
    const cursors = { ...get().pl.cursors };
    let err: any = null;
    await Promise.all(chans.map(async c => {
      const token = reset ? '' : (cursors[c.id]?.token || '');
      try {
        const r = await api.channelPlaylists(c.id, token);
        const withTitle = r.items.map(p => ({ ...p, channelTitle: c.title }));
        items = items.concat(withTitle);
        cursors[c.id] = { token: r.nextPageToken || '', done: !r.nextPageToken };
      } catch (e) { err = err || e; cursors[c.id] = { token: '', done: true }; }
    }));
    set({ pl: { items, cursors, loaded: true }, busy: false });
    if (items.length === 0 && err) { get().showError(errMsg(err)); }
    else get().hideError();
  },

  async computePlaylistDurations(list) {
    const s = get();
    const todo = list.filter(p => s.plDur[p.id] === undefined && !s.plDurLoading.has(p.id));
    if (!todo.length) return;
    set(st => { const n = new Set(st.plDurLoading); todo.forEach(p => n.add(p.id)); return { plDurLoading: n }; });
    const stopLoading = (id: string) => set(st => { const n = new Set(st.plDurLoading); n.delete(id); return { plDurLoading: n }; });
    let idx = 0;
    const worker = async () => {
      while (idx < todo.length) {
        const p = todo[idx++];
        try {
          const { items: all } = await api.playlist(p.id);
          const tot = registerPlaylist(get().prog, { id: p.id, title: p.title, channelTitle: p.channelTitle, channelId: p.channelId }, all);
          set(st => ({ plDur: { ...st.plDur, [p.id]: tot } }));
        } catch (e) { set(st => ({ plDur: { ...st.plDur, [p.id]: 0 } })); console.warn('duration calc failed', p.title, e); }
        stopLoading(p.id);
      }
    };
    const POOL = Math.min(3, todo.length);
    await Promise.all(Array.from({ length: POOL }, worker));
    get().commitProg();
  },

  async openPlaylist(p) {
    if (!p.channelId && get().prog.pl[p.id]) p = { ...p, channelId: get().prog.pl[p.id].channelId || '' };
    set({ sel: p, selVideos: [], busy: true, banner: null });
    let all: Video[] = [], err: any = null;
    try { all = (await api.playlist(p.id)).items; } catch (e) { err = e; }
    all.sort((a, b) => new Date(a.published).getTime() - new Date(b.published).getTime()); // oldest first
    if (all.length) registerPlaylist(get().prog, { id: p.id, title: p.title, channelTitle: p.channelTitle, channelId: p.channelId }, all);
    set(st => ({ selVideos: all, busy: false, plDur: { ...st.plDur, [p.id]: all.reduce((a, v) => a + (v.seconds || 0), 0) } }));
    if (!all.length && err) { get().showError(errMsg(err)); }
    else get().hideError();
    get().commitProg();
  },
  closePlaylist() { set({ sel: null, selVideos: [] }); },

  async toggleMonitor(p) {
    const prog = get().prog;
    if (prog.mon[p.id]) { delete prog.mon[p.id]; get().commitProg(); get().toast('Stopped tracking this course'); return; }
    prog.mon[p.id] = { title: p.title, channelId: p.channelId || prog.pl[p.id]?.channelId, channelTitle: p.channelTitle, count: p.count };
    get().commitProg(); get().toast('Now tracking this course');
    if (!prog.pl[p.id] || !(prog.pl[p.id].ids || []).length) {
      try {
        const { items: all } = await api.playlist(p.id);
        registerPlaylist(prog, { id: p.id, title: p.title, channelTitle: p.channelTitle, channelId: p.channelId }, all);
        get().commitProg();
      } catch (e) { console.warn('monitor fetch failed', e); }
    }
  },

  markAllWatched(vids) {
    if (!vids.length) return;
    const prog = get().prog;
    vids.forEach(v => markDone(prog, v.id, v.seconds));
    get().commitProg();
    get().toast(`Marked ${vids.length} video${vids.length === 1 ? '' : 's'} watched`);
  },

  openPlayer(v) { set({ cur: v }); },
  closePlayer() { set({ cur: null }); get().commitProg(); },
  resetProg() { set({ prog: emptyProg(), progV: get().progV + 1, plDur: {} }); debouncedSaveProg(get().prog); get().toast('Progress reset'); },
}));

// ---- derived selectors (pure) ----
export function feedItems(s: Store): Video[] {
  const all = ([] as Video[]).concat(...Object.values(s.vid.buffers));
  const seen: Record<string, 1> = {}; let out: Video[] = [];
  for (const v of all) { if (!seen[v.id]) { seen[v.id] = 1; out.push(v); } }
  out.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  if (s.filter !== 'all') out = out.filter(v => v.channelId === s.filter);
  if (s.hideShorts) out = out.filter(v => !(v.seconds != null && v.seconds > 0 && v.seconds <= SHORT_MAX));
  const q = s.search.trim().toLowerCase();
  if (q) out = out.filter(v => v.title.toLowerCase().includes(q) || (v.channelTitle || '').toLowerCase().includes(q));
  return out;
}
export function hasMoreVideos(s: Store): boolean {
  const chans = s.filter === 'all' ? s.channels : s.channels.filter(c => c.id === s.filter);
  return chans.some(c => !s.vid.cursors[c.id]?.done);
}
export function plList(s: Store): PlaylistMeta[] {
  let list = s.pl.items.slice();
  if (s.filter !== 'all') list = list.filter(p => p.channelId === s.filter);
  const q = s.search.trim().toLowerCase();
  if (q) list = list.filter(p => (p.title || '').toLowerCase().includes(q) || (p.channelTitle || '').toLowerCase().includes(q));
  list.sort((a, b) => (a.channelTitle || '').localeCompare(b.channelTitle || '') || (a.title || '').localeCompare(b.title || ''));
  return list;
}
export function hasMorePlaylists(s: Store): boolean {
  const chans = s.filter === 'all' ? s.channels : s.channels.filter(c => c.id === s.filter);
  return chans.some(c => !s.pl.cursors[c.id]?.done);
}
