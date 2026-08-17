import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Channel, Video, PlaylistMeta, Prog, Cursor, AdminUserData } from './lib/types';
import { api, ApiError, setAuthToken, type ApiUser } from './lib/api';
import { googleSignIn, googleSignOut } from './lib/auth';
import { normProg, emptyProg, registerPlaylist } from './lib/progress';
import { checkForUpdate, snoozeUpdate, type AppRelease, CURRENT_APP_VERSION } from './lib/updater';

const TOKEN_KEY = 'qf_token';
const PREFS_KEY = 'qf_prefs';
const VISIT_KEY = 'qf_lastvisit';
const USER_CHANNELS_KEY = 'qf_user_selected_channels';

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
  selectedChannelIds: string[] | null; // null means all channels selected by default
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
  cur: Video | null;
  playerQueue: Video[];      // The list context when player was opened
  playerQueueIdx: number;    // Index of cur in playerQueue
  drawerOpen: boolean;

  // In-app update state
  updateRelease: AppRelease | null;
  updateModalOpen: boolean;
  checkingUpdate: boolean;

  init(): Promise<void>;
  openPlayer(v: Video, queue?: Video[]): void;
  closePlayer(): void;
  playNext(): boolean;
  playPrev(): boolean;
  setDrawerOpen(open: boolean): void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  afterLogin(): Promise<void>;
  loadChannels(): Promise<void>;
  commitProg(): void;
  persistProg(): void;
  toast(msg: string, err?: boolean): void;
  showError(msg: string): void;
  hideError(): void;
  addChannel(raw: string, language?: string): Promise<void>;
  removeChannel(id: string): Promise<void>;
  toggleChannelSelection(id: string): void;
  selectAllChannels(): void;
  deselectAllChannels(): void;
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

  checkAppUpdate(manual?: boolean): Promise<void>;
  dismissUpdateModal(): void;
  snoozeAppUpdate(): Promise<void>;

  fetchAdminDashboardData(): Promise<AdminUserData[]>;
}

