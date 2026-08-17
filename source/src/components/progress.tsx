import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { PlaylistMeta } from '../lib/types';
import { useStore, watchHistory } from '../store';
import { isDone, totals, streaks, lastDays } from '../lib/progress';
import { fmtSpan, fmtTotal, ago, views as fmtViews } from '../lib/format';
import { IPlay, ICheck } from './states';

export function ProgressTab() {
  useStore(s => s.progV);
  const prog = useStore(s => s.prog);
  const channels = useStore(s => s.channels);
  const vid = useStore(s => s.vid);
  const selVideos = useStore(s => s.selVideos);
  const openPlaylist = useStore(s => s.openPlaylist);
  const openPlayer = useStore(s => s.openPlayer);
  const toggle = useStore(s => s.toggleMonitor);

  const [activeSubTab, setActiveSubTab] = useState<'courses' | 'history'>('courses');

  const t = totals(prog), s = streaks(prog), days = lastDays(prog, 14);
  const maxSec = Math.max(60, ...days.map(d => d.sec));
  const cards = [
    { v: fmtSpan(t.spent), l: 'Time spent', sub: 'with video playing' },
    { v: fmtSpan(t.done), l: `Completed (${t.doneN})`, sub: `${t.doneN} finished` },
    { v: String(t.started), l: 'In progress', sub: 'started, not finished' },
    { v: `${s.cur} 🔥`, l: `Streak · best ${s.max}`, sub: 'days in a row' },
  ];

  const thumbOf = (cid: string) => { const c = channels.find(x => x.id === cid); return c ? c.thumb : ''; };
  const mon = Object.keys(prog.mon).map(id => {
    const meta = prog.mon[id], pl = prog.pl[id] || ({} as any);
    const ids: string[] = pl.ids || [];
    const done = ids.filter(x => isDone(prog, x)).length;
    const tot = ids.length || meta.count || 0;
    const spent = ids.reduce((a, vidId) => a + ((prog.v[vidId] && prog.v[vidId].w) || 0), 0);
    return { id, title: meta.title, channelId: meta.channelId || pl.channelId || '_', channel: meta.channelTitle || pl.channel || '', total: pl.total || 0, done, tot, pct: tot ? Math.round((done / tot) * 100) : 0, spent, ready: ids.length > 0 };
  });

  const historyList = useMemo(() => watchHistory({ vid, selVideos, prog } as any), [vid, selVideos, prog]);

  const goCourse = (m: typeof mon[number]) => {
    const meta: PlaylistMeta = { id: m.id, title: m.title, channelId: m.channelId, channelTitle: m.channel, count: m.tot, thumb: '' };
    useStore.setState({ tab: 'playlists' });
    openPlaylist(meta);
  };

  // group courses by channel
  const groups: Record<string, { channel: string; items: typeof mon }> = {};
  mon.forEach(m => { (groups[m.channelId] = groups[m.channelId] || { channel: m.channel, items: [] }).items.push(m); });
  const order = Object.keys(groups).sort((a, b) => (groups[a].channel || '').localeCompare(groups[b].channel || ''));

  return (
    <div className="progress-container">
      {/* Stat Grid */}
      <div className="statgrid">
        {cards.map((c, i) => (
          <motion.div className="statcard" key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <div className="sc-val">{c.v}</div>
            <div className="sc-label">{c.l}</div>
            <div className="sc-sub">{c.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* 14-Day Activity Chart */}
      <div className="panelbox">
        <div className="pb-h">Last 14 days</div>
        <div className="week">
          {days.map(d => {
            const h = d.sec > 0 ? Math.max(6, Math.round((d.sec / maxSec) * 100)) : 0;
            return (
              <div className="wcol" key={d.key} title={`${d.key}: ${fmtSpan(d.sec)}`}>
                <div className="wbar">
                  <motion.span initial={{ height: 0 }} animate={{ height: h + '%' }} transition={{ duration: 0.5 }} style={{ display: 'block', width: '100%' }} />
                </div>
                <div className="wlbl">{d.key.slice(8)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-Tabs: Tracked Courses vs Watch History */}
      <div className="prog-subtabs-row">
        <button
          className={`prog-subtab-btn ${activeSubTab === 'courses' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('courses')}
        >
          Tracked Courses ({mon.length})
        </button>
        <button
          className={`prog-subtab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('history')}
        >
          Watch History ({historyList.length})
        </button>
      </div>

      {/* Tracked Courses Tab */}
      {activeSubTab === 'courses' && (
        <div className="tracked-courses-wrap">
          {!mon.length ? (
            <div className="panelbox empty-box">
              <div className="pb-h">No tracked courses yet</div>
              <p style={{ color: 'var(--ink-soft)', fontSize: '.9rem', lineHeight: 1.65, margin: '6px 0 0' }}>
                Star a playlist (or click <b>Track course</b> inside it) to follow your progress here.
              </p>
            </div>
          ) : (
            order.map(cid => {
              const g = groups[cid];
              g.items.sort((a, b) => b.pct - a.pct || (a.title || '').localeCompare(b.title || ''));
              const gDone = g.items.reduce((a, x) => a + x.done, 0);
              const gTot = g.items.reduce((a, x) => a + x.tot, 0);
              const gSpent = g.items.reduce((a, x) => a + x.spent, 0);
              const thumb = thumbOf(cid);
              return (
                <div className="panelbox chan" key={cid}>
                  <div className="chan-h">
                    {thumb ? (
                      <img src={thumb} alt="" onError={(e) => {
                        const tImg = e.target as HTMLImageElement;
                        if (tImg.src.includes('maxresdefault.jpg')) tImg.src = tImg.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                      }} />
                    ) : <span className="chan-dot" />}
                    <div>
                      <div className="chan-name">{g.channel || 'Channel'}</div>
                      <div className="chan-sub">{g.items.length} course{g.items.length === 1 ? '' : 's'} · {gDone}/{gTot} videos done{gSpent > 0 ? ` · ${fmtSpan(gSpent)} watched` : ''}</div>
                    </div>
                  </div>
                  {g.items.map(x => (
                    <div className="plrow" key={x.id} onClick={() => goCourse(x)}>
                      <div className="plrow-top"><span className="plrow-name">{x.title}</span><span className="plrow-n">{x.ready ? `${x.done}/${x.tot}` : '…'}</span></div>
                      <div className="selbar"><motion.span initial={{ width: 0 }} animate={{ width: x.pct + '%' }} transition={{ duration: 0.5 }} style={{ display: 'block', height: '100%' }} /></div>
                      <div className="plrow-sub">
                        {x.pct}% done · {fmtTotal(x.total) || '—'} total{x.spent > 0 ? ` · ${fmtSpan(x.spent)} watched` : ''}
                        <button className="untrack" title="Stop tracking" onClick={e => { e.stopPropagation(); toggle({ id: x.id, title: x.title, channelTitle: x.channel, channelId: x.channelId, count: x.tot }); }}>untrack</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Watch History Tab */}
      {activeSubTab === 'history' && (
        <div className="watch-history-wrap">
          {!historyList.length ? (
            <div className="panelbox empty-box">
              <div className="pb-h">No watch history</div>
              <p style={{ color: 'var(--ink-soft)', fontSize: '.9rem', lineHeight: 1.65, margin: '6px 0 0' }}>
                Videos you watch will appear here so you can easily resume or re-watch them.
              </p>
            </div>
          ) : (
            <div className="grid">
              {historyList.map(v => {
                const pr = prog.v[v.id];
                const done = pr ? isDone(prog, v.id) : false;
                const pct = pr && pr.d && pr.p ? Math.min(100, Math.round((pr.p / pr.d) * 100)) : 0;
                return (
                  <motion.article
                    className="card"
                    key={v.id}
                    onClick={() => openPlayer(v)}
                    whileHover={{ y: -3 }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={`thumb ${done ? 'is-done' : ''}`}>
                      <img
                        src={v.thumb}
                        alt=""
                        loading="lazy"
                        onError={e => {
                          const t = e.target as HTMLImageElement;
                          if (t.src.includes('maxresdefault.jpg')) t.src = t.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                        }}
                      />
                      {v.dur ? <div className="dur">{v.dur}</div> : (v.seconds ? <div className="dur">{fmtSpan(v.seconds)}</div> : null)}
                      {done ? <div className="donebadge"><ICheck /></div> : null}
                      <div className="play"><span><IPlay /></span></div>
                      {pct > 0 && !done ? <div className="progbar"><span style={{ width: `${pct}%` }} /></div> : null}
                    </div>
                    <div className="meta">
                      {v.channelThumb ? (
                        <img className="av" src={v.channelThumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                      ) : null}
                      <div className="txt">
                        <h3>{v.title}</h3>
                        <div className="sub">
                          <b>{v.channelTitle}</b><br />
                          {pr?.t ? `Watched ${ago(new Date(pr.t).toISOString())}` : (v.published ? ago(v.published) : '')}
                          {done ? <> · <span style={{ color: '#7bc47f' }}>watched</span></> : (pct > 0 ? ` · ${pct}% watched` : '')}
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
