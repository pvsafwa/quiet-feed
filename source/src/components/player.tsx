import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { ytReady } from '../lib/ytapi';
import { api } from '../lib/api';
import { addWatch, setPos, markDone, isDone } from '../lib/progress';
import { ago, views as fmtViews, fmtDur } from '../lib/format';
import { IClose, IVideo, IVideoOff, IPip, IExpand, IPlay, IPause, ICheck, IGear, IRefresh } from './states';

// Decorative equalizer shown when the video is hidden.
function AudioViz({ playing, title, channel }: { playing: boolean; title: string; channel: string }) {
  return (
    <div className="audioviz">
      <div className={`viz-orb ${playing ? 'on' : ''}`}>{playing ? <IPause /> : <IPlay />}</div>
      <div className={`viz-bars ${playing ? 'on' : ''}`} aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 5) * 0.13}s`, animationDuration: `${0.7 + (i % 3) * 0.22}s` }} />
        ))}
      </div>
      <div className="viz-title">{title}</div>
      <div className="viz-sub">{channel} · Audio Only · tap to {playing ? 'pause' : 'play'}</div>
    </div>
  );
}

const QUALITY_OPTIONS = [
  { id: 'auto', label: 'Auto (Recommended)', short: 'Auto' },
  { id: 'hd1080', label: '1080p HD', short: '1080p' },
  { id: 'hd720', label: '720p HD', short: '720p' },
  { id: 'large', label: '480p', short: '480p' },
  { id: 'medium', label: '360p', short: '360p' },
  { id: 'small', label: '240p', short: '240p' },
  { id: 'tiny', label: '144p', short: '144p' },
];

export function PlayerModal() {
  const cur = useStore(s => s.cur);
  const close = useStore(s => s.closePlayer);
  const prog = useStore(s => s.prog);
  const frameRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const tickRef = useRef<any>(null);
  const tcRef = useRef(0);

  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [desc, setDesc] = useState<string>('');
  const [descOpen, setDescOpen] = useState(false);
  const [videoOff, setVideoOff] = useState(true); // default: audio-only/hidden
  const [playing, setPlaying] = useState(false);
  const [pip, setPip] = useState(false); // default: full view on launch
  const [ended, setEnded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(cur?.seconds || 0);

  const [quality, setQuality] = useState(() => {
    try { return localStorage.getItem('qf_player_quality') || 'auto'; } catch { return 'auto'; }
  });
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const isFile = typeof location !== 'undefined' && location.protocol === 'file:';

  const selectQuality = (qId: string) => {
    setQuality(qId);
    setQualityMenuOpen(false);
    const p = playerRef.current;
    if (p) {
      try {
        if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(qId);
        if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(qId, qId);
      } catch {}
    }
    try { localStorage.setItem('qf_player_quality', qId); } catch {}
    const opt = QUALITY_OPTIONS.find(o => o.id === qId);
    useStore.getState().toast(`Quality: ${opt?.label || qId}`);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const container = frameRef.current?.closest('.qf-window') || frameRef.current;
      if (container?.requestFullscreen) {
        container.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const seekOffset = (sec: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const t = p.getCurrentTime() || 0;
      const target = Math.max(0, Math.min(totalDuration || 9999, t + sec));
      p.seekTo(target, true);
      setCurrentTime(target);
    } catch {}
  };

  const handleSeekRatio = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * totalDuration;
    playerRef.current?.seekTo?.(target, true);
    setCurrentTime(target);
  };

  const handleShare = async () => {
    if (!cur) return;
    const url = `https://youtu.be/${cur.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: cur.title, text: cur.title, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      useStore.getState().toast('Link copied to clipboard!');
    } catch {
      useStore.getState().toast(url);
    }
  };

  const toggleWatched = () => {
    if (!cur) return;
    const p = useStore.getState().prog;
    const done = isDone(p, cur.id);
    if (done) {
      const vRec = p.v[cur.id];
      if (vRec) vRec.done = 0;
      useStore.getState().commitProg();
      useStore.getState().toast('Marked unwatched');
    } else {
      markDone(p, cur.id, totalDuration || cur.seconds);
      useStore.getState().commitProg();
      useStore.getState().toast('Marked watched');
    }
  };

  function stopTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
      useStore.getState().persistProg();
    }
  }

  function startTick() {
    stopTick();
    tickRef.current = setInterval(() => {
      const p = playerRef.current;
      const v = useStore.getState().cur;
      if (!p || !v) return;
      let t = 0, dur = 0;
      try {
        t = p.getCurrentTime() || 0;
        dur = p.getDuration() || 0;
      } catch { return; }

      const progStore = useStore.getState().prog;
      const duration = dur || v.seconds || totalDuration || 0;

      setCurrentTime(t);
      if (duration > 0 && duration !== totalDuration) {
        setTotalDuration(duration);
      }

      addWatch(progStore, v.id, 1, duration);
      setPos(progStore, v.id, t, duration);
      if (duration > 0 && t / duration >= 0.92 && !isDone(progStore, v.id)) {
        markDone(progStore, v.id, duration);
      }

      tcRef.current++;
      if (tcRef.current % 5 === 0) useStore.getState().persistProg();
    }, 1000);
  }

  // MediaSession integration for Lockscreen & Control Center audio widgets.
  // Chrome on Android + iOS Safari will show lock-screen / notification controls
  // when a MediaSession is active, allowing background audio to continue.
  useEffect(() => {
    if (!cur || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: cur.title,
      artist: cur.channelTitle,
      artwork: [
        { src: `https://i.ytimg.com/vi/${cur.id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
      ],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      playerRef.current?.playVideo?.();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      playerRef.current?.pauseVideo?.();
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      seekOffset(-10);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      seekOffset(10);
    });

    return () => {
      // Clean up handlers when unmounting
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      } catch {}
    };
  }, [cur?.id, cur?.title, cur?.channelTitle, totalDuration]);

  // Keyboard controls
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
          case 'ArrowRight': e.preventDefault(); seekOffset(10); break;
          case 'ArrowLeft': e.preventDefault(); seekOffset(-10); break;
          case 'f': { e.preventDefault(); toggleFullscreen(); break; }
          case 'm': p.isMuted?.() ? p.unMute() : p.mute(); break;
        }
      } catch {}
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cur, close, totalDuration]);

  // Fetch video description
  useEffect(() => {
    setDesc(''); setDescOpen(false);
    if (!cur) return;
    let cancelled = false;
    api.videoMeta(cur.id).then(m => { if (!cancelled) setDesc(m.description || ''); }).catch(() => {});
    return () => { cancelled = true; };
  }, [cur?.id]);

  // YouTube player creation
  useEffect(() => {
    setErrMsg(null);
    setVideoOff(true);
    setPlaying(false);
    setEnded(false);
    setCurrentTime(0);
    setPip(false);
    tcRef.current = 0;
    if (!cur || isFile) return;

    const progStore = useStore.getState().prog;
    const pr = progStore.v[cur.id];
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
          onReady: () => {
            if (quality && quality !== 'auto') {
              try {
                playerRef.current?.setPlaybackQuality?.(quality);
                playerRef.current?.setPlaybackQualityRange?.(quality, quality);
              } catch {}
            }
          },
          onStateChange: (e: any) => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) {
              startTick();
              setPlaying(true);
              setEnded(false);
            } else {
              stopTick();
              setPlaying(false);
            }
            if (e.data === S.ENDED) {
              setEnded(true);
              const v = useStore.getState().cur;
              if (v) {
                let dur = 0;
                try { dur = playerRef.current.getDuration(); } catch {}
                markDone(useStore.getState().prog, v.id, dur || v.seconds);
                useStore.getState().commitProg();
              }
            }
          },
          onError: (e: any) => {
            stopTick();
            const code = e.data;
            const msg = (code === 101 || code === 150) ? 'The owner has turned off playback of this video on other sites.'
              : code === 100 ? 'This video is unavailable — it may be private or removed.'
              : "This video can't be played here.";
            if (playerRef.current) { try { playerRef.current.destroy(); } catch {} playerRef.current = null; }
            if (frameRef.current) frameRef.current.innerHTML = '';
            setErrMsg(msg);
          },
        },
      });
    }).catch((err: any) => {
      if (cancelled) return;
      if (frameRef.current) frameRef.current.innerHTML = '';
      setErrMsg(err?.message || "Couldn't load YouTube player.");
    });

    return () => {
      cancelled = true;
      stopTick();
      if (playerRef.current) { try { playerRef.current.destroy(); } catch {} playerRef.current = null; }
      if (frameRef.current) frameRef.current.innerHTML = '';
    };
  }, [cur?.id]);

  const replay = () => {
    const p = playerRef.current;
    if (p) { try { p.seekTo(0, true); p.playVideo(); } catch {} }
    setEnded(false);
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const S = window.YT?.PlayerState;
      if (S && p.getPlayerState() === S.PLAYING) p.pauseVideo(); else p.playVideo();
    } catch {}
  };

  const progPct = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;
  const done = isDone(prog, cur?.id || '');

  // ──────────────────────────────────────────────────────────────
  // CRITICAL LAYOUT: The iframe container (frameRef) MUST always
  // stay mounted in the DOM. When we switch between modal ↔ pip,
  // we only change CSS visibility—never unmount. Unmounting would
  // destroy the YouTube iframe and kill audio playback.
  // ──────────────────────────────────────────────────────────────

  return createPortal(
    <AnimatePresence>
      {/* Backdrop only in full (modal) mode; clicking it minimises to pip */}
      {cur && !pip && (
        <motion.div key="qf-bd" className="qf-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setPip(true)} />
      )}

      {cur && (
        <motion.div
          key="qf-win"
          className={`qf-window ${pip ? 'pip' : 'modal'}`}
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 18 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        >

          {/* ━━━━━ IFRAME CONTAINER — ALWAYS MOUNTED ━━━━━
              In pip mode we collapse it to 0-height so the iframe
              stays alive (audio keeps playing) but takes no space.
              We use overflow:hidden + height:0 instead of display:none
              because display:none can cause some browsers to pause media. */}
          <div
            className="frame"
            style={pip ? { height: 0, minHeight: 0, overflow: 'hidden', border: 'none' } : undefined}
          >
            <div ref={frameRef} style={{ width: '100%', height: '100%' }} />
            {!isFile && !errMsg && (
              <>
                <div
                  className="audiocover"
                  style={{ opacity: videoOff ? 1 : 0, pointerEvents: videoOff ? 'auto' : 'none' }}
                  onClick={togglePlay}
                  role="button"
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  <AudioViz playing={playing} title={cur.title} channel={cur.channelTitle} />
                </div>

                <button
                  className="vidtoggle"
                  onClick={() => {
                    if (videoOff) setShowConfirm(true);
                    else setVideoOff(true);
                  }}
                  title={videoOff ? 'Show video' : 'Hide video (audio keeps playing)'}
                  aria-label={videoOff ? 'Show video' : 'Hide video'}
                >
                  {videoOff ? <IVideo /> : <IVideoOff />}
                </button>

                {showConfirm && (
                  <div className="qf-backdrop" style={{ zIndex: 9999, display: 'grid', placeItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
                    <div className="login-card" style={{ background: 'var(--bg)', padding: '24px', borderRadius: '12px' }}>
                      <div className="fm-title" style={{ marginBottom: '16px' }}>Are you sure you want to unhide the video?</div>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button className="btn" onClick={() => setShowConfirm(false)}>Cancel</button>
                        <button
                          className="btn primary"
                          onClick={() => {
                            setShowConfirm(false);
                            setVideoOff(false);
                            const S = window.YT?.PlayerState;
                            const p = playerRef.current;
                            if (S && p) setPlaying(p.getPlayerState() === S.PLAYING);
                          }}
                        >
                          Yes, Unhide
                        </button>
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
                <div className="fm-body">Serve it over http or open in browser.</div>
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
          {/* ━━━━━ END IFRAME CONTAINER ━━━━━ */}


          {/* ━━━━━ MINI-PLAYER BAR (visible when pip=true) ━━━━━ */}
          {pip && (
            <div className="mini-player-bar" onClick={() => setPip(false)}>
              <div className="mini-prog-track">
                <div className="mini-prog-fill" style={{ width: `${progPct}%` }} />
              </div>
              <div className="mini-inner">
                <div className="mini-meta">
                  <div className="mini-title">{cur.title}</div>
                  <div className="mini-sub">{cur.channelTitle}</div>
                </div>
                <button className="mini-btn" onClick={e => { e.stopPropagation(); togglePlay(); }} title={playing ? 'Pause' : 'Play'}>
                  {playing ? <IPause /> : <IPlay />}
                </button>
                <button className="mini-btn" onClick={e => { e.stopPropagation(); close(); }} title="Close">
                  <IClose />
                </button>
              </div>
            </div>
          )}


          {/* ━━━━━ FULL PLAYER CONTROLS (visible when pip=false) ━━━━━ */}
          {!pip && (
            <>
              {/* TOP HEADER CONTROLS */}
              <div className="qf-modal-top">
                <button className="qf-top-btn" onClick={() => setPip(true)} title="Minimize player">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ width: 22, height: 22 }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <span className="qf-top-label">Now Playing</span>
                <button className="qf-top-btn" onClick={close} title="Close player">
                  <IClose />
                </button>
              </div>

              {/* PROGRESS BAR & SEEK BAR */}
              <div className="player-progress-wrap">
                <div className="player-seek-touch" onClick={handleSeekRatio}>
                  <div className="player-seek-track">
                    <div className="player-seek-fill" style={{ width: `${progPct}%` }} />
                  </div>
                  <div className="player-seek-knob" style={{ left: `${Math.max(0, Math.min(98, progPct))}%` }} />
                </div>
                <div className="player-time-row">
                  <span>{fmtDur(Math.floor(currentTime)) || '0:00'}</span>
                  <span>{fmtDur(Math.floor(totalDuration)) || '--:--'}</span>
                </div>
              </div>

              {/* CONTROLS BAR */}
              <div className="player-controls-bar">
                <button className="ctrl-action" onClick={replay} title="Restart">
                  <IRefresh />
                  <span>Restart</span>
                </button>

                <button className="ctrl-action" onClick={() => seekOffset(-10)} title="-10 seconds">
                  <span style={{ fontSize: '15px', fontWeight: '800' }}>‹ 10</span>
                  <span>-10s</span>
                </button>

                <button className="ctrl-play-orb" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
                  {playing ? <IPause style={{ width: 22, height: 22 }} /> : <IPlay style={{ width: 22, height: 22, marginLeft: 2 }} />}
                </button>

                <button className="ctrl-action" onClick={() => seekOffset(10)} title="+10 seconds">
                  <span style={{ fontSize: '15px', fontWeight: '800' }}>10 ›</span>
                  <span>+10s</span>
                </button>

                {/* Quality Button */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="ctrl-action"
                    onClick={() => setQualityMenuOpen(o => !o)}
                    title="Playback Quality"
                  >
                    <IGear style={{ width: 19, height: 19, color: 'var(--accent)' }} />
                    <span style={{ color: 'var(--accent)', fontWeight: '700' }}>
                      {quality === 'auto' ? 'Auto' : quality.replace('hd', '')}
                    </span>
                  </button>

                  {qualityMenuOpen && (
                    <div className="quality-dropdown-menu">
                      <div className="qdm-title">Resolution</div>
                      {QUALITY_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          className={`qdm-item ${quality === opt.id ? 'active' : ''}`}
                          onClick={() => selectQuality(opt.id)}
                        >
                          <span>{opt.label}</span>
                          {quality === opt.id && <ICheck style={{ width: 14, height: 14, color: 'var(--accent)' }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fullscreen Button */}
                <button className="ctrl-action" onClick={toggleFullscreen} title="Fullscreen">
                  <IExpand />
                  <span>Full</span>
                </button>

                {/* Share Button */}
                <button className="ctrl-action" onClick={handleShare} title="Share video">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 19, height: 19 }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
                  <span>Share</span>
                </button>

                {/* Watched / Done Toggle */}
                <button className={`ctrl-action ${done ? 'done-active' : ''}`} onClick={toggleWatched} title="Toggle watched">
                  <ICheck style={{ width: 19, height: 19, color: done ? 'var(--good)' : 'var(--ink-soft)' }} />
                  <span style={{ color: done ? 'var(--good)' : 'inherit' }}>{done ? 'Watched' : 'Done'}</span>
                </button>
              </div>

              {/* VIDEO INFO & DETAILS */}
              <div className="info">
                <div>
                  <h3>{cur.title}</h3>
                  <div className="sub">
                    {cur.channelTitle} · {cur.views != null ? fmtViews(cur.views) + ' · ' : ''}{ago(cur.published)}
                  </div>
                </div>
              </div>

              {desc.trim() && (
                <div className="pdesc">
                  <button className="pdesc-toggle" onClick={() => setDescOpen(o => !o)}>
                    {descOpen ? 'Hide description ▴' : 'Show description ▾'}
                  </button>
                  {descOpen && <div className="pdesc-body">{desc}</div>}
                </div>
              )}
            </>
          )}

        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
