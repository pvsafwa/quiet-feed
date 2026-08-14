import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  DeviceEventEmitter,
  TouchableWithoutFeedback,
  Share,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Video } from '../lib/types';
import { useStore } from '../store';
import { addWatch, setPos, markDone, isDone } from '../lib/progress';
import { ago, fmtDur } from '../lib/format';
import { colors, radius } from '../theme';
import ExpoPip from '../../modules/expo-pip';

const MINI_PLAYER_HEIGHT = 60;
const TAB_BAR_HEIGHT = 60;

export function PlayerOverlay() {
  const cur = useStore(s => s.cur);
  if (!cur) return null;
  return <PlayerWindow key={cur.id} video={cur} />;
}

function PlayerWindow({ video }: { video: Video }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Y-translation to dock the mini player above the bottom tab bar.
  const MAX_Y = height - insets.bottom - TAB_BAR_HEIGHT - MINI_PLAYER_HEIGHT;
  const MIN_Y = 0;

  const translateY = useSharedValue(0); // Starts expanded
  const isMinimized = useSharedValue(false);

  const playerRef = useRef<any>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tcRef = useRef(0);

  const [wantPlay, setWantPlay] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(video.seconds || 0);

  // Resume point
  const pr = useStore.getState().prog.v[video.id];
  const startAt = pr && !pr.done && pr.p > 10 && (!pr.d || pr.p < pr.d * 0.95) ? Math.floor(pr.p) : 0;

  // Initialize native metadata when video loads
  useEffect(() => {
    ExpoPip.updateVideoMetadata(video.title, video.channelTitle, video.seconds || 0);
  }, [video.id, video.title, video.channelTitle, video.seconds]);

  useEffect(() => {
    const subPlayPause = DeviceEventEmitter.addListener('onPipPlayPause', () => {
      if (ended) {
        handleReplay();
      } else {
        setWantPlay(p => !p);
      }
    });

    const subStop = DeviceEventEmitter.addListener('onPipStop', () => {
      closePlayer();
    });

    return () => {
      subPlayPause.remove();
      subStop.remove();
    };
  }, [ended]);

  useEffect(() => {
    if (!playing) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
        useStore.getState().persistProg();
      }
      return;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    tickRef.current = setInterval(async () => {
      try {
        const t = (await playerRef.current?.getCurrentTime()) || 0;
        const d = (await playerRef.current?.getDuration()) || 0;
        const prog = useStore.getState().prog;
        const duration = d || video.seconds || totalDuration || 0;

        setCurrentTime(t);
        if (duration > 0 && duration !== totalDuration) {
          setTotalDuration(duration);
        }

        addWatch(prog, video.id, 1, duration);
        setPos(prog, video.id, t, duration);
        if (duration > 0 && t / duration >= 0.92 && !isDone(prog, video.id)) {
          markDone(prog, video.id, duration);
        }

        tcRef.current++;
        if (tcRef.current % 5 === 0) useStore.getState().persistProg();

        // Sync position smoothly to native MediaSession for accurate lockscreen/status bar progress
        ExpoPip.syncPlaybackPosition(t, duration, true);
      } catch { /* player not ready */ }
    }, 1000);

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [playing, video, totalDuration]);

  useEffect(() => {
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      useStore.getState().commitProg();
      ExpoPip.stopPlayback();
    };
  }, []);

  const onChangeState = (state: string) => {
    if (__DEV__) console.log('[player state]', state);
    if (state === 'ended') {
      const prog = useStore.getState().prog;
      markDone(prog, video.id, video.seconds);
      useStore.getState().commitProg();
      setPlaying(false);
      setWantPlay(false);
      setEnded(true);
      setCurrentTime(totalDuration);
      // Cleanly dismiss notification and stop background service on video completion
      ExpoPip.stopPlayback();
      return;
    }
    if (state === 'playing') {
      setPlaying(true);
      setEnded(false);
      ExpoPip.updateVideoMetadata(video.title, video.channelTitle, video.seconds || 0);
      ExpoPip.setPlaybackState(true);
      return;
    }
    // Ignore transient states so we don't drop the background wakelock!
    if (state === 'buffering' || state === 'unstarted') {
      return;
    }
    setPlaying(false);
    if (state === 'paused') setWantPlay(false);
    ExpoPip.setPlaybackState(false);
  };

  const handleReplay = () => {
    playerRef.current?.seekTo(0, true);
    setCurrentTime(0);
    setEnded(false);
    setWantPlay(true);
    setPlaying(true);
    ExpoPip.setPlaybackState(true);
  };

  const handleSeekOffset = (secondsOffset: number) => {
    const newPos = Math.max(0, Math.min(totalDuration || 9999, currentTime + secondsOffset));
    playerRef.current?.seekTo(newPos, true);
    setCurrentTime(newPos);
  };

  const handleSeekToRatio = (ratio: number) => {
    if (totalDuration <= 0) return;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const targetSec = clampedRatio * totalDuration;
    playerRef.current?.seekTo(targetSec, true);
    setCurrentTime(targetSec);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: video.title,
        message: `${video.title}\nhttps://youtu.be/${video.id}`,
        url: `https://youtu.be/${video.id}`,
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const toggleWatched = () => {
    const prog = useStore.getState().prog;
    const done = isDone(prog, video.id);
    if (done) {
      const vRec = prog.v[video.id];
      if (vRec) vRec.done = 0;
      useStore.getState().commitProg();
      useStore.getState().toast('Marked unwatched');
    } else {
      markDone(prog, video.id, totalDuration || video.seconds);
      useStore.getState().commitProg();
      useStore.getState().toast('Marked watched');
    }
  };

  const closePlayer = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    ExpoPip.stopPlayback();
    useStore.getState().closePlayer();
  };

  const minimize = () => {
    isMinimized.value = true;
    translateY.value = withSpring(MAX_Y, { damping: 20, stiffness: 200, mass: 0.8 });
  };

  const expand = () => {
    isMinimized.value = false;
    translateY.value = withSpring(MIN_Y, { damping: 20, stiffness: 200, mass: 0.8 });
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const newY = isMinimized.value ? MAX_Y + e.translationY : e.translationY;
      translateY.value = Math.max(MIN_Y, Math.min(newY, MAX_Y));
    })
    .onEnd((e) => {
      const threshold = MAX_Y / 3;
      if (isMinimized.value) {
        if (e.translationY < -50 || e.velocityY < -500) runOnJS(expand)();
        else runOnJS(minimize)();
      } else {
        if (e.translationY > threshold || e.velocityY > 500) runOnJS(minimize)();
        else runOnJS(expand)();
      }
    });

  const animatedContainerStyle = useAnimatedStyle(() => {
    return { transform: [{ translateY: translateY.value }] };
  });

  const animatedExpandedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [MIN_Y, MAX_Y / 2], [1, 0], Extrapolation.CLAMP);
    return { opacity, pointerEvents: opacity > 0.5 ? 'auto' : 'none' };
  });

  const animatedMiniStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [MAX_Y / 2, MAX_Y], [0, 1], Extrapolation.CLAMP);
    return { opacity, pointerEvents: opacity > 0.5 ? 'auto' : 'none' };
  });

  const TARGET_WIDTH = 640;
  const TARGET_HEIGHT = 360;
  const scale = width / TARGET_WIDTH;
  const parentHeight = Math.round((width * 9) / 16);

  const progPct = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;
  const prog = useStore(s => s.prog);
  const done = isDone(prog, video.id);

  return (
    <View style={styles.rootWrapper} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Animated.View pointerEvents="box-none" style={[styles.container, animatedContainerStyle]}>

          {/* EXPANDED PLAYER CONTENT */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.expandedBg, animatedExpandedStyle]}>
            
            {/* Top Bar for Minimize & Close */}
            <View style={[styles.topControlsBar, { paddingTop: Math.max(insets.top, 12) }]}>
              <Pressable hitSlop={14} onPress={minimize} style={styles.topBtn}>
                <Ionicons name="chevron-down" size={24} color={colors.ink} />
              </Pressable>
              <Text style={styles.topBarTitle} numberOfLines={1}>Now Playing</Text>
              <Pressable hitSlop={14} onPress={closePlayer} style={styles.topBtn}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>

            {/* Video Container */}
            <View style={{ width, height: parentHeight, backgroundColor: '#000', overflow: 'hidden' }}>
              <View pointerEvents="none" style={{
                position: 'absolute',
                left: (width - TARGET_WIDTH) / 2,
                top: (parentHeight - TARGET_HEIGHT) / 2,
                width: TARGET_WIDTH,
                height: TARGET_HEIGHT,
                transform: [{ scale }]
              }}>
                <YoutubePlayer
                  ref={playerRef}
                  height={TARGET_HEIGHT}
                  width={TARGET_WIDTH}
                  play={wantPlay}
                  videoId={video.id}
                  onChangeState={onChangeState}
                  initialPlayerParams={{ rel: false, modestbranding: true, iv_load_policy: 3, start: startAt, controls: 0, fs: 0 }}
                  webViewProps={{
                    allowsInlineMediaPlayback: true,
                    mediaPlaybackRequiresUserAction: false,
                    androidLayerType: 'hardware',
                    injectedJavaScript: `
                      (function() {
                        try {
                          Object.defineProperty(document, 'hidden', { get: function() { return false; } });
                          Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; } });
                          window.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);
                          document.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);
                        } catch(e) {}
                      })();
                      true;
                    `,
                  }}
                />
              </View>

              <Pressable style={styles.videoOverlay} onPress={() => setWantPlay(!playing)}>
                {ended ? (
                  <Pressable style={styles.orb} onPress={handleReplay}>
                    <Ionicons name="refresh" size={32} color={colors.onAccent} />
                  </Pressable>
                ) : !playing ? (
                  <View style={styles.orb}>
                    <Ionicons name="play" size={36} color={colors.onAccent} style={{ marginLeft: 4 }} />
                  </View>
                ) : (
                  <View style={styles.transparentOverlay} />
                )}
              </Pressable>
            </View>

            {/* PROGRESS BAR & SEEK CONTROLLER */}
            <View style={styles.progressContainer}>
              <Pressable
                style={styles.progressBarTouch}
                onPress={(e) => {
                  const clickX = e.nativeEvent.locationX;
                  const barWidth = width - 36; // 18 padding on each side
                  handleSeekToRatio(clickX / barWidth);
                }}
              >
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progPct}%` }]} />
                </View>
                <View style={[styles.progressKnob, { left: `${Math.max(0, Math.min(97, progPct))}%` }]} />
              </Pressable>
              
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{fmtDur(Math.floor(currentTime)) || '0:00'}</Text>
                <Text style={styles.timeText}>{fmtDur(Math.floor(totalDuration)) || '--:--'}</Text>
              </View>
            </View>

            {/* CONTROLS & ACTION BUTTONS */}
            <View style={styles.controlsBar}>
              <Pressable style={styles.controlAction} onPress={handleReplay}>
                <Ionicons name="refresh" size={22} color={colors.ink} />
                <Text style={styles.controlLabel}>Restart</Text>
              </Pressable>

              <Pressable style={styles.controlAction} onPress={() => handleSeekOffset(-10)}>
                <Ionicons name="play-back" size={22} color={colors.ink} />
                <Text style={styles.controlLabel}>-10s</Text>
              </Pressable>

              <Pressable style={styles.playPauseBtn} onPress={() => setWantPlay(!playing)}>
                <Ionicons name={playing ? 'pause' : 'play'} size={28} color={colors.onAccent} style={!playing ? { marginLeft: 2 } : undefined} />
              </Pressable>

              <Pressable style={styles.controlAction} onPress={() => handleSeekOffset(10)}>
                <Ionicons name="play-forward" size={22} color={colors.ink} />
                <Text style={styles.controlLabel}>+10s</Text>
              </Pressable>

              <Pressable style={styles.controlAction} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={22} color={colors.ink} />
                <Text style={styles.controlLabel}>Share</Text>
              </Pressable>

              <Pressable style={styles.controlAction} onPress={toggleWatched}>
                <Ionicons name={done ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={done ? colors.good : colors.inkSoft} />
                <Text style={[styles.controlLabel, done && { color: colors.good }]}>{done ? 'Watched' : 'Done'}</Text>
              </Pressable>
            </View>

            {/* Video Details Info */}
            <View style={styles.info}>
              <Text style={styles.title}>{video.title}</Text>
              <Text style={styles.sub}>{video.channelTitle} · {ago(video.published)}</Text>
            </View>

          </Animated.View>

          {/* MINIMIZED PLAYER CONTENT */}
          <Animated.View style={[styles.miniPlayer, animatedMiniStyle]}>
            {/* Mini Player Progress Bar */}
            <View style={styles.miniProgBar}>
              <View style={[styles.miniProgFill, { width: `${progPct}%` }]} />
            </View>
            <TouchableWithoutFeedback onPress={expand}>
              <View style={styles.miniInner}>
                <View style={styles.miniTextCont}>
                  <Text style={styles.miniTitle} numberOfLines={1}>{video.title}</Text>
                  <Text style={styles.miniSub} numberOfLines={1}>{video.channelTitle}</Text>
                </View>
                <Pressable hitSlop={12} onPress={handleShare} style={styles.miniBtn}>
                  <Ionicons name="share-social-outline" size={21} color={colors.inkSoft} />
                </Pressable>
                <Pressable hitSlop={12} onPress={() => setWantPlay(!playing)} style={styles.miniBtn}>
                  <Ionicons name={playing ? 'pause' : 'play'} size={24} color={colors.ink} />
                </Pressable>
                <Pressable hitSlop={12} onPress={closePlayer} style={styles.miniBtn}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </Animated.View>

        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 },
  container: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },

  expandedBg: { backgroundColor: colors.bg, height: '100%' },

  topControlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: colors.bg,
  },
  topBtn: {
    padding: 6,
  },
  topBarTitle: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  transparentOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.01)' },
  orb: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },

  progressContainer: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
  },
  progressBarTouch: {
    height: 24,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 5,
    backgroundColor: colors.bg3,
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  progressKnob: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    top: 6,
    marginLeft: -4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timeText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  controlAction: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 3,
  },
  controlLabel: {
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  playPauseBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  info: { padding: 18 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 23, marginBottom: 6 },
  sub: { color: colors.inkSoft, fontSize: 13.5 },

  miniPlayer: { position: 'absolute', top: 0, left: 0, right: 0, height: MINI_PLAYER_HEIGHT, backgroundColor: colors.bg2, borderTopWidth: 1, borderTopColor: colors.line },
  miniProgBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: 'rgba(255,255,255,0.1)' },
  miniProgFill: { height: '100%', backgroundColor: colors.accent },
  miniInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  miniTextCont: { flex: 1, marginRight: 8 },
  miniTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '600' },
  miniSub: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  miniBtn: { padding: 6, marginHorizontal: 2 },
});
