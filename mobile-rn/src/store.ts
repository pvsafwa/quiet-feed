import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Channel, Video, PlaylistMeta, Prog, Cursor } from './lib/types';
import { api, ApiError, setAuthToken, type ApiUser } from './lib/api';
import { googleSignIn, googleSignOut } from './lib/auth';
import { normProg, emptyProg, registerPlaylist } from './lib/progress';

const TOKEN_KEY = 'qf_token';
const PREFS_KEY = 'qf_prefs';
const VISIT_KEY = 'qf_lastvisit';

export const SHORT_MAX = 60;

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');

let _saveT: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveProg(prog: Prog) {
  if (_saveT) clearTimeout(_saveT);
  _saveT = setTimeout(() => { api.putProgress(prog).catch((e) => console.warn('progress save failed', e)); }, 800);
}
function savePrefs(s: { hideShorts: boolean; autoRefreshMins: number }) {
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ hideShorts: s.hideShorts, autoRefreshMins: s.autoRefreshMins })).catch(() => {});
}

interface VidState { buffers: Record<string, Video[]>; cursors: Record<string, Cursor>; loaded: boolean }
interface PlState { items: PlaylistMeta[]; cursors: Record<string, Cursor>; loaded: boolean }

export interface Store {
  user: ApiUser | null;
  authReady: boolean;
  channels: Channel[];
  filter: string;
  search: string;
  hideShorts: boolean;
  autoRefreshMins: number;
  lastSeen: number;
  busy: boolean;
  vid: VidState;
  pl: PlState;
  sel: PlaylistMeta | null;
  selVideos: Video[];
  plDur: Record<string, number | undefined>;
  plDurLoading: Set<string>;
  prog: Prog;
  progV: number;
  banner: string | null;
  toastMsg: { msg: string; err: boolean; id: number } | null;
  // Currently-playing video. The player is a root-level overlay driven by this (same
  // model as the web app), not a navigation screen — that's what allows it to float
  // over the feed in PiP mode.
  cur: Video | null;

  init(): Promise<void>;
  openPlayer(v: Video): void;
  closePlayer(): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  afterLogin(): Promise<void>;
  loadChannels(): Promise<void>;
  commitProg(): void;
  persistProg(): void;
  toast(msg: string, err?: boolean): void;
  showError(msg: string): void;
  hideError(): void;
  addChannel(raw: string): Promise<void>;
  removeChannel(id: string): Promise<void>;
  setFilter(f: string): void;
  setSearch(q: string): void;
  setHideShorts(v: boolean): void;
  setAutoRefresh(mins: number): void;
  runVideos(reset: boolean): Promise<void>;
  runPlaylists(reset: boolean): Promise<void>;
  computePlaylistDurations(list: PlaylistMeta[]): Promise<void>;
  openPlaylist(p: PlaylistMeta): Promise<void>;
  closePlaylist(): void;
  toggleMonitor(p: { id: string; title: string; channelTitle: string; channelId?: string; count: number }): Promise<void>;
  markAllWatched(vids: Video[]): void;
  resetProg(): void;
}

