import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { ytReady } from '../lib/ytapi';
import { api } from '../lib/api';
import { addWatch, setPos, markDone, isDone } from '../lib/progress';
import { ago, views as fmtViews, fmtDur } from '../lib/format';
import { bgPlay, bgPause, bgDestroy } from '../lib/bgaudio';
import { IClose, IVideo, IVideoOff, IExpand, IPlay, IPause, ICheck, IGear, IRefresh } from './states';

// Decorative equalizer shown when the video is hidden (audio-only mode).
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
  const playerQueue = useStore(s => s.playerQueue);
  const playerQueueIdx = useStore(s => s.playerQueueIdx);
  const playerStartMinimized = useStore(s => s.playerStartMinimized);
  const playNext = useStore(s => s.playNext);
  const playPrev = useStore(s => s.playPrev);
  const close = useStore(s => s.closePlayer);
  const prog = useStore(s => s.prog);
  const progV = useStore(s => s.progV);

  const frameRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const tickRef = useRef<any>(null);
  const tcRef = useRef(0);

  // Track whether the USER explicitly paused vs YouTube auto-pausing
  const userPausedRef = useRef(false);
  const autoResumeTimerRef = useRef<any>(null);

  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [desc, setDesc] = useState<string>('');
  const [descOpen, setDescOpen] = useState(false);
  const [videoOff, setVideoOff] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [pip, setPip] = useState(playerStartMinimized);
  const [ended, setEnded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(cur?.seconds || 0);
  const [videoFitMode, setVideoFitMode] = useState<'fit' | 'fill'>('fit');

  // Continuous auto-play next countdown
  const [autoPlayCountdown, setAutoPlayCountdown] = useState<number | null>(null);
  const [cancelledAutoPlay, setCancelledAutoPlay] = useState(false);
  const autoPlayTimer = useRef<any>(null);

  const [quality, setQuality] = useState(() => {
    try { return localStorage.getItem('qf_player_quality') || 'auto'; } catch { return 'auto'; }
  });
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const isFile = typeof location !== 'undefined' && location.protocol === 'file:';

  const hasPrev = playerQueueIdx > 0;
  const hasNext = playerQueueIdx < playerQueue.length - 1;

  // Adapt pip when playerStartMinimized changes
  useEffect(() => {
    if (playerStartMinimized) setPip(true);
  }, [playerStartMinimized]);

  // Sync position and duration dynamically when video or server progress changes
  useEffect(() => {
    if (!cur) return;
    const pr = prog.v[cur.id];
    const initialDur = cur.seconds || (pr && pr.d) || 0;
    const initialPos = (pr && !pr.done && pr.p > 0) ? Math.floor(pr.p) : 0;
    if (initialDur > 0 && (!totalDuration || totalDuration === 0)) {
      setTotalDuration(initialDur);
    }
    if (initialPos > 0 && currentTime === 0 && !playing && !isScrubbingRef.current) {
      setCurrentTime(initialPos);
    }
  }, [cur?.id, progV, playing]);

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

  const [captionsOn, setCaptionsOn] = useState(false);
  const toggleCaptions = () => {
    setCaptionsOn(prev => {
      const next = !prev;
      try {
        if (next) {
          playerRef.current?.loadModule?.('captions');
          playerRef.current?.setOption?.('captions', 'reload', true);
        } else {
          playerRef.current?.unloadModule?.('captions');
          playerRef.current?.setOption?.('captions', 'track', {});
        }
      } catch {}
      useStore.getState().toast(next ? 'Captions enabled' : 'Captions disabled');
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const container = frameRef.current?.closest('.qf-window') || frameRef.current;
      if (container?.requestFullscreen) container.requestFullscreen();
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

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const isScrubbingRef = useRef(false);

  const handleSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalDuration <= 0) return;
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch {}
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * totalDuration;
    setScrubTime(target);
  };

  const handleSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current || totalDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * totalDuration;
    setScrubTime(target);
  };

  const handleSeekPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current || totalDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * totalDuration;
    try {
      playerRef.current?.seekTo?.(target, true);
    } catch {}
    setCurrentTime(target);
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const handleSeekPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const toggleWatched = () => {
    if (!cur) return;
    const progStore = useStore.getState().prog;
    const v = progStore.v[cur.id] || (progStore.v[cur.id] = { p: 0, d: 0, done: 0, w: 0, t: 0 });
    const nextDone = v.done ? 0 : 1;
    v.done = nextDone;
    v.t = Date.now();
    useStore.getState().commitProg();
    useStore.getState().toast(nextDone ? 'Marked as completed' : 'Marked as uncompleted');
  };

  const handleShare = async () => {
    if (!cur) return;
    const url = `https://youtu.be/${cur.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: cur.title, text: `Watch "${cur.title}" on Quiet Feed`, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      useStore.getState().toast('Video link copied to clipboard');
    } catch {
      useStore.getState().toast(url);
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
      try { t = p.getCurrentTime() || 0; dur = p.getDuration() || 0; } catch { return; }

      const progStore = useStore.getState().prog;
      const duration = dur || v.seconds || totalDuration || 0;

      if (!isScrubbingRef.current) {
        setCurrentTime(t);
      }
      if (duration > 0 && duration !== totalDuration) setTotalDuration(duration);

      addWatch(progStore, v, 1, duration);
      setPos(progStore, v, t, duration);
      if (duration > 0 && t / duration >= 0.92 && !isDone(progStore, v.id)) {
        markDone(progStore, v, duration);
      }

      tcRef.current++;
      if (tcRef.current % 5 === 0) useStore.getState().persistProg();
    }, 1000);
  }

  // ── User-initiated play / pause ──
  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const S = window.YT?.PlayerState;
      if (S && p.getPlayerState() === S.PLAYING) {
        userPausedRef.current = true;
        p.pauseVideo();
      } else {
        userPausedRef.current = false;
        p.playVideo();
      }
    } catch {}
  };

  // ── Auto-resume when YouTube background-pauses ──
  function scheduleAutoResume() {
    clearTimeout(autoResumeTimerRef.current);
    autoResumeTimerRef.current = setTimeout(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const S = window.YT?.PlayerState;
        if (S && p.getPlayerState() !== S.PLAYING && !userPausedRef.current) {
          p.playVideo();
        }
      } catch {}
    }, 600);
  }

  // ── MediaSession (lock-screen / notification controls) ──
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
      userPausedRef.current = false;
      playerRef.current?.playVideo?.();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      userPausedRef.current = true;
      playerRef.current?.pauseVideo?.();
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => seekOffset(-10));
    navigator.mediaSession.setActionHandler('seekforward', () => seekOffset(10));
    if (hasNext) {
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    }
    if (hasPrev) {
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      } catch {}
    };
  }, [cur?.id, cur?.title, cur?.channelTitle, totalDuration, hasNext, hasPrev]);

  // ── Visibility-change: spoof + auto-resume ──
  useEffect(() => {
    if (!cur) return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (!userPausedRef.current) scheduleAutoResume();
      } else {
        if (!userPausedRef.current && playerRef.current) {
          try {
            const S = window.YT?.PlayerState;
            if (S && playerRef.current.getPlayerState() !== S.PLAYING) {
              playerRef.current.playVideo();
            }
          } catch {}
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [cur?.id]);

  // ── Keyboard controls ──
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { setPip(true); return; }
      const p = playerRef.current;
      if (!p) return;
      try {
        switch (e.key) {
          case ' ': case 'k': e.preventDefault(); togglePlay(); break;
          case 'ArrowRight': e.preventDefault(); seekOffset(10); break;
          case 'ArrowLeft': e.preventDefault(); seekOffset(-10); break;
          case 'f': e.preventDefault(); toggleFullscreen(); break;
          case 'm': p.isMuted?.() ? p.unMute() : p.mute(); break;
          case 'n': if (hasNext) playNext(); break;
          case 'p': if (hasPrev) playPrev(); break;
        }
      } catch {}
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cur, close, totalDuration, hasNext, hasPrev]);

  // ── Fetch video description ──
  useEffect(() => {
    setDesc(''); setDescOpen(false);
    if (!cur) return;
    let cancelled = false;
    api.videoMeta(cur.id).then(m => { if (!cancelled) setDesc(m.description || ''); }).catch(() => {});
    return () => { cancelled = true; };
  }, [cur?.id]);

  // ── Auto-play cancellation & next trigger ──
  const handleCancelAutoPlay = () => {
    if (autoPlayTimer.current) clearInterval(autoPlayTimer.current);
    autoPlayTimer.current = null;
    setAutoPlayCountdown(null);
    setCancelledAutoPlay(true);
  };

  const handlePlayNextNow = () => {
    if (autoPlayTimer.current) clearInterval(autoPlayTimer.current);
    autoPlayTimer.current = null;
    setAutoPlayCountdown(null);
    playNext();
  };

  // ── YouTube player creation ──
  useEffect(() => {
    setErrMsg(null);
    setVideoOff(true);
    setPlaying(false);
    setEnded(false);
    setAutoPlayCountdown(null);
    setCancelledAutoPlay(false);
    setCurrentTime(0);
    userPausedRef.current = false;
    tcRef.current = 0;
    if (!cur || isFile) return;

    const progStore = useStore.getState().prog;
    const pr = progStore.v[cur.id];
    const startAt = (pr && !pr.done && pr.p > 2 && (!pr.d || pr.p < pr.d * 0.95)) ? Math.floor(pr.p) : 0;
    let cancelled = false;
    const host = document.createElement('div');
    frameRef.current?.appendChild(host);

    ytReady().then(() => {
      if (cancelled) return;
      playerRef.current = new window.YT.Player(host, {
        videoId: cur.id,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          autoplay: 1,
          start: startAt,
          iv_load_policy: 3,
          origin: location.origin,
          controls: 0,
          fs: 0,
          disablekb: 1,
          cc_load_policy: 0,
        },
        events: {
          onReady: () => {
            try {
              playerRef.current?.unloadModule?.('captions');
              playerRef.current?.setOption?.('captions', 'track', {});
            } catch {}
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
              userPausedRef.current = false;
              clearTimeout(autoResumeTimerRef.current);
              setAutoPlayCountdown(null);
              startTick();
              setPlaying(true);
              setEnded(false);
              bgPlay();

              // Auto-seek if starting from 0 and resume point exists
              const prCurrent = useStore.getState().prog.v[cur.id];
              if (prCurrent && prCurrent.p > 2 && (!prCurrent.done || prCurrent.p < (prCurrent.d || 9999) * 0.95)) {
                try {
                  const t = playerRef.current?.getCurrentTime() || 0;
                  if (t < 2 && prCurrent.p > 5) {
                    playerRef.current?.seekTo(Math.floor(prCurrent.p), true);
                  }
                } catch {}
              }
            } else if (e.data === S.PAUSED) {
              stopTick();
              setPlaying(false);
              if (!userPausedRef.current) {
                scheduleAutoResume();
              } else {
                bgPause();
              }
            } else if (e.data === S.ENDED) {
              stopTick();
              setPlaying(false);
              setEnded(true);
              bgPause();
              const v = useStore.getState().cur;
              if (v) {
                let dur = 0;
                try { dur = playerRef.current.getDuration(); } catch {}
                markDone(useStore.getState().prog, v, dur || v.seconds);
                useStore.getState().commitProg();
              }

              // Continuous auto-play next countdown
              const currentQueue = useStore.getState().playerQueue;
              const currentIdx = useStore.getState().playerQueueIdx;
              const canPlayNext = currentIdx >= 0 && currentIdx < currentQueue.length - 1;

              if (canPlayNext && !cancelledAutoPlay) {
                let count = 3;
                setAutoPlayCountdown(count);
                if (autoPlayTimer.current) clearInterval(autoPlayTimer.current);
                autoPlayTimer.current = setInterval(() => {
                  count -= 1;
                  if (count <= 0) {
                    if (autoPlayTimer.current) clearInterval(autoPlayTimer.current);
                    autoPlayTimer.current = null;
                    setAutoPlayCountdown(null);
                    useStore.getState().playNext();
                  } else {
                    setAutoPlayCountdown(count);
                  }
                }, 1000);
              }
            } else {
              stopTick();
              setPlaying(false);
            }
          },
          onError: (e: any) => {
            stopTick();
            bgPause();
            const code = e.data;
            const msg = (code === 101 || code === 150)
              ? 'The owner has turned off playback of this video on other sites.'
              : code === 100
              ? 'This video is unavailable — it may be private or removed.'
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
      clearTimeout(autoResumeTimerRef.current);
      if (autoPlayTimer.current) {
        clearInterval(autoPlayTimer.current);
        autoPlayTimer.current = null;
      }
      stopTick();
      bgDestroy();
      if (playerRef.current) { try { playerRef.current.destroy(); } catch {} playerRef.current = null; }
      if (frameRef.current) frameRef.current.innerHTML = '';
    };
  }, [cur?.id]);

  const replay = () => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
    setAutoPlayCountdown(null);
    userPausedRef.current = false;
    const p = playerRef.current;
    if (p) { try { p.seekTo(0, true); p.playVideo(); } catch {} }
    setEnded(false);
    setPlaying(true);
  };

  const vRecord = cur ? prog.v[cur.id] : undefined;
  const effectiveDuration = totalDuration || (vRecord && vRecord.d) || cur?.seconds || 0;
  const effectiveTime = isScrubbing ? scrubTime : (currentTime > 0 ? currentTime : (vRecord && !vRecord.done ? vRecord.p : 0));
  const done = cur ? isDone(prog, cur.id) : false;
  const progPct = effectiveDuration > 0 ? Math.min(100, (effectiveTime / effectiveDuration) * 100) : (done ? 100 : 0);
  const displayTime = isScrubbing ? scrubTime : (currentTime > 0 ? currentTime : (vRecord ? vRecord.p : 0));

  return createPortal(
    <AnimatePresence>
      {cur && !pip && (
        <motion.div
          key="qf-bd"
          className="qf-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setPip(true)}
        />
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
          {/* ━━━ IFRAME CONTAINER (pointerEvents blocked to suppress YouTube UI) ━━━ */}
          <div
            className={`frame ${videoFitMode === 'fill' ? 'fit-fill' : 'fit-contain'}`}
            style={pip ? { height: 0, minHeight: 0, overflow: 'hidden', border: 'none' } : undefined}
          >
            <div ref={frameRef} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />

            {/* Tap overlay: Audio-only vs Video Tap Overlay */}
            {!isFile && !errMsg && (
              <>
                {/* AUDIO-ONLY COVER */}
                <div
                  className="audiocover"
                  style={{ opacity: videoOff ? 1 : 0, pointerEvents: videoOff ? 'auto' : 'none' }}
                  onClick={togglePlay}
                  role="button"
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  <AudioViz playing={playing} title={cur.title} channel={cur.channelTitle} />
                </div>

                {/* VIDEO-VISIBLE TAP OVERLAY */}
                {!videoOff && (
                  <div
                    className="video-tap-overlay"
                    onClick={togglePlay}
                    role="button"
                    aria-label={playing ? 'Pause' : 'Play'}
                  >
                    {!playing && !ended && autoPlayCountdown === null && (
                      <div className="video-tap-play-icon">
                        <IPlay style={{ width: 36, height: 36, marginLeft: 4 }} />
                      </div>
                    )}
                  </div>
                )}

                {/* VIDEO / AUDIO TOGGLE BUTTON */}
                <button
                  className="vidtoggle"
                  onClick={() => { if (videoOff) setShowConfirm(true); else setVideoOff(true); }}
                  title={videoOff ? 'Show video' : 'Hide video (audio keeps playing)'}
                  aria-label={videoOff ? 'Show video' : 'Hide video'}
                >
                  {videoOff ? <IVideo /> : <IVideoOff />}
                </button>

                {/* UNHIDE VIDEO CONFIRMATION */}
                {showConfirm && (
                  <div className="qf-backdrop" style={{ zIndex: 9999, display: 'grid', placeItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
                    <div className="login-card" style={{ background: 'var(--bg)', padding: '24px', borderRadius: '12px' }}>
                      <div className="fm-title" style={{ marginBottom: '16px' }}>Are you sure you want to unhide the video?</div>
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

                {/* ENDED / AUTO-PLAY COUNTDOWN OVERLAY */}
                {ended && autoPlayCountdown !== null && (
                  <div className="endcover ap-countdown-box">
                    <div className="ap-label">Continuous Playback</div>
                    <div className="ap-next-num">Next video in {autoPlayCountdown}s…</div>
                    <div className="ap-next-title">{playerQueue[playerQueueIdx + 1]?.title || 'Next video'}</div>
                    <div className="ap-actions">
                      <button className="btn primary" onClick={handlePlayNextNow}><IPlay />Play Now</button>
                      <button className="btn" onClick={handleCancelAutoPlay}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* ENDED OVERLAY (When auto-play not queued or cancelled) */}
                {ended && autoPlayCountdown === null && (
                  <div className="endcover">
                    <div className="end-title">Finished</div>
                    <div className="end-actions">
                      <button className="btn primary" onClick={replay}><IRefresh />Replay</button>
                      {hasNext && <button className="btn" onClick={playNext}>Next Video ↗</button>}
                      <button className="btn" onClick={() => setPip(true)}>Minimize</button>
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

          {/* ━━━ MINI-PLAYER BAR (pip mode) ━━━ */}
          {pip && (
            <div className="mini-player-bar" onClick={() => setPip(false)}>
              <div className="mini-prog-track">
                <div className="mini-prog-fill" style={{ width: `${progPct}%` }} />
              </div>
              <div className="mini-inner">
                <img
                  className="mini-thumb"
                  src={cur.thumb}
                  alt=""
                  onError={e => {
                    const t = e.target as HTMLImageElement;
                    if (t.src.includes('maxresdefault.jpg')) t.src = t.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                  }}
                />
                <div className="mini-meta">
                  <div className="mini-title">{cur.title}</div>
                  <div className="mini-sub">{cur.channelTitle}</div>
                </div>
                <div className="mini-actions" onClick={e => e.stopPropagation()}>
                  {hasPrev && (
                    <button className="mini-btn-icon" onClick={playPrev} title="Previous Video">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ width: 18, height: 18 }}>
                        <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
                      </svg>
                    </button>
                  )}
                  <button className="mini-btn-play" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
                    {playing ? <IPause /> : <IPlay style={{ marginLeft: 2 }} />}
                  </button>
                  {hasNext && (
                    <button className="mini-btn-icon" onClick={playNext} title="Next Video">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ width: 18, height: 18 }}>
                        <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
                      </svg>
                    </button>
                  )}
                  <button className="mini-btn-icon" onClick={close} title="Close">
                    <IClose />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ━━━ FULL PLAYER CONTROLS (modal mode - 2 BEAUTIFUL ROWS) ━━━ */}
          {!pip && (
            <>
              {/* TOP HEADER BAR */}
              <div className="qf-modal-top">
                <button className="qf-top-btn" onClick={() => setPip(true)} title="Minimize player">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ width: 22, height: 22 }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div className="qf-top-center">
                  <span className="qf-top-label">Now Playing</span>
                  {playerQueue.length > 1 && (
                    <span className="qf-top-queue-count">{playerQueueIdx + 1} of {playerQueue.length}</span>
                  )}
                </div>
                <button className="qf-top-btn" onClick={close} title="Close player">
                  <IClose />
                </button>
              </div>

              {/* PROGRESS BAR & SEEK CONTROLLER */}
              <div className="player-progress-wrap">
                <div
                  className={`player-seek-touch ${isScrubbing ? 'is-scrubbing' : ''}`}
                  onPointerDown={handleSeekPointerDown}
                  onPointerMove={handleSeekPointerMove}
                  onPointerUp={handleSeekPointerUp}
                  onPointerCancel={handleSeekPointerCancel}
                >
                  <div className="player-seek-track">
                    <div className="player-seek-fill" style={{ width: `${progPct}%` }} />
                  </div>
                  <div className={`player-seek-knob ${isScrubbing ? 'scrubbing' : ''}`} style={{ left: `${Math.max(0, Math.min(98, progPct))}%` }} />
                </div>
                <div className="player-time-row">
                  <span style={isScrubbing ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>
                    {fmtDur(Math.floor(displayTime)) || '0:00'}
                  </span>
                  <span>{fmtDur(Math.floor(effectiveDuration)) || '--:--'}</span>
                </div>
              </div>

              {/* 2-ROW CONTROLS CARD */}
              <div className="player-controls-card">
                {/* ROW 1: PRIMARY PLAYBACK CONTROLS */}
                <div className="player-playback-row">
                  {hasPrev ? (
                    <button className="ctrl-action-primary" onClick={playPrev} title="Previous Video">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ width: 20, height: 20 }}>
                        <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
                      </svg>
                      <span>Prev</span>
                    </button>
                  ) : (
                    <button className="ctrl-action-primary" onClick={replay} title="Restart">
                      <IRefresh style={{ width: 18, height: 18 }} />
                      <span>Restart</span>
                    </button>
                  )}

                  <button className="ctrl-action-primary" onClick={() => seekOffset(-10)} title="-10 seconds">
                    <span style={{ fontSize: '15px', fontWeight: '800' }}>‹ 10</span>
                    <span>-10s</span>
                  </button>

                  <button className="ctrl-play-orb" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
                    {playing ? <IPause style={{ width: 24, height: 24 }} /> : <IPlay style={{ width: 24, height: 24, marginLeft: 2 }} />}
                  </button>

                  <button className="ctrl-action-primary" onClick={() => seekOffset(10)} title="+10 seconds">
                    <span style={{ fontSize: '15px', fontWeight: '800' }}>10 ›</span>
                    <span>+10s</span>
                  </button>

                  {hasNext ? (
                    <button className="ctrl-action-primary" onClick={playNext} title="Next Video">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ width: 20, height: 20 }}>
                        <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
                      </svg>
                      <span>Next</span>
                    </button>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <button className="ctrl-action-primary" onClick={() => setQualityMenuOpen(o => !o)} title="Playback Quality">
                        <IGear style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                        <span style={{ color: 'var(--accent)', fontWeight: '700' }}>
                          {quality === 'auto' ? 'Auto' : quality.replace('hd', '')}
                        </span>
                      </button>
                      {qualityMenuOpen && (
                        <div className="quality-dropdown-menu">
                          <div className="qdm-title">Resolution</div>
                          {QUALITY_OPTIONS.map(opt => (
                            <button key={opt.id} className={`qdm-item ${quality === opt.id ? 'active' : ''}`} onClick={() => selectQuality(opt.id)}>
                              <span>{opt.label}</span>
                              {quality === opt.id && <ICheck style={{ width: 14, height: 14, color: 'var(--accent)' }} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="player-controls-divider" />

                {/* ROW 2: UTILITY ACTIONS (EQUAL 4-COLUMN FLEX GRID) */}
                <div className="player-utility-row">
                  <button className="ctrl-btn-util" onClick={toggleFullscreen} title="Fullscreen">
                    <IExpand style={{ width: 16, height: 16 }} />
                    <span>Fullscreen</span>
                  </button>

                  <button
                    className={`ctrl-btn-util ${captionsOn ? 'done-active' : ''}`}
                    onClick={toggleCaptions}
                    title={captionsOn ? 'Disable captions' : 'Enable captions'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16, color: captionsOn ? 'var(--accent)' : 'inherit' }}>
                      <rect x="2" y="4" width="20" height="16" rx="4" />
                      <path d="M7 15h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H7v6zM15 15h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2v6z" />
                    </svg>
                    <span style={{ color: captionsOn ? 'var(--accent)' : 'inherit', fontWeight: captionsOn ? 700 : 'inherit' }}>
                      {captionsOn ? 'CC On' : 'CC Off'}
                    </span>
                  </button>

                  <button className="ctrl-btn-util" onClick={handleShare} title="Share video">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
                    </svg>
                    <span>Share</span>
                  </button>

                  <button className={`ctrl-btn-util ${done ? 'done-active' : ''}`} onClick={toggleWatched} title="Toggle watched">
                    <ICheck style={{ width: 16, height: 16, color: done ? 'var(--good)' : 'var(--ink-soft)' }} />
                    <span style={{ color: done ? 'var(--good)' : 'inherit' }}>Done</span>
                  </button>
                </div>
              </div>

              {/* VIDEO INFO CARD */}
              <div className="info">
                <div>
                  <h3>{cur.title}</h3>
                  <div className="sub">
                    {cur.channelTitle} · {cur.views != null ? fmtViews(cur.views) + ' · ' : ''}{ago(cur.published)}
                  </div>
                </div>
              </div>

              {/* DESCRIPTION ACCORDION */}
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
