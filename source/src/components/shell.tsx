import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { IRefresh, IGear, IList, IPlay, IChart, IAlert, IMenu, IPlus, IBack } from './states';

export function Header() {
  const busy = useStore(s => s.busy);
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const refresh = useStore(s => s.refreshCurrent);
  const setPanel = useStore(s => s.setPanel);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  return (
    <header>
      <div className="brand">
        {ready && (
          <motion.button className="btn icon menubtn" title="Channels" aria-label="Toggle channels" onClick={() => toggleSidebar()} whileTap={{ scale: 0.9 }}>
            <IMenu />
          </motion.button>
        )}
        <div className="mark"><IPlay style={{ marginLeft: 2 }} /></div>
        <div>
          <h1>My <i>Tube</i></h1>
          <p>ONLY YOUR CHANNELS · NO RABBIT HOLES</p>
        </div>
      </div>
      <div className="actions">
        <motion.button className="btn icon" title="Refresh" disabled={!ready || busy} onClick={() => refresh()} whileTap={{ scale: 0.92 }}>
          <IRefresh className={busy ? 'spin' : ''} />
        </motion.button>
        <motion.button className="btn" onClick={() => setPanel()} whileTap={{ scale: 0.96 }}><IGear />Setup</motion.button>
      </div>
    </header>
  );
}