export const useStore = create<Store>((set, get) => ({
  user: null,
  authReady: false,
  channels: [],
  filter: 'all',
  search: '',
  hideShorts: false,
  autoRefreshMins: 0,
  lastSeen: 0,
  busy: false,
  vid: { buffers: {}, cursors: {}, loaded: false },
  pl: { items: [], cursors: {}, loaded: false },
  sel: null,
  selVideos: [],
  plDur: {},
  plDurLoading: new Set<string>(),
  prog: emptyProg(),
  progV: 0,
  banner: null,
  toastMsg: null,
  cur: null,

  openPlayer(v) { set({ cur: v }); },
  closePlayer() { set({ cur: null }); get().commitProg(); },

  async init() {
    // Load device-local prefs + previous-visit stamp (powers the "New" badge), then auth.
    try {
      const [prefsRaw, visitRaw] = await Promise.all([AsyncStorage.getItem(PREFS_KEY), AsyncStorage.getItem(VISIT_KEY)]);
      const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
      set({ hideShorts: !!prefs.hideShorts, autoRefreshMins: +prefs.autoRefreshMins || 0, lastSeen: Number(visitRaw) || 0 });
      await AsyncStorage.setItem(VISIT_KEY, String(Date.now()));
    } catch { /* ignore */ }
    // Restore a saved session token if present.
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) setAuthToken(token);
    } catch { /* ignore */ }
    try {
      const { user } = await api.me();
      set({ user, authReady: true });
      if (user) await get().afterLogin();
    } catch {
      setAuthToken(null);
      set({ user: null, authReady: true });
    }
  },

  async signIn() {
    try {
      const idToken = await googleSignIn();
      const { user, token } = await api.google(idToken);
      if (token) { setAuthToken(token); await SecureStore.setItemAsync(TOKEN_KEY, token); }
      set({ user, banner: null });
      get().toast(`Signed in as ${user.name || user.email}`);
      await get().afterLogin();
    } catch (e: any) {
      // Don't surface the user-cancelled case as an error.
      if (e?.code === '-5' || /cancel/i.test(e?.message || '')) return;
      get().showError(errMsg(e));
    }
  },

  async signOut() {
    if (_saveT) clearTimeout(_saveT);
    await googleSignOut();
    try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* */ }
    setAuthToken(null);
    set({
      user: null, channels: [],
      vid: { buffers: {}, cursors: {}, loaded: false },
      pl: { items: [], cursors: {}, loaded: false },
      sel: null, selVideos: [], plDur: {}, plDurLoading: new Set<string>(),
      prog: emptyProg(), progV: get().progV + 1, filter: 'all', banner: null,
      cur: null,
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

  commitProg() { debouncedSaveProg(get().prog); set(s => ({ prog: { ...s.prog }, progV: s.progV + 1 })); },
  persistProg() { debouncedSaveProg(get().prog); },

  toast(msg, err = false) { set({ toastMsg: { msg, err, id: Date.now() } }); },
  showError(msg) { console.error('[Quiet Feed]', msg); set({ banner: msg }); },
  hideError() { set({ banner: null }); },

  async addChannel(raw) {
    if (!raw.trim()) return;
    if (get().user?.role !== 'admin') { get().toast('Only admins can add channels', true); return; }
    get().hideError();
    try {
      const { channel } = await api.addChannel(raw.trim());
      await get().loadChannels();
      get().toast('Added ' + channel.title);
      get().runVideos(true);
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
      channels, vid: { buffers, cursors, loaded: s.vid.loaded },
      pl: { items, cursors: plCursors, loaded: s.pl.loaded }, filter: s.filter === id ? 'all' : s.filter,
    };
    if (s.sel && s.sel.channelId === id) { patch.sel = null; patch.selVideos = []; }
    set(patch);
    get().toast('Channel removed');
  },

  setFilter(f) { set({ filter: f }); },
  setSearch(q) { set({ search: q }); },
  setHideShorts(v) { set({ hideShorts: v }); savePrefs(get()); },
  setAutoRefresh(mins) { set({ autoRefreshMins: Math.max(0, mins) }); savePrefs(get()); },

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
    if (feedItems(get()).length === 0 && err) get().showError(errMsg(err)); else get().hideError();
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
        items = items.concat(r.items.map(p => ({ ...p, channelTitle: c.title })));
        cursors[c.id] = { token: r.nextPageToken || '', done: !r.nextPageToken };
      } catch (e) { err = err || e; cursors[c.id] = { token: '', done: true }; }
    }));
    set({ pl: { items, cursors, loaded: true }, busy: false });
    if (items.length === 0 && err) get().showError(errMsg(err)); else get().hideError();
  },

  async computePlaylistDurations(list) {
    const s = get();
    const todo = list.filter(p => s.plDur[p.id] === undefined && !s.plDurLoading.has(p.id));
    if (!todo.length) return;
    set(st => { const n = new Set(st.plDurLoading); todo.forEach(p => n.add(p.id)); return { plDurLoading: n }; });
    const stop = (id: string) => set(st => { const n = new Set(st.plDurLoading); n.delete(id); return { plDurLoading: n }; });
    let idx = 0;
    const worker = async () => {
      while (idx < todo.length) {
        const p = todo[idx++];
        try {
          const { items: all } = await api.playlist(p.id);
          const tot = registerPlaylist(get().prog, { id: p.id, title: p.title, channelTitle: p.channelTitle, channelId: p.channelId }, all);
          set(st => ({ plDur: { ...st.plDur, [p.id]: tot } }));
        } catch (e) { set(st => ({ plDur: { ...st.plDur, [p.id]: 0 } })); console.warn('duration calc failed', e); }
        stop(p.id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
    get().commitProg();
  },

  async openPlaylist(p) {
    if (!p.channelId && get().prog.pl[p.id]) p = { ...p, channelId: get().prog.pl[p.id].channelId || '' };
    set({ sel: p, selVideos: [], busy: true, banner: null });
    let all: Video[] = [], err: any = null;
    try { all = (await api.playlist(p.id)).items; } catch (e) { err = e; }
    all.sort((a, b) => new Date(a.published).getTime() - new Date(b.published).getTime());
    if (all.length) registerPlaylist(get().prog, { id: p.id, title: p.title, channelTitle: p.channelTitle, channelId: p.channelId }, all);
    set(st => ({ selVideos: all, busy: false, plDur: { ...st.plDur, [p.id]: all.reduce((a, v) => a + (v.seconds || 0), 0) } }));
    if (!all.length && err) get().showError(errMsg(err)); else get().hideError();
    get().commitProg();
  },
  closePlaylist() { set({ sel: null, selVideos: [] }); },

  async toggleMonitor(p) {
    const prog = get().prog;
    if (prog.mon[p.id]) { delete prog.mon[p.id]; get().commitProg(); get().toast('Stopped tracking this course'); return; }
    prog.mon[p.id] = { title: p.title, channelId: p.channelId || prog.pl[p.id]?.channelId, channelTitle: p.channelTitle, count: p.count };
    get().commitProg(); get().toast('Now tracking this course');
    if (!prog.pl[p.id] || !(prog.pl[p.id].ids || []).length) {
      try { const { items: all } = await api.playlist(p.id); registerPlaylist(prog, { id: p.id, title: p.title, channelTitle: p.channelTitle, channelId: p.channelId }, all); get().commitProg(); }
      catch (e) { console.warn('monitor fetch failed', e); }
    }
  },

  markAllWatched(vids) {
    if (!vids.length) return;
    const prog = get().prog;
    vids.forEach(v => { const x = prog.v[v.id] || (prog.v[v.id] = { p: 0, d: 0, done: 0, w: 0, t: 0 }); if (v.seconds) x.d = v.seconds; x.done = 1; x.t = Date.now(); });
    get().commitProg();
    get().toast(`Marked ${vids.length} video${vids.length === 1 ? '' : 's'} watched`);
  },

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

export function watchHistory(s: Store): Video[] {
  const map = new Map<string, Video>();
  Object.values(s.vid.buffers).forEach(list => list.forEach(v => map.set(v.id, v)));
  s.selVideos.forEach(v => map.set(v.id, v));
  
  const history: Video[] = [];
  map.forEach(v => {
    const p = s.prog.v[v.id];
    if (p && (p.p > 0 || p.done)) history.push(v);
  });
  
  history.sort((a, b) => {
    const ta = s.prog.v[a.id]?.t || 0;
    const tb = s.prog.v[b.id]?.t || 0;
    return tb - ta;
  });
  
  return history;
}
