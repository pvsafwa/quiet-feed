import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import type { PlaylistMeta } from '../lib/types';
import { useStore, plList, hasMorePlaylists, userActiveChannels } from '../store';
import { isDone, isMon } from '../lib/progress';
import { fmtTotal } from '../lib/format';
import { IPlay, IList, IStar, IBack, ICheck, EmptyState, Skeleton, ITv } from './states';
import { VideoGrid, LoadMore } from './videos';

const gridV = { hidden: {}, show: { transition: { staggerChildren: 0.035 } } };
const itemV = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.7, 0.3, 1] } } };

function PlaylistCard({ p }: { p: PlaylistMeta }) {
  useStore(s => s.progV);
  const dur = useStore(s => s.plDur[p.id]);
  const prog = useStore(s => s.prog);
  const open = useStore(s => s.openPlaylist);
  const toggle = useStore(s => s.toggleMonitor);
  const mon = isMon(prog, p.id);
  const m = prog.pl[p.id];
  const ids = m?.ids || [];
  const done = ids.filter(id => isDone(prog, id)).length;
  const tot = ids.length;
  const pct = tot ? Math.round((done / tot) * 100) : 0;
  return (
    <motion.article className="card" variants={itemV} whileHover={{ y: -3 }} style={{ cursor: 'pointer' }} onClick={() => open(p)}>
      <div className="plthumb">
        <span className="layer l2" /><span className="layer l1" />
        <div className="front">
          <img src={p.thumb} alt="" loading="lazy" onError={(e) => {
            const t = e.target as HTMLImageElement;
            if (t.src.includes('maxresdefault.jpg')) t.src = t.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
          }} />
          <div className="play"><span><IPlay /></span></div>
          <button className={`star ${mon ? 'on' : ''}`} title={mon ? 'Tracking this course' : 'Track this course'}
            onClick={e => { e.stopPropagation(); toggle({ id: p.id, title: p.title, channelTitle: p.channelTitle, channelId: p.channelId, count: p.count }); }}>
            <IStar filled={mon} />
          </button>
          <div className="plcount"><IList />{p.count}</div>
        </div>
      </div>
      <div className="meta"><div className="txt">
        <h3>{p.title}</h3>
        <div className="sub">
          <b>{p.channelTitle}</b><br />{p.count} videos
          {dur === undefined ? <span style={{ opacity: 0.45 }}> · …</span> : (dur > 0 ? ` · ${fmtTotal(dur)}` : '')}
        </div>
        {tot > 0 && (
          <div className="tprog">
            <div className="tbar"><span style={{ width: pct + '%' }} /></div>
            <span className="tprog-t">{done}/{tot} done{pct > 0 ? ` · ${pct}%` : ''}</span>
          </div>
        )}
      </div></div>
    </motion.article>
  );
}