export function Banner() {
  const banner = useStore(s => s.banner);
  const hide = useStore(s => s.hideError);
  return (
    <AnimatePresence>
      {banner && (
        <motion.div className="banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <IAlert className="bic" />
          <div>
            <b>That didn't work.</b><br />
            {banner.split('\n').map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>)}
          </div>
          <button className="bx" onClick={hide} title="Dismiss">×</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toast() {
  const toast = useStore(s => s.toastMsg);
  const [show, setShow] = useState(false);
  const timer = useRef<any>();
  useEffect(() => {
    if (!toast) return;
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), toast.err ? 5000 : 2600);
    return () => clearTimeout(timer.current);
  }, [toast]);
  return (
    <div className={`toast ${show ? 'show' : ''} ${toast?.err ? 'err' : ''}`}>
      <div className="bar" /><span>{toast?.msg}</span>
    </div>
  );
}

export function Tabs() {
  const tab = useStore(s => s.tab);
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const switchTab = useStore(s => s.switchTab);
  if (!ready) return null;
  // Icon-only to stay compact on phones in portrait. Labels live in title/aria-label.
  const T = ({ id, icon, label }: { id: any; icon: React.ReactNode; label: string }) => (
    <button className={`tab icononly ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)} title={label} aria-label={label}>{icon}</button>
  );
  return (
    <div className="tabs" style={{ display: 'inline-flex' }}>
      <T id="videos" icon={<IPlay />} label="Videos" />
      <T id="playlists" icon={<IList />} label="Playlists" />
      <T id="stats" icon={<IChart />} label="Progress" />
    </div>
  );
}

// Vertical, collapsible channel drawer (replaces the old horizontal chip bar).
// Docked on wide screens; an overlay drawer with a scrim on phones.
export function Sidebar() {
  const channels = useStore(s => s.channels);
  const filter = useStore(s => s.filter);
  const open = useStore(s => s.sidebarOpen);
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const isAdmin = useStore(s => s.user?.role === 'admin');
  const setFilter = useStore(s => s.setFilter);
  const removeChannel = useStore(s => s.removeChannel);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const setPanel = useStore(s => s.setPanel);
  if (!ready) return null;

  // Selecting a channel always lands you on a list view that the filter affects.
  const pick = (id: string) => {
    const s = useStore.getState();
    if (s.sel) s.closePlaylist();
    if (s.tab === 'stats') s.switchTab('videos');
    setFilter(id);
    if (typeof window !== 'undefined' && window.innerWidth < 980) toggleSidebar(false);
  };

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sb-head">
        <span className="sb-title">Channels</span>
        <button className="btn icon sb-collapse" title="Hide channels" aria-label="Hide channels" onClick={() => toggleSidebar(false)}><IBack /></button>
      </div>
      <nav className="sb-list">
        <button className={`sb-item ${filter === 'all' ? 'active' : ''}`} onClick={() => pick('all')}>
          <span className="sb-ic all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg></span>
          <span className="sb-name">All channels</span>
        </button>
        {channels.map(c => (
          <button key={c.id} className={`sb-item ${filter === c.id ? 'active' : ''}`} onClick={() => pick(c.id)}>
            <img className="sb-av" src={c.thumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
            <span className="sb-name">{c.title}</span>
            {isAdmin && <span className="sb-rm" title="Remove channel" onClick={e => { e.stopPropagation(); if (confirm(`Remove ${c.title}?`)) removeChannel(c.id); }}>×</span>}
          </button>
        ))}
      </nav>
      {isAdmin && (
        <div className="sb-foot">
          <button className="btn sb-add" onClick={() => setPanel(true)}><IPlus />Add channel</button>
        </div>
      )}
    </aside>
  );
}

export function Toolbar() {
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const tab = useStore(s => s.tab);
  const sel = useStore(s => s.sel);
  const search = useStore(s => s.search);
  const setSearch = useStore(s => s.setSearch);
  const hideShorts = useStore(s => s.hideShorts);
  const setHideShorts = useStore(s => s.setHideShorts);
  if (!ready || tab === 'stats' || sel) return null;
  return (
    <div className="toolbar">
      <div className="searchbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input type="text" placeholder={tab === 'videos' ? 'Search videos…' : 'Search playlists…'}
          value={search} onChange={e => setSearch(e.target.value)} spellCheck={false} />
        {search && <button className="sx" title="Clear" onClick={() => setSearch('')}>×</button>}
      </div>
      {tab === 'videos' && (
        <button className={`btn toggle ${hideShorts ? 'on' : ''}`} onClick={() => setHideShorts(!hideShorts)}
          title="Hide videos under 60 seconds (Shorts)">
          <span className="tg-dot" />Hide Shorts
        </button>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const open = useStore(s => s.panelOpen);
  const user = useStore(s => s.user);
  const channels = useStore(s => s.channels);
  const addChannel = useStore(s => s.addChannel);
  const removeChannel = useStore(s => s.removeChannel);
  const signOut = useStore(s => s.signOut);
  const resetProg = useStore(s => s.resetProg);
  const autoRefreshMins = useStore(s => s.autoRefreshMins);
  const setAutoRefresh = useStore(s => s.setAutoRefresh);
  const [chan, setChan] = useState('');
  const [adding, setAdding] = useState(false);
  const isAdmin = user?.role === 'admin';

  const onAdd = async () => {
    const raw = chan.trim(); if (!raw) return;
    setAdding(true); await addChannel(raw); setChan(''); setAdding(false);
  };

  return (
    <section className={`panel ${open ? 'open' : ''}`}>
      <div className="panel-inner">
        <h2>Account</h2>
        <div className="acct">
          {user?.picture ? <img className="acct-av" src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="acct-av ph" />}
          <div className="acct-info">
            <div className="acct-name">{user?.name || user?.email}</div>
            <div className="acct-sub">{user?.email} · <span className={`role ${isAdmin ? 'admin' : ''}`}>{isAdmin ? 'Admin' : 'Member'}</span></div>
          </div>
          <button className="btn" onClick={() => signOut()}>Sign out</button>
        </div>

        {isAdmin && (
          <>
            <div className="divider" />
            <h2>Manage channels <span className="role admin">Admin</span></h2>
            <p className="hint">Add a channel by <b>@handle</b>, URL, or ID (<code>UC…</code>). It appears in everyone’s feed. E.g. <b>@veritasium</b>.</p>
            <div className="field">
              <input type="text" placeholder="@handle, youtube.com/@…, or UC… ID" autoComplete="off" spellCheck={false}
                value={chan} onChange={e => setChan(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAdd(); }} />
              <button className="btn primary" onClick={onAdd} disabled={adding}>{adding ? 'Finding…' : 'Add channel'}</button>
            </div>
            {channels.length > 0 && (
              <div className="chanmgr">
                {channels.map(c => (
                  <div className="chanmgr-row" key={c.id}>
                    <img src={c.thumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                    <span className="cm-name">{c.title}</span>
                    <button className="btn cm-rm" onClick={() => { if (confirm(`Remove ${c.title} for everyone?`)) removeChannel(c.id); }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="divider" />
        <h2>Auto-refresh</h2>
        <p className="hint">Quietly re-check channels for new uploads while the app is open.</p>
        <div className="seg">
          {[0, 15, 30, 60].map(m => (
            <button key={m} className={`segbtn ${autoRefreshMins === m ? 'on' : ''}`} onClick={() => setAutoRefresh(m)}>
              {m === 0 ? 'Off' : `${m}m`}
            </button>
          ))}
        </div>

        <div className="divider" />
        <h2>Your learning progress</h2>
        <p className="hint">Watch time, completed videos, resume points, streaks, and tracked courses are saved to your account and sync across your devices.</p>
        <button className="btn" onClick={() => { if (confirm('Reset all your learning progress? This clears watch time, completed videos, resume points, streaks and tracked courses.')) resetProg(); }}>Reset all progress</button>
      </div>
    </section>
  );
}
