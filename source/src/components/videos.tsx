import React from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import type { Video } from '../lib/types';
import { useStore, feedItems, hasMoreVideos } from '../store';
import { isDone as _isDone, vpct as _vpct } from '../lib/progress';
import { ago, views as fmtViews } from '../lib/format';
import { IPlay, ICheck, EmptyState, Skeleton, ITv } from './states';

const gridV = { hidden: {}, show: { transition: { staggerChildren: 0.035 } } };
const itemV = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.7, 0.3, 1] } } };

export function VideoCard({ v }: { v: Video }) {
  useStore(s => s.progV); // re-render when progress is committed
  const prog = useStore(s => s.prog);
  const lastSeen = useStore(s => s.lastSeen);
  const openPlayer = useStore(s => s.openPlayer);
  const done = _isDone(prog, v.id);
  const pct = _vpct(prog, v.id);
  const isNew = lastSeen > 0 && new Date(v.published).getTime() > lastSeen;
  return (
    <motion.article className="card" variants={itemV} onClick={() => openPlayer(v)} whileHover={{ y: -3 }} style={{ cursor: 'pointer' }}>
      <div className={`thumb ${done ? 'is-done' : ''}`}>
        <img src={v.thumb} alt="" loading="lazy" />
        {v.dur ? <div className="dur">{v.dur}</div> : null}
        {done ? <div className="donebadge"><ICheck /></div> : null}
        {!done && isNew ? <div className="newbadge">NEW</div> : null}
        <div className="play"><span><IPlay /></span></div>
        {pct > 0 ? <div className="progbar"><span style={{ width: pct + '%' }} /></div> : null}
      </div>
      <div className="meta">
        {v.channelThumb ? <img className="av" src={v.channelThumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} /> : null}
        <div className="txt">
          <h3>{v.title}</h3>
          <div className="sub">
            <b>{v.channelTitle}</b><br />
            {v.views != null ? fmtViews(v.views) + ' · ' : ''}{ago(v.published)}
            {done ? <> · <span style={{ color: '#7bc47f' }}>watched</span></> : (pct > 0 ? ` · ${pct}% watched` : '')}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export function VideoGrid({ videos }: { videos: Video[] }) {
  return (
    <motion.div className="grid" variants={gridV} initial="hidden" animate="show">
      {videos.map(v => <VideoCard key={v.id} v={v} />)}
    </motion.div>
  );
}

export function LoadMore({ show, onClick }: { show: boolean; onClick: () => void }) {
  const busy = useStore(s => s.busy);
  if (!show) return null;
  return (
    <div className="morebar">
      <motion.button className="btn more-btn" disabled={busy} onClick={onClick} whileTap={{ scale: 0.96 }}>
        {busy ? 'Loading…' : 'Load more'}
      </motion.button>
    </div>
  );
}

export function VideosTab() {
  const busy = useStore(s => s.busy);
  const list = useStore(useShallow(s => feedItems(s)));
  const more = useStore(s => hasMoreVideos(s));
  const search = useStore(s => s.search);
  const hideShorts = useStore(s => s.hideShorts);
  const runVideos = useStore(s => s.runVideos);
  const refresh = useStore(s => s.refreshCurrent);
  if (busy && list.length === 0) return <Skeleton />;
  if (!list.length) {
    const filtered = !!search || hideShorts;
    return <EmptyState icon={<ITv />}
      title={filtered ? 'Nothing matches' : 'No videos yet'}
      body={filtered ? 'Try clearing the search or the Shorts filter.' : 'Try Refresh, or add channels in Setup.'}
      action={!filtered ? <button className="btn primary" onClick={() => refresh()}>Refresh</button> : undefined} />;
  }
  return (<><VideoGrid videos={list} /><LoadMore show={more} onClick={() => runVideos(false)} /></>);
}
