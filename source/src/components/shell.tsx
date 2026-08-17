import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useStore, userActiveChannels } from '../store';
import { IRefresh, IGear, IList, IPlay, IChart, IAlert, IMenu, IPlus, IBack, IClose } from './states';
import type { ChannelLanguage, Channel } from '../lib/types';

const LANGUAGES: ChannelLanguage[] = ['Arabic', 'English', 'Malayalam', 'Urdu'];

export function Header() {
  const busy = useStore(s => s.busy);
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const refresh = useStore(s => s.refreshCurrent);
  const setPanel = useStore(s => s.setPanel);
  const toggleSidebar = useStore(s => s.toggleSidebar);

  return (
    <header className="site-header">
      <div className="brand">
        {ready && (
          <motion.button className="btn icon menubtn" title="Channels" aria-label="Toggle channels" onClick={() => toggleSidebar()} whileTap={{ scale: 0.9 }}>
            <IMenu />
          </motion.button>
        )}
        <div className="mark"><IPlay style={{ marginLeft: 2 }} /></div>
        <div>
          <h1>quiet <i>feed</i></h1>
          <p>ONLY YOUR CHANNELS · NO RABBIT HOLES</p>
        </div>
      </div>
      <div className="actions">
        <motion.button className="btn icon" title="Refresh feed" disabled={!ready || busy} onClick={() => refresh()} whileTap={{ scale: 0.92 }}>
          <IRefresh className={busy ? 'spin' : ''} />
        </motion.button>
        <motion.button className="btn icon-txt-btn" onClick={() => setPanel(true)} whileTap={{ scale: 0.96 }}>
          <IGear />
          <span className="btn-txt">Settings</span>
        </motion.button>
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
            <b>Notice:</b><br />
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

export function BottomTabBar() {
  const tab = useStore(s => s.tab);
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const switchTab = useStore(s => s.switchTab);
  if (!ready) return null;

  const TabBtn = ({ id, icon, label }: { id: any; icon: React.ReactNode; label: string }) => {
    const active = tab === id;
    return (
      <button className={`bottom-tab-btn ${active ? 'active' : ''}`} onClick={() => switchTab(id)}>
        <div className="bottom-tab-icon">{icon}</div>
        <span className="bottom-tab-label">{label}</span>
      </button>
    );
  };

  return (
    <nav className="bottom-tab-bar">
      <TabBtn id="videos" icon={<IPlay />} label="Videos" />
      <TabBtn id="playlists" icon={<IList />} label="Playlists" />
      <TabBtn id="stats" icon={<IChart />} label="Progress" />
    </nav>
  );
}

export function Tabs() {
  const tab = useStore(s => s.tab);
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const isAdmin = useStore(s => s.user?.role === 'admin');
  const switchTab = useStore(s => s.switchTab);
  if (!ready) return null;

  const T = ({ id, icon, label }: { id: any; icon: React.ReactNode; label: string }) => (
    <button className={`tab icononly ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)} title={label} aria-label={label}>
      {icon}
      <span className="tab-label">{label}</span>
    </button>
  );

  return (
    <div className="desktop-tabs-wrapper">
      <div className="tabs" style={{ display: 'inline-flex' }}>
        <T id="videos" icon={<IPlay />} label="Videos" />
        <T id="playlists" icon={<IList />} label="Playlists" />
        <T id="stats" icon={<IChart />} label="Progress" />
        {isAdmin && <T id="admin" icon={<span style={{ fontWeight: '800', fontSize: 13 }}>👑</span>} label="Admin Hub" />}
      </div>
    </div>
  );
}

export function Sidebar() {
  const activeChannels = useStore(useShallow(userActiveChannels));
  const filter = useStore(s => s.filter);
  const open = useStore(s => s.sidebarOpen);
  const ready = useStore(s => !!s.user && s.channels.length > 0);
  const isAdmin = useStore(s => s.user?.role === 'admin');
  const setFilter = useStore(s => s.setFilter);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const setPanel = useStore(s => s.setPanel);

  const [collapsedLangs, setCollapsedLangs] = useState<Record<string, boolean>>({});

  if (!ready) return null;

  // Group active channels by language
  const channelsByLang: Record<string, Channel[]> = {};
  activeChannels.forEach(c => {
    const lang = (c.language && c.language.trim()) || 'English';
    if (!channelsByLang[lang]) channelsByLang[lang] = [];
    channelsByLang[lang].push(c);
  });

  const availableLangs = Object.keys(channelsByLang).sort((a, b) => {
    const ia = LANGUAGES.indexOf(a as any);
    const ib = LANGUAGES.indexOf(b as any);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const hasMultipleLanguages = availableLangs.length > 1;

  const toggleLang = (lang: string) => {
    setCollapsedLangs(prev => ({ ...prev, [lang]: !prev[lang] }));
  };

  const pick = (id: string) => {
    const s = useStore.getState();
    if (s.sel) s.closePlaylist();
    if (s.tab === 'stats' || s.tab === 'admin') s.switchTab('videos');
    setFilter(id);
    if (typeof window !== 'undefined' && window.innerWidth <= 768) toggleSidebar(false);
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

        {availableLangs.map(lang => {
          const list = channelsByLang[lang] || [];
          const isCollapsed = !!collapsedLangs[lang];

          return (
            <div key={lang} className="sb-lang-group">
              {hasMultipleLanguages && (
                <div className="sb-lang-header" onClick={() => toggleLang(lang)}>
                  <span className="sb-lang-arrow">{isCollapsed ? '▶' : '▼'}</span>
                  <span className="sb-lang-title">{lang}</span>
                  <span className="sb-lang-count">{list.length}</span>
                </div>
              )}

              {!isCollapsed && list.map(c => (
                <button key={c.id} className={`sb-item ${filter === c.id ? 'active' : ''}`} onClick={() => pick(c.id)}>
                  <img className="sb-av" src={c.thumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                  <span className="sb-name">{c.title}</span>
                </button>
              ))}
            </div>
          );
        })}

        {activeChannels.length === 0 && (
          <div className="empty-sub" style={{ padding: '16px', textAlign: 'center' }}>
            No channels selected.<br />
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setPanel(true)}>Choose Channels</button>
          </div>
        )}
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
  if (!ready || tab === 'stats' || tab === 'admin' || sel) return null;

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
  const setPanel = useStore(s => s.setPanel);
  const user = useStore(s => s.user);
  const channels = useStore(s => s.channels);
  const selectedChannelIds = useStore(s => s.selectedChannelIds);
  const toggleChannelSelection = useStore(s => s.toggleChannelSelection);
  const selectAllChannels = useStore(s => s.selectAllChannels);
  const deselectAllChannels = useStore(s => s.deselectAllChannels);
  const addChannel = useStore(s => s.addChannel);
  const removeChannel = useStore(s => s.removeChannel);
  const signOut = useStore(s => s.signOut);
  const resetProg = useStore(s => s.resetProg);
  const autoRefreshMins = useStore(s => s.autoRefreshMins);
  const setAutoRefresh = useStore(s => s.setAutoRefresh);
  const switchTab = useStore(s => s.switchTab);

  const [chan, setChan] = useState('');
  const [selectedLang, setSelectedLang] = useState<ChannelLanguage>('English');
  const [adding, setAdding] = useState(false);
  const isAdmin = user?.role === 'admin';

  const onAdd = async () => {
    const raw = chan.trim();
    if (!raw) return;
    setAdding(true);
    await addChannel(raw, selectedLang);
    setChan('');
    setAdding(false);
  };

  const isChannelSelected = (id: string) => {
    if (selectedChannelIds === null) return true;
    return selectedChannelIds.includes(id);
  };

  if (!open) return null;

  return (
    <div className="panel-overlay" onClick={() => setPanel(false)}>
      <section className="panel-modal" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>Settings & Account</h2>
          <button className="panel-close-btn" onClick={() => setPanel(false)} title="Close">
            <IClose />
          </button>
        </div>

        <div className="panel-scroll-content">
          {/* Account Details */}
          <div className="panel-card acct-card">
            <div className="acct">
              {user?.picture ? <img className="acct-av" src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="acct-av ph" />}
              <div className="acct-info">
                <div className="acct-name">{user?.name || user?.email}</div>
                <div className="acct-sub">{user?.email} · <span className={`role ${isAdmin ? 'admin' : ''}`}>{isAdmin ? 'Admin' : 'Member'}</span></div>
              </div>
            </div>
            <button className="btn" onClick={() => signOut()}>Sign out</button>
          </div>

          {/* Admin Hub Card */}
          {isAdmin && (
            <div className="panel-card admin-hub-card" onClick={() => { setPanel(false); switchTab('admin'); }}>
              <div className="ahc-left">
                <span className="ahc-icon">👑</span>
                <div>
                  <div className="ahc-title">Admin Dashboard</div>
                  <div className="ahc-sub">User analytics, watch times & member tracking</div>
                </div>
              </div>
              <span className="ahc-arrow">›</span>
            </div>
          )}

          {/* Manage Catalog Channels (Admin) */}
          {isAdmin && (
            <div className="panel-card">
              <h3>Manage Catalog Channels <span className="role admin">Admin</span></h3>
              <p className="hint">Add a channel by <b>@handle</b>, URL, or ID (<code>UC…</code>) with a language tag. It appears in the catalog for everyone.</p>

              {/* Language Selector */}
              <div className="lang-pill-row">
                <span className="lang-pill-lbl">Language:</span>
                {LANGUAGES.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    className={`btn lang-pill ${selectedLang === lang ? 'active' : ''}`}
                    onClick={() => setSelectedLang(lang)}
                  >
                    {lang}
                  </button>
                ))}
              </div>

              <div className="field">
                <input
                  type="text"
                  placeholder="@handle, youtube.com/@…, or UC… ID"
                  autoComplete="off"
                  spellCheck={false}
                  value={chan}
                  onChange={e => setChan(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') onAdd(); }}
                />
                <button className="btn primary" onClick={onAdd} disabled={adding}>
                  {adding ? 'Finding…' : 'Add channel'}
                </button>
              </div>

              {channels.length > 0 && (
                <div className="chanmgr">
                  {channels.map(c => (
                    <div className="chanmgr-row" key={c.id}>
                      <img src={c.thumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                      <div className="cm-info">
                        <span className="cm-name">{c.title}</span>
                        <span className="cm-lang">{c.language || 'English'}</span>
                      </div>
                      <button
                        className="btn cm-rm"
                        onClick={() => {
                          if (confirm(`Remove "${c.title}" for everyone? This will drop it from the global catalog.`)) {
                            removeChannel(c.id);
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User Channel Picker / My Channels */}
          <div className="panel-card">
            <div className="my-chans-header">
              <div>
                <h3>My Channels</h3>
                <p className="hint">Choose which channels appear in your feed and side menu.</p>
              </div>
              <div className="my-chans-actions">
                <button className="btn sm" onClick={selectAllChannels}>All</button>
                <button className="btn sm" onClick={deselectAllChannels}>None</button>
              </div>
            </div>

            <div className="user-chans-list">
              {channels.map(c => {
                const selected = isChannelSelected(c.id);
                return (
                  <div
                    key={c.id}
                    className={`user-chan-item ${selected ? 'selected' : ''}`}
                    onClick={() => toggleChannelSelection(c.id)}
                  >
                    <input type="checkbox" checked={selected} readOnly />
                    <img src={c.thumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                    <div className="user-chan-meta">
                      <span className="user-chan-title">{c.title}</span>
                      <span className="user-chan-lang">{c.language || 'English'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto-Refresh Preferences */}
          <div className="panel-card">
            <h3>Auto-refresh</h3>
            <p className="hint">Quietly re-check channels for new uploads while the app is open.</p>
            <div className="seg">
              {[0, 15, 30, 60].map(m => (
                <button key={m} className={`segbtn ${autoRefreshMins === m ? 'on' : ''}`} onClick={() => setAutoRefresh(m)}>
                  {m === 0 ? 'Off' : `${m}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Learning Progress Reset */}
          <div className="panel-card">
            <h3>Your learning progress</h3>
            <p className="hint">Watch time, completed videos, resume points, streaks, and tracked courses are saved to your account and sync across your devices.</p>
            <button className="btn" onClick={() => { if (confirm('Reset all your learning progress? This clears watch time, completed videos, resume points, streaks and tracked courses.')) resetProg(); }}>Reset all progress</button>
          </div>
        </div>
      </section>
    </div>
  );
}