export const useStore = create<Store>((set, get) => ({
  user: null,
  authReady: false,
  channels: [],
  selectedChannelIds: null,
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
  playerQueue: [],
  playerQueueIdx: -1,
  drawerOpen: false,

  updateRelease: null,
  updateModalOpen: false,
  checkingUpdate: false,

  openPlayer(v, queue) {
    const q = queue || [];
    const idx = q.findIndex(item => item.id === v.id);
    set({ cur: v, playerQueue: q, playerQueueIdx: idx >= 0 ? idx : 0 });
  },
  closePlayer() { set({ cur: null, playerQueue: [], playerQueueIdx: -1 }); get().commitProg(); },
  playNext() {
    const { playerQueue, playerQueueIdx } = get();
    const nextIdx = playerQueueIdx + 1;
    if (nextIdx < playerQueue.length) {
      set({ cur: playerQueue[nextIdx], playerQueueIdx: nextIdx });
      return true;
    }
    return false;
  },
  playPrev() {
    const { playerQueue, playerQueueIdx } = get();
    const prevIdx = playerQueueIdx - 1;
    if (prevIdx >= 0) {
      set({ cur: playerQueue[prevIdx], playerQueueIdx: prevIdx });
      return true;
    }
    return false;
  },
  setDrawerOpen(open) { set({ drawerOpen: open }); },

  async init() {
    // Load device-local prefs + previous-visit stamp + user-selected channels
    try {
      const [prefsRaw, visitRaw, userChansRaw] = await Promise.all([
        AsyncStorage.getItem(PREFS_KEY),
        AsyncStorage.getItem(VISIT_KEY),
        AsyncStorage.getItem(USER_CHANNELS_KEY),
      ]);
      const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
      const selectedChannelIds = userChansRaw ? JSON.parse(userChansRaw) : null;

      set({
        hideShorts: !!prefs.hideShorts,
        autoRefreshMins: +prefs.autoRefreshMins || 0,
        lastSeen: Number(visitRaw) || 0,
        selectedChannelIds,
      });
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

    // Check for app updates non-blockingly
    get().checkAppUpdate(false);
  },

  async checkAppUpdate(manual = false) {
    if (get().checkingUpdate) return;
    set({ checkingUpdate: true });
    try {
      const release = await checkForUpdate({ manual });
      if (release) {
        set({ updateRelease: release, updateModalOpen: true });
      } else if (manual) {
        get().toast(`You're up to date (v${CURRENT_APP_VERSION})`);
      }
    } catch (e) {
      if (manual) get().toast('Could not check for updates', true);
    } finally {
      set({ checkingUpdate: false });
    }
  },

  dismissUpdateModal() {
    set({ updateModalOpen: false });
  },

  async snoozeAppUpdate() {
    await snoozeUpdate(24);
    set({ updateModalOpen: false });
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
      cur: null, playerQueue: [], playerQueueIdx: -1,
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

  toggleChannelSelection(id: string) {
    const s = get();
    let currentSelected = s.selectedChannelIds;
    if (currentSelected === null) {
      currentSelected = s.channels.map(c => c.id);
    }
    const exists = currentSelected.includes(id);
    const nextSelected = exists
      ? currentSelected.filter(x => x !== id)
      : [...currentSelected, id];

    set({ selectedChannelIds: nextSelected });
    AsyncStorage.setItem(USER_CHANNELS_KEY, JSON.stringify(nextSelected)).catch(() => {});
  },

  selectAllChannels() {
    const allIds = get().channels.map(c => c.id);
    set({ selectedChannelIds: allIds });
    AsyncStorage.setItem(USER_CHANNELS_KEY, JSON.stringify(allIds)).catch(() => {});
  },

  deselectAllChannels() {
    set({ selectedChannelIds: [] });
    AsyncStorage.setItem(USER_CHANNELS_KEY, JSON.stringify([])).catch(() => {});
  },

  commitProg() { debouncedSaveProg(get().prog); set(s => ({ prog: { ...s.prog }, progV: s.progV + 1 })); },
  persistProg() { debouncedSaveProg(get().prog); },

  toast(msg, err = false) { set({ toastMsg: { msg, err, id: Date.now() } }); },
  showError(msg) { console.error('[Quiet Feed]', msg); set({ banner: msg }); },
  hideError() { set({ banner: null }); },

  async addChannel(raw, language = 'English') {
    if (!raw.trim()) return;
    if (get().user?.role !== 'admin') { get().toast('Only admins can add channels', true); return; }
    get().hideError();
    try {
      const { channel } = await api.addChannel(raw.trim(), language);
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
    const active = userActiveChannels(s);
    const relevant = s.filter === 'all' ? active : active.filter(c => c.id === s.filter);
    const chans = reset ? active : relevant.filter(c => !s.vid.cursors[c.id]?.done);
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
    const active = userActiveChannels(s);
    const relevant = s.filter === 'all' ? active : active.filter(c => c.id === s.filter);
    const chans = reset ? active : relevant.filter(c => !s.pl.cursors[c.id]?.done);
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

  async fetchAdminDashboardData(): Promise<AdminUserData[]> {
    const [usersRes, progRes] = await Promise.all([
      api.adminUsers().catch(() => ({ users: [] })),
      api.adminProgress().catch(() => ({ progressByUser: {} })),
    ]);

    const users = usersRes.users || [];
    const progressMap: Record<string, any> = progRes.progressByUser || {};

    return users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      picture: u.picture,
      role: u.role,
      created_at: u.created_at || '',
      last_login: u.last_login || '',
      progress: progressMap[u.id] ? normProg(progressMap[u.id]) : emptyProg(),
    }));
  },
}));

// ---- derived selectors (pure, fully null-safe) ----
export function userActiveChannels(s: Partial<Store> | null | undefined): Channel[] {
  const channels = s?.channels || [];
  if (!s?.selectedChannelIds) return channels;
  return channels.filter(c => s.selectedChannelIds!.includes(c.id));
}

export function feedItems(s: Partial<Store> | null | undefined): Video[] {
  const active = userActiveChannels(s);
  const activeIds = new Set(active.map(c => c.id));
  const buffers = s?.vid?.buffers || {};
  const all = ([] as Video[]).concat(...Object.values(buffers)).filter(v => activeIds.size === 0 || activeIds.has(v.channelId));
  const seen: Record<string, 1> = {}; let out: Video[] = [];
  for (const v of all) { if (!seen[v.id]) { seen[v.id] = 1; out.push(v); } }
  out.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  if (s?.filter && s.filter !== 'all') out = out.filter(v => v.channelId === s.filter);
  if (s?.hideShorts) out = out.filter(v => !(v.seconds != null && v.seconds > 0 && v.seconds <= SHORT_MAX));
  const q = (s?.search || '').trim().toLowerCase();
  if (q) out = out.filter(v => v.title.toLowerCase().includes(q) || (v.channelTitle || '').toLowerCase().includes(q));
  return out;
}

export function hasMoreVideos(s: Partial<Store> | null | undefined): boolean {
  const active = userActiveChannels(s);
  const chans = !s?.filter || s.filter === 'all' ? active : active.filter(c => c.id === s.filter);
  const cursors = s?.vid?.cursors || {};
  return chans.some(c => !cursors[c.id]?.done);
}

export function plList(s: Partial<Store> | null | undefined): PlaylistMeta[] {
  const active = userActiveChannels(s);
  const activeIds = new Set(active.map(c => c.id));
  const items = s?.pl?.items || [];
  let list = items.filter(p => activeIds.size === 0 || activeIds.has(p.channelId));
  if (s?.filter && s.filter !== 'all') list = list.filter(p => p.channelId === s.filter);
  const q = (s?.search || '').trim().toLowerCase();
  if (q) list = list.filter(p => (p.title || '').toLowerCase().includes(q) || (p.channelTitle || '').toLowerCase().includes(q));
  list.sort((a, b) => (a.channelTitle || '').localeCompare(b.channelTitle || '') || (a.title || '').localeCompare(b.title || ''));
  return list;
}

export function hasMorePlaylists(s: Partial<Store> | null | undefined): boolean {
  const active = userActiveChannels(s);
  const chans = !s?.filter || s.filter === 'all' ? active : active.filter(c => c.id === s.filter);
  const cursors = s?.pl?.cursors || {};
  return chans.some(c => !cursors[c.id]?.done);
}

export function watchHistory(s: Partial<Store> | null | undefined): Video[] {
  const map = new Map<string, Video>();
  const buffers = s?.vid?.buffers || {};
  Object.values(buffers).forEach(list => list.forEach(v => map.set(v.id, v)));
  (s?.selVideos || []).forEach(v => map.set(v.id, v));

  const history: Video[] = [];
  const progV = s?.prog?.v || {};
  map.forEach(v => {
    const p = progV[v.id];
    if (p && (p.p > 0 || p.done)) history.push(v);
  });

  history.sort((a, b) => {
    const ta = progV[a.id]?.t || 0;
    const tb = progV[b.id]?.t || 0;
    return tb - ta;
  });

  return history;
}
