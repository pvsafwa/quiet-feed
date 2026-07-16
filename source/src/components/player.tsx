import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { ytReady } from '../lib/ytapi';
import { api } from '../lib/api';
import { addWatch, setPos, markDone, isDone } from '../lib/progress';
import { ago, views as fmtViews } from '../lib/format';
import { IClose, IVideo, IVideoOff, IPip, IExpand, IPlay, IPause } from './states';

// Decorative equalizer shown when the video is hidden. It runs in time with
// playback (play/pause); it cannot mirror the exact waveform because the browser
// blocks access to a cross-origin iframe's audio.
function AudioViz({ playing, title, channel }: { playing: boolean; title: string; channel: string }) {
  return (
    <div className="audioviz">
      <div className={`viz-orb ${playing ? 'on' : ''}`}>{playing ? <IPause /> : <IPlay />}</div>
      <div className={`viz-bars ${playing ? 'on' : ''}`} aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => <span key={i} style={{ animationDelay: `${(i % 5) * 0.13}s`, animationDuration: `${0.7 + (i % 3) * 0.22}s` }} />)}
      </div>
      <div className="viz-title">{title}</div>
      <div className="viz-sub">{channel} · Audio Only (v2) · tap to {playing ? 'pause' : 'play'}</div>
    </div>
  );
}

