import React from 'react';
import { motion } from 'framer-motion';
import type { PlaylistMeta } from '../lib/types';
import { useStore } from '../store';
import { isDone, totals, streaks, lastDays } from '../lib/progress';
import { fmtSpan, fmtTotal } from '../lib/format';

export function ProgressTab() {
  useStore(s => s.progV);
  const prog = useStore(s => s.prog);
  const channels = useStore(s => s.channels);
  const openPlaylist = useStore(s => s.openPlaylist);
  const toggle = useStore(s => s.toggleMonitor);

  const t = totals(prog), s = streaks(prog), days = lastDays(prog, 14);
  const maxSec = Math.max(60, ...days.map(d => d.sec));
  const cards = [
    { v: fmtSpan(t.spent), l: 'Time spent', sub: 'with a video playing' },
    { v: fmtSpan(t.done), l: 'Completed', sub: `${t.doneN} video${t.doneN === 1 ? '' : 's'} finished` },
    { v: String(t.started), l: 'In progress', sub: 'started, not finished' },
    { v: `${s.cur} 🔥`, l: 'Day streak', sub: `best ${s.max} day${s.max === 1 ? '' : 's'}` },
  ];

  const thumbOf = (cid: string) => { const c = channels.find(x => x.id === cid); return c ? c.thumb : ''; };
  const mon = Object.keys(prog.mon).map(id => {
    const meta = prog.mon[id], pl = prog.pl[id] || ({} as any);
    const ids: string[] = pl.ids || [];
    const done = ids.filter(x => isDone(prog, x)).length;
    const tot = ids.length || meta.count || 0;
    const spent = ids.reduce((a, vid) => a + ((prog.v[vid] && prog.v[vid].w) || 0), 0);
    return { id, title: meta.title, channelId: meta.channelId || pl.channelId || '_', channel: meta.channelTitle || pl.channel || '', total: pl.total || 0, done, tot, pct: tot ? Math.round((done / tot) * 100) : 0, spent, ready: ids.length > 0 };
  });

  const goCourse = (m: typeof mon[number]) => {
    const meta: PlaylistMeta = { id: m.id, title: m.title, channelId: m.channelId, channelTitle: m.channel, count: m.tot, thumb: '' };
    useStore.setState({ tab: 'playlists' });
    openPlaylist(meta);
  };

  // group by channel
  const groups: Record<string, { channel: string; items: typeof mon }> = {};
  mon.forEach(m => { (groups[m.channelId] = groups[m.channelId] || { channel: m.channel, items: [] }).items.push(m); });
  const order = Object.keys(groups).sort((a, b) => (groups[a].channel || '').localeCompare(groups[b].channel || ''));

  return (
    <div>
      <div className="statgrid">
        {cards.map((c, i) => (
          <motion.div className="statcard" key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <div className="sc-val">{c.v}</div>
            <div className="sc-label">{c.l}</div>
            <div className="sc-sub">{c.sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="panelbox">
        <div className="pb-h">Last 14 days</div>
        <div className="week">
          {days.map(d => {
            const h = d.sec > 0 ? Math.max(6, Math.round((d.sec / maxSec) * 100)) : 0;
            return (
              <div className="wcol" key={d.key} title={`${d.key}: ${fmtSpan(d.sec)}`}>
                <div className="wbar"><motion.span initial={{ height: 0 }} animate={{ height: h + '%' }} transition={{ duration: 0.5 }} style={{ display: 'block', width: '100%' }} /></div>
                <div className="wlbl">{d.key.slice(8)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {!mon.length ? (
        <div className="panelbox">
          <div className="pb-h">Tracked courses</div>
          <p style={{ color: 'var(--ink-soft)', fontSize: '.9rem', lineHeight: 1.65, margin: '2px 0' }}>
            You're not tracking any courses yet. Go to the <b>Playlists</b> tab and tap the <b>★ star</b> on a playlist (or <b>Track course</b> inside it) to monitor it. Only the courses you pick show up here — grouped by channel — so the list stays clean.
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
                {thumb ? <img src={thumb} alt="" /> : <span className="chan-dot" />}
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
  );
}