export function PlaylistsTab() {
  const busy = useStore(s => s.busy);
  const filter = useStore(s => s.filter);
  const setFilter = useStore(s => s.setFilter);
  const activeChannels = useStore(userActiveChannels);
  const more = useStore(s => hasMorePlaylists(s));
  const compute = useStore(s => s.computePlaylistDurations);
  const runPlaylists = useStore(s => s.runPlaylists);
  const list = useStore(useShallow(s => plList(s)));
  const search = useStore(s => s.search);

  useEffect(() => {
    if (filter !== 'all') {
      runPlaylists(true);
    }
  }, [filter]);

  useEffect(() => { if (list.length) compute(list); }, [list, compute]);

  // When no single channel is chosen, prompt user to select a channel
  if (filter === 'all') {
    return (
      <div className="pl-channel-prompt">
        <div className="prompt-box">
          <div className="prompt-ic">📂</div>
          <h2>Select a Channel</h2>
          <p className="hint">Choose a channel from your feed to explore its structured playlists and courses.</p>
          <div className="pl-chan-grid">
            {activeChannels.map(c => (
              <div key={c.id} className="pl-chan-card" onClick={() => setFilter(c.id)}>
                <img src={c.thumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                <div className="pl-chan-title">{c.title}</div>
                {c.language && <span className="pl-chan-lang">{c.language}</span>}
              </div>
            ))}
          </div>
          {activeChannels.length === 0 && (
            <p className="hint">No channels selected. Open Setup to choose channels.</p>
          )}
        </div>
      </div>
    );
  }

  const selectedChan = activeChannels.find(c => c.id === filter);

  if (busy && list.length === 0) return <Skeleton />;
  return (
    <>
      <div className="pl-active-bar">
        <div className="pl-active-info">
          {selectedChan?.thumb && <img src={selectedChan.thumb} alt="" className="pl-bar-av" />}
          <div>
            <b>{selectedChan?.title || 'Selected Channel'}</b>
            <div className="pl-bar-sub">Playlists & Courses</div>
          </div>
        </div>
        <button className="btn sm" onClick={() => setFilter('all')}>Change Channel</button>
      </div>

      {!list.length ? (
        <EmptyState icon={<ITv />} title={search ? 'No playlists match' : 'No playlists found'} body={search ? 'Try a different search term.' : 'This channel may not have public playlists.'} />
      ) : (
        <>
          <motion.div className="grid" variants={gridV} initial="hidden" animate="show">
            {list.map(p => <PlaylistCard key={p.id} p={p} />)}
          </motion.div>
          <LoadMore show={more} onClick={() => runPlaylists(false)} />
        </>
      )}
    </>
  );
}

export function PlaylistDetail() {
  useStore(s => s.progV);
  const sel = useStore(s => s.sel);
  const selVideos = useStore(s => s.selVideos);
  const busy = useStore(s => s.busy);
  const prog = useStore(s => s.prog);
  const close = useStore(s => s.closePlaylist);
  const toggle = useStore(s => s.toggleMonitor);
  const markAllWatched = useStore(s => s.markAllWatched);

  if (!sel) return null;
  const total = selVideos.reduce((a, v) => a + (v.seconds || 0), 0);
  const ids = selVideos.map(v => v.id);
  const doneN = ids.filter(id => isDone(prog, id)).length;
  const pct = ids.length ? Math.round((doneN / ids.length) * 100) : 0;
  const mon = isMon(prog, sel.id);
  const allDone = ids.length > 0 && doneN === ids.length;
  const totalTxt = fmtTotal(total) ? `${fmtTotal(total)} · ` : '';

  const head = (
    <div className="plhead">
      <button className="btn back" onClick={close}><IBack />Playlists</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pltitle">{sel.title}</div>
        <div className="plmeta">{sel.channelTitle} · {selVideos.length || sel.count} videos · {totalTxt}<span className="ord">oldest first</span></div>
        {ids.length > 0 && (
          <div className="selprog">
            <div className="selbar"><motion.span initial={{ width: 0 }} animate={{ width: pct + '%' }} transition={{ duration: 0.5 }} style={{ display: 'block', height: '100%' }} /></div>
            <span className="selprog-t">{doneN} of {ids.length} completed · {pct}%</span>
          </div>
        )}
      </div>
      <div className="plhead-actions">
        {selVideos.length > 0 && !allDone && (
          <button className="btn" style={{ flex: 'none' }} title="Mark every video in this playlist as watched"
            onClick={() => { if (confirm(`Mark all ${selVideos.length} videos in “${sel.title}” as watched?`)) markAllWatched(selVideos); }}>
            <ICheck />Mark all watched
          </button>
        )}
        <button className={`btn ${mon ? 'primary' : ''}`} style={{ flex: 'none' }}
          onClick={() => toggle({ id: sel.id, title: sel.title, channelTitle: sel.channelTitle, channelId: sel.channelId, count: sel.count })}>
          <IStar filled={mon} />{mon ? 'Tracking' : 'Track course'}
        </button>
      </div>
    </div>
  );

  if (busy && selVideos.length === 0) return <>{head}<Skeleton /></>;
  if (!selVideos.length) return <>{head}<EmptyState icon={<ITv />} title="No playable videos here" /></>;
  return <>{head}<VideoGrid videos={selVideos} /></>;
}