export function PlayerModal() {
  const cur = useStore(s => s.cur);
  const close = useStore(s => s.closePlayer);
  const frameRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const tickRef = useRef<any>(null);
  const tcRef = useRef(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [desc, setDesc] = useState<string>('');
  const [descOpen, setDescOpen] = useState(false);
  const [videoOff, setVideoOff] = useState(true); // default: video hidden (blocks accidental taps to YouTube)
  const [playing, setPlaying] = useState(false);
  const [pip, setPip] = useState(true);
  const [ended, setEnded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const isFile = typeof location !== 'undefined' && location.protocol === 'file:';

  function stopTick() { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; useStore.getState().persistProg(); } }
  function startTick() {
    stopTick();
    tickRef.current = setInterval(() => {
      const p = playerRef.current; const v = useStore.getState().cur; if (!p || !v) return;
      let t = 0, dur = 0; try { t = p.getCurrentTime() || 0; dur = p.getDuration() || 0; } catch { return; }
      const prog = useStore.getState().prog;
      addWatch(prog, v.id, 1, dur || v.seconds);
      setPos(prog, v.id, t, dur || v.seconds);
      if (dur && t / dur >= 0.92 && !isDone(prog, v.id)) markDone(prog, v.id, dur);
      tcRef.current++; if (tcRef.current % 5 === 0) useStore.getState().persistProg();
    }, 1000);
  }

  // Keyboard: Esc closes; space/arrows/f control the player (when not typing in a field).
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { close(); return; }
      const p = playerRef.current;
      if (!p) return;
      try {
        switch (e.key) {
          case ' ': case 'k': {
            e.preventDefault();
            const S = window.YT?.PlayerState;
            if (S && p.getPlayerState() === S.PLAYING) p.pauseVideo(); else p.playVideo();
            break;
          }
          case 'ArrowRight': e.preventDefault(); p.seekTo((p.getCurrentTime() || 0) + 10, true); break;
          case 'ArrowLeft': e.preventDefault(); p.seekTo(Math.max(0, (p.getCurrentTime() || 0) - 10), true); break;
          case 'f': { e.preventDefault(); const f = p.getIframe?.(); if (f?.requestFullscreen) f.requestFullscreen(); break; }
          case 'm': p.isMuted?.() ? p.unMute() : p.mute(); break;
        }
      } catch { /* player not ready */ }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cur, close]);

  // Fetch the video's description (lazily; falls back to nothing on error).
  useEffect(() => {
    setDesc(''); setDescOpen(false);
    if (!cur) return;
    let cancelled = false;
    api.videoMeta(cur.id).then(m => { if (!cancelled) setDesc(m.description || ''); }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [cur?.id]);

  // Create / tear down the YouTube player. We append the player host imperatively so
  // React never tries to reconcile the iframe YT injects.
  useEffect(() => {
    setErrMsg(null);
    setVideoOff(true);
    setPlaying(false);
    setEnded(false);
    tcRef.current = 0;
    if (!cur || isFile) return;
    const prog = useStore.getState().prog;
    const pr = prog.v[cur.id];
    const startAt = (pr && !pr.done && pr.p > 10 && (!pr.d || pr.p < pr.d * 0.95)) ? Math.floor(pr.p) : 0;
    let cancelled = false;
    const host = document.createElement('div');
    frameRef.current?.appendChild(host);
    ytReady().then(() => {
      if (cancelled) return;
      playerRef.current = new window.YT.Player(host, {
        videoId: cur.id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, autoplay: 1, start: startAt, iv_load_policy: 3, origin: location.origin },
        events: {
          onStateChange: (e: any) => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) { startTick(); setPlaying(true); setEnded(false); } else { stopTick(); setPlaying(false); }
            if (e.data === S.ENDED) {
              setEnded(true); // cover YouTube's end-screen recommendations with our own card
              const v = useStore.getState().cur;
              if (v) { let dur = 0; try { dur = playerRef.current.getDuration(); } catch { /* */ } markDone(useStore.getState().prog, v.id, dur || v.seconds); useStore.getState().commitProg(); }
            }
          },
          onError: (e: any) => {
            stopTick();
            const code = e.data;
            const msg = (code === 101 || code === 150) ? 'The owner has turned off playback of this video on other sites.'
              : code === 100 ? 'This video is unavailable — it may be private or removed.'
              : "This video can't be played here.";
            if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* */ } playerRef.current = null; }
            if (frameRef.current) frameRef.current.innerHTML = '';
            setErrMsg(msg);
          },
        },
      });
    }).catch((err: any) => {
      if (cancelled) return;
      if (frameRef.current) frameRef.current.innerHTML = '';
      setErrMsg(err?.message || "Couldn't load YouTube's player.");
    });
    return () => {
      cancelled = true; stopTick();
      if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* */ } playerRef.current = null; }
      if (frameRef.current) frameRef.current.innerHTML = '';
    };
  }, [cur?.id]);

  const replay = () => {
    const p = playerRef.current;
    if (p) { try { p.seekTo(0, true); p.playVideo(); } catch { /* */ } }
    setEnded(false);
  };

  // In hidden-video mode the cover sits over the iframe, so tapping it must drive play/pause.
  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const S = window.YT?.PlayerState;
      if (S && p.getPlayerState() === S.PLAYING) p.pauseVideo(); else p.playVideo();
    } catch { /* */ }
  };

  // Portal to <body> so the player escapes the sidebar's stacking context and
  // centres over the whole viewport (and floats freely in PiP).
  return createPortal(
    <AnimatePresence>
      {/* Backdrop only in full (modal) mode; clicking it minimizes to PiP instead of closing. */}
      {cur && !pip && (
        <motion.div key="qf-bd" className="qf-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setPip(true)} />
      )}
      {cur && (
        <motion.div key="qf-win" className={`qf-window ${pip ? 'pip' : 'modal'}`}
          initial={{ opacity: 0, scale: 0.98, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 18 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
          <div className="qf-controls">
            <button className="qf-cbtn" onClick={() => setPip(p => !p)}
              title={pip ? 'Expand' : 'Minimize to corner'} aria-label={pip ? 'Expand' : 'Minimize'}>
              {pip ? <IExpand /> : <IPip />}
            </button>
            <button className="qf-cbtn" onClick={close} title="Close" aria-label="Close"><IClose /></button>
          </div>
          <div className="frame">
            <div ref={frameRef} style={{ width: '100%', height: '100%' }} />
            {!isFile && !errMsg && (
              <>
                <div className="audiocover" style={{ opacity: videoOff ? 1 : 0, pointerEvents: videoOff ? 'auto' : 'none' }} onClick={togglePlay} role="button" aria-label={playing ? 'Pause' : 'Play'}><AudioViz playing={playing} title={cur.title} channel={cur.channelTitle} /></div>
                <button className="vidtoggle" onClick={() => {
                  if (videoOff) {
                    setShowConfirm(true);
                  } else {
                    setVideoOff(true);
                  }
                }}
                  title={videoOff ? 'Show video' : 'Hide video (audio keeps playing)'}
                  aria-label={videoOff ? 'Show video' : 'Hide video'}
                >
                  {videoOff ? <IVideo /> : <IVideoOff />}
                </button>
                {showConfirm && (
                  <div className="qf-backdrop" style={{ zIndex: 9999, display: 'grid', placeItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
                    <div className="login-card" style={{ background: 'var(--bg)', padding: '24px', borderRadius: '12px' }}>
                      <div className="fm-title" style={{ marginBottom: '16px' }}>Are you sure want to unhide the video ?</div>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button className="btn" onClick={() => setShowConfirm(false)}>Cancel</button>
                        <button className="btn primary" onClick={() => { 
                          setShowConfirm(false); 
                          setVideoOff(false); 
                          const S = window.YT?.PlayerState;
                          const p = playerRef.current;
                          if (S && p) setPlaying(p.getPlayerState() === S.PLAYING);
                        }}>Yes, Unhide</button>
                      </div>
                    </div>
                  </div>
                )}
                {ended && (
                  <div className="endcover">
                    <div className="end-title">Finished</div>
                    <div className="end-actions">
                      <button className="btn primary" onClick={replay}><IPlay />Replay</button>
                      <button className="btn" onClick={close}>Back to feed</button>
                    </div>
                  </div>
                )}
              </>
            )}
            {isFile ? (
              <div className="frame-msg">
                <div className="fm-title">Playback needs a web address</div>
                <div className="fm-body">YouTube's player won't run on a page opened from disk (<b>file://</b>). Serve it over http — run <span className="mono">python3 -m http.server 8000</span> in this folder, then open <b>http://localhost:8000</b>.</div>
                <a href={`https://www.youtube.com/watch?v=${cur.id}`} target="_blank" rel="noopener" className="btn primary">Watch on YouTube ↗</a>
              </div>
            ) : errMsg ? (
              <div className="frame-msg">
                <div className="fm-title">Can't play here</div>
                <div className="fm-body">{errMsg}</div>
                <a href={`https://www.youtube.com/watch?v=${cur.id}`} target="_blank" rel="noopener" className="btn primary">Watch on YouTube ↗</a>
              </div>
            ) : null}
          </div>
          {!pip && (
            <>
              <div className="info">
                <div><h3>{cur.title}</h3><div className="sub">{cur.channelTitle} · {cur.views != null ? fmtViews(cur.views) + ' · ' : ''}{ago(cur.published)}</div></div>
              </div>
              {desc.trim() && (
                <div className="pdesc">
                  <button className="pdesc-toggle" onClick={() => setDescOpen(o => !o)}>
                    {descOpen ? 'Hide description ▴' : 'Show description ▾'}
                  </button>
                  {descOpen && <div className="pdesc-body">{desc}</div>}
                </div>
              )}
              <div className="pkeys">Click outside to pop out · <b>Space</b> play/pause · <b>←/→</b> seek · <b>F</b> fullscreen · <b>M</b> mute · <b>Esc</b> close</div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
