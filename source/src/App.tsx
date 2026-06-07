import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from './store';
import { Header, Banner, Toast, Tabs, Sidebar, Toolbar, SettingsPanel } from './components/shell';
import { VideosTab } from './components/videos';
import { PlaylistsTab, PlaylistDetail } from './components/playlists';
import { ProgressTab } from './components/progress';
import { PlayerModal } from './components/player';
import { Login, LoadingScreen } from './components/auth';
import { EmptyState, ErrorBoundary, ITv } from './components/states';

function NeedChannels() {
  const isAdmin = useStore(s => s.user?.role === 'admin');
  const setPanel = useStore(s => s.setPanel);
  if (isAdmin) {
    return <EmptyState icon={<ITv />} title="Add your first channel"
      body="You're an admin. Add a channel by @handle or URL in Setup — its videos and playlists appear here for everyone."
      action={<button className="btn primary" onClick={() => setPanel(true)}>Add a channel</button>} />;
  }
  return <EmptyState icon={<ITv />} title="No channels yet"
    body="An admin hasn't added any channels yet. Check back soon — your feed will appear here automatically." />;
}

export default function App() {
  const authReady = useStore(s => s.authReady);
  const user = useStore(s => s.user);
  const channels = useStore(s => s.channels);
  const tab = useStore(s => s.tab);
  const sel = useStore(s => s.sel);
  const autoRefreshMins = useStore(s => s.autoRefreshMins);
  const sidebarOpen = useStore(s => s.sidebarOpen);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const ready = !!user && channels.length > 0;

  // Auto-refresh the feed on an interval (paused while a video is open).
  useEffect(() => {
    if (!autoRefreshMins || !user || !channels.length) return;
    const id = setInterval(() => {
      const s = useStore.getState();
      if (!s.cur && !s.busy) s.refreshCurrent();
    }, autoRefreshMins * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefreshMins, user, channels.length]);

  // Android-style swipe: edge-swipe right opens the channel drawer; swipe left closes it.
  useEffect(() => {
    let sx = 0, sy = 0, st = 0, tracking = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return; tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st > 600) return;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return; // mostly-horizontal only
      const s = useStore.getState();
      if (!s.user || !s.channels.length || s.cur) return; // not while a video is open
      if (dx > 0 && sx < 40 && !s.sidebarOpen) s.toggleSidebar(true);
      else if (dx < 0 && s.sidebarOpen) s.toggleSidebar(false);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchend', onEnd); };
  }, []);

  // Auth gate: loading → login → app.
  if (!authReady) return <LoadingScreen />;
  if (!user) return <Login />;

  let content: React.ReactNode, routeKey: string;
  if (!channels.length) { content = <NeedChannels />; routeKey = 'chan'; }
  else if (tab === 'stats') { content = <ProgressTab />; routeKey = 'stats'; }
  else if (tab === 'videos') { content = <VideosTab />; routeKey = 'videos'; }
  else if (sel) { content = <PlaylistDetail />; routeKey = 'detail-' + sel.id; }
  else { content = <PlaylistsTab />; routeKey = 'playlists'; }

  return (
    <div className={`app ${ready ? 'has-nav' : ''} ${ready && sidebarOpen ? 'nav-open' : ''}`}>
      <Sidebar />
      <div className="scrim" onClick={() => toggleSidebar(false)} />
      <div className="wrap">
        <Header />
        <Banner />
        <SettingsPanel />
        <Tabs />
        <Toolbar />
        <main>
          <AnimatePresence mode="wait">
            <motion.div key={routeKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <ErrorBoundary onReset={() => { const s = useStore.getState(); s.closePlaylist(); s.switchTab('videos'); }}>
                {content}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
        <PlayerModal />
        <Toast />
      </div>
    </div>
  );
}
