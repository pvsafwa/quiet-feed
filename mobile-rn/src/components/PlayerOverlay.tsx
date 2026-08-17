import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  DeviceEventEmitter,
  TouchableWithoutFeedback,
  Share,
  BackHandler,
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
const TAB_BAR_HEIGHT = 56;
const AUTO_PLAY_COUNTDOWN_SEC = 4;

export function PlayerOverlay() {
  const cur = useStore(s => s.cur);
  if (!cur) return null;
  return <PlayerWindow key={cur.id} video={cur} />;
}

function PlayerWindow({ video }: { video: Video }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const drawerOpen = useStore(s => s.drawerOpen);
  const isTabScreen = useStore(s => s.isTabScreen);
  const playerStartMinimized = useStore(s => s.playerStartMinimized);

  // Initial resume point and duration from progress store
  const pr = useStore.getState().prog.v[video.id];
  const startAt = pr && !pr.done && pr.p > 0 && (!pr.d || pr.p < pr.d * 0.95) ? Math.floor(pr.p) : 0;
  const initialDuration = video.seconds || (pr && pr.d) || 0;

  // Y-translation to dock the mini player above the bottom tab bar (or screen bottom on stack screens).
  const tabHeight = isTabScreen ? TAB_BAR_HEIGHT : 0;
  const MAX_Y = height - insets.bottom - tabHeight - MINI_PLAYER_HEIGHT;
  const MIN_Y = 0;

  const translateY = useSharedValue(playerStartMinimized ? MAX_Y : 0);
  const isMinimized = useSharedValue(playerStartMinimized);

  // Adapt docking position dynamically when navigating between tab screens and stack screens
  useEffect(() => {
    if (isMinimized.value || playerStartMinimized) {
      translateY.value = withSpring(MAX_Y, { damping: 20, stiffness: 200, mass: 0.8 });
    }
  }, [MAX_Y, playerStartMinimized]);

  const playerRef = useRef<any>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tcRef = useRef(0);

  const [wantPlay, setWantPlay] = useState(!playerStartMinimized);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(startAt);
  const [totalDuration, setTotalDuration] = useState(initialDuration);

  // Auto-play next video state
  const [autoPlayCountdown, setAutoPlayCountdown] = useState<number | null>(null);
  const [cancelledAutoPlay, setCancelledAutoPlay] = useState(false);

  // Queue context from store
  const playerQueue = useStore(s => s.playerQueue);
  const playerQueueIdx = useStore(s => s.playerQueueIdx);
  const hasNext = playerQueueIdx >= 0 && playerQueueIdx < playerQueue.length - 1;
  const hasPrev = playerQueueIdx > 0;
  const nextVideo = hasNext ? playerQueue[playerQueueIdx + 1] : null;

  // Landscape controls visibility
  const [showLandscapeControls, setShowLandscapeControls] = useState(true);

  // Handle Android hardware back press when in landscape mode
  useEffect(() => {
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isLandscape) {
        ExpoPip.setOrientationPortrait();
        return true;
      }
      return false;
    });
    return () => backSub.remove();
  }, [isLandscape]);

  // Auto-hide landscape controls
  const resetHideTimer = () => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (isLandscape && playing) {
      hideControlsTimer.current = setTimeout(() => {
        setShowLandscapeControls(false);
      }, 3500);
    }
  };

  useEffect(() => {
    if (isLandscape) {
      setShowLandscapeControls(true);
      resetHideTimer();
    }
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [isLandscape, playing]);

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

  // Clear auto play timer on unmount
  useEffect(() => {
    return () => {
      if (autoPlayTimer.current) {
        clearInterval(autoPlayTimer.current);
        autoPlayTimer.current = null;
      }
    };
  }, []);

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

        addWatch(prog, video, 1, duration);
        setPos(prog, video, t, duration);
        if (duration > 0 && t / duration >= 0.92 && !isDone(prog, video.id)) {
          markDone(prog, video, duration);
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
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      if (autoPlayTimer.current) {
        clearInterval(autoPlayTimer.current);
      }
      useStore.getState().commitProg();
      ExpoPip.stopPlayback();
      ExpoPip.setOrientationPortrait();
    };
  }, []);

  const handlePlayNext = () => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
    setAutoPlayCountdown(null);
    useStore.getState().playNext();
  };

  const handlePlayPrev = () => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
    setAutoPlayCountdown(null);
    useStore.getState().playPrev();
  };

  const handleCancelAutoPlay = () => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
    setAutoPlayCountdown(null);
    setCancelledAutoPlay(true);
  };

  const onChangeState = (state: string) => {
    if (__DEV__) console.log('[player state]', state);
    if (state === 'ended') {
      const prog = useStore.getState().prog;
      markDone(prog, video, video.seconds);
      useStore.getState().commitProg();
      setPlaying(false);
      setWantPlay(false);
      setEnded(true);
      setCurrentTime(totalDuration);
      ExpoPip.stopPlayback();

      // Check if continuous auto-play should trigger
      const currentQueue = useStore.getState().playerQueue;
      const currentIdx = useStore.getState().playerQueueIdx;
      const canPlayNext = currentIdx >= 0 && currentIdx < currentQueue.length - 1;

      if (canPlayNext && !cancelledAutoPlay) {
        let count = AUTO_PLAY_COUNTDOWN_SEC;
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
      return;
    }
    if (state === 'playing') {
      setPlaying(true);
      setEnded(false);
      setAutoPlayCountdown(null);
      ExpoPip.updateVideoMetadata(video.title, video.channelTitle, video.seconds || 0);
      ExpoPip.setPlaybackState(true);
      return;
    }
    if (state === 'buffering' || state === 'unstarted') {
      return;
    }
    setPlaying(false);
    if (state === 'paused') setWantPlay(false);
    ExpoPip.setPlaybackState(false);
  };

  const toggleFullscreen = () => {
    if (isLandscape) {
      ExpoPip.setOrientationPortrait();
    } else {
      ExpoPip.setOrientationLandscape();
    }
  };

  const handleReplay = () => {
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
    setAutoPlayCountdown(null);
    resetHideTimer();
    playerRef.current?.seekTo(0, true);
    setCurrentTime(0);
    setEnded(false);
    setWantPlay(true);
    setPlaying(true);
    ExpoPip.setPlaybackState(true);
  };

  const handleSeekOffset = (secondsOffset: number) => {
    resetHideTimer();
    const newPos = Math.max(0, Math.min(totalDuration || 9999, currentTime + secondsOffset));
    playerRef.current?.seekTo(newPos, true);
    setCurrentTime(newPos);
  };

  const handleSeekToRatio = (ratio: number) => {
    resetHideTimer();
    if (totalDuration <= 0) return;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const targetSec = clampedRatio * totalDuration;
    playerRef.current?.seekTo(targetSec, true);
    setCurrentTime(targetSec);
  };

  const handleShare = async () => {
    resetHideTimer();
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
    resetHideTimer();
    const prog = useStore.getState().prog;
    const done = isDone(prog, video.id);
    if (done) {
      const vRec = prog.v[video.id];
      if (vRec) vRec.done = 0;
      useStore.getState().commitProg();
      useStore.getState().toast('Marked unwatched');
    } else {
      markDone(prog, video, totalDuration || video.seconds);
      useStore.getState().commitProg();
      useStore.getState().toast('Marked watched');
    }
  };

  const closePlayer = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoPlayTimer.current) {
      clearInterval(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
    ExpoPip.stopPlayback();
    ExpoPip.setOrientationPortrait();
    useStore.getState().closePlayer();
  };

  const minimize = () => {
    if (isLandscape) {
      ExpoPip.setOrientationPortrait();
    }
    isMinimized.value = true;
    translateY.value = withSpring(MAX_Y, { damping: 20, stiffness: 200, mass: 0.8 });
  };

  const expand = () => {
    isMinimized.value = false;
    translateY.value = withSpring(MIN_Y, { damping: 20, stiffness: 200, mass: 0.8 });
  };

  const panGesture = Gesture.Pan()
    .enabled(!isLandscape)
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
    if (isLandscape) {
      return { transform: [{ translateY: 0 }] };
    }
    return { transform: [{ translateY: translateY.value }] };
  });

  const animatedExpandedStyle = useAnimatedStyle(() => {
    if (isLandscape) {
      return { opacity: 1, pointerEvents: 'auto' };
    }
    const opacity = interpolate(translateY.value, [MIN_Y, MAX_Y / 2], [1, 0], Extrapolation.CLAMP);
    return { opacity, pointerEvents: opacity > 0.5 ? 'auto' : 'none' };
  });

  const animatedMiniStyle = useAnimatedStyle(() => {
    if (isLandscape || drawerOpen) {
      return { opacity: 0, pointerEvents: 'none' };
    }
    const opacity = interpolate(translateY.value, [MAX_Y / 2, MAX_Y], [0, 1], Extrapolation.CLAMP);
    return { opacity, pointerEvents: opacity > 0.5 ? 'auto' : 'none' };
  });

  const TARGET_WIDTH = 640;
  const TARGET_HEIGHT = 360;
  
  // Dimensions calculation
  const parentWidth = width;
  const parentHeight = isLandscape ? height : Math.round((width * 9) / 16);
  const scale = isLandscape ? Math.max(width / TARGET_WIDTH, height / TARGET_HEIGHT) : width / TARGET_WIDTH;

  const progPct = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;
  const prog = useStore(s => s.prog);
  const done = isDone(prog, video.id);

  return (
    <View style={styles.rootWrapper} pointerEvents={drawerOpen ? 'none' : 'box-none'}>
      <GestureDetector gesture={panGesture}>
        <Animated.View pointerEvents="box-none" style={[styles.container, animatedContainerStyle]}>

          {/* EXPANDED / FULLSCREEN PLAYER CONTENT */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.expandedBg, animatedExpandedStyle]}>
            
            {/* Top Bar for Minimize & Close (Portrait only) */}
            {!isLandscape && (
              <View style={[styles.topControlsBar, { paddingTop: Math.max(insets.top, 12) }]}>
                <Pressable hitSlop={14} onPress={minimize} style={styles.topBtn}>
                  <Ionicons name="chevron-down" size={24} color={colors.ink} />
                </Pressable>
                <View style={styles.topBarTitleContainer}>
                  <Text style={styles.topBarTitle} numberOfLines={1}>Now Playing</Text>
                  {playerQueue.length > 1 && (
                    <Text style={styles.topBarQueueCount}>
                      {playerQueueIdx + 1} of {playerQueue.length}
                    </Text>
                  )}
                </View>
                <Pressable hitSlop={14} onPress={closePlayer} style={styles.topBtn}>
                  <Ionicons name="close" size={24} color={colors.ink} />
                </Pressable>
              </View>
            )}

            {/* Video Container */}
            <View style={{ width: parentWidth, height: parentHeight, backgroundColor: '#000', overflow: 'hidden' }}>
              <View pointerEvents="none" style={{
                position: 'absolute',
                left: (parentWidth - TARGET_WIDTH) / 2,
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

              {/* AUTO-PLAY "UP NEXT" COUNTDOWN OVERLAY */}
              {ended && autoPlayCountdown !== null && nextVideo && (
                <View style={styles.autoPlayOverlay}>
                  <View style={styles.autoPlayCard}>
                    <Text style={styles.autoPlayHeader}>Up next in {autoPlayCountdown}s</Text>
                    <Text style={styles.autoPlayTitle} numberOfLines={2}>{nextVideo.title}</Text>
                    <Text style={styles.autoPlaySub} numberOfLines={1}>{nextVideo.channelTitle}</Text>
                    
                    <View style={styles.autoPlayActions}>
                      <Pressable style={styles.autoPlayCancelBtn} onPress={handleCancelAutoPlay}>
                        <Text style={styles.autoPlayCancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable style={styles.autoPlayNowBtn} onPress={handlePlayNext}>
                        <Ionicons name="play" size={16} color={colors.onAccent} />
                        <Text style={styles.autoPlayNowText}>Play Now</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}

              {/* LANDSCAPE IMMERSIVE OVERLAY HUD */}
              {isLandscape ? (
                <Pressable
                  style={styles.landscapeTouchArea}
                  onPress={() => {
                    setShowLandscapeControls(v => !v);
                    resetHideTimer();
                  }}
                >
                  {showLandscapeControls && (
                    <View style={styles.landscapeHudContainer}>
                      {/* Top Bar in Landscape */}
                      <View style={[styles.landscapeTopBar, { paddingTop: Math.max(insets.top, 10), paddingHorizontal: Math.max(insets.left, 16) }]}>
                        <Pressable hitSlop={12} onPress={toggleFullscreen} style={styles.hudIconBtn}>
                          <Ionicons name="arrow-back" size={24} color="#fff" />
                        </Pressable>
                        <View style={styles.landscapeTitleWrap}>
                          <Text style={styles.landscapeVideoTitle} numberOfLines={1}>{video.title}</Text>
                          <Text style={styles.landscapeChannelTitle} numberOfLines={1}>
                            {video.channelTitle}
                            {playerQueue.length > 1 ? ` · ${playerQueueIdx + 1}/${playerQueue.length}` : ''}
                          </Text>
                        </View>
                        <View style={styles.landscapeTopRight}>
                          <Pressable hitSlop={10} onPress={handleShare} style={styles.hudIconBtn}>
                            <Ionicons name="share-social-outline" size={22} color="#fff" />
                          </Pressable>
                          <Pressable hitSlop={10} onPress={closePlayer} style={styles.hudIconBtn}>
                            <Ionicons name="close" size={24} color="#fff" />
                          </Pressable>
                        </View>
                      </View>

                      {/* Center Playback Controls in Landscape */}
                      <View style={styles.landscapeCenterControls}>
                        {hasPrev && (
                          <Pressable hitSlop={14} style={styles.landscapeCenterBtn} onPress={handlePlayPrev}>
                            <Ionicons name="play-skip-back" size={26} color="#fff" />
                            <Text style={styles.landscapeCenterLabel}>Prev</Text>
                          </Pressable>
                        )}

                        <Pressable hitSlop={14} style={styles.landscapeCenterBtn} onPress={() => handleSeekOffset(-10)}>
                          <Ionicons name="play-back" size={30} color="#fff" />
                          <Text style={styles.landscapeCenterLabel}>-10s</Text>
                        </Pressable>

                        {ended && autoPlayCountdown === null ? (
                          <Pressable style={styles.landscapePlayOrb} onPress={handleReplay}>
                            <Ionicons name="refresh" size={38} color="#fff" />
                          </Pressable>
                        ) : (
                          <Pressable style={styles.landscapePlayOrb} onPress={() => { setWantPlay(!playing); resetHideTimer(); }}>
                            <Ionicons name={playing ? 'pause' : 'play'} size={40} color="#fff" style={!playing ? { marginLeft: 3 } : undefined} />
                          </Pressable>
                        )}

                        <Pressable hitSlop={14} style={styles.landscapeCenterBtn} onPress={() => handleSeekOffset(10)}>
                          <Ionicons name="play-forward" size={30} color="#fff" />
                          <Text style={styles.landscapeCenterLabel}>+10s</Text>
                        </Pressable>

                        {hasNext && (
                          <Pressable hitSlop={14} style={styles.landscapeCenterBtn} onPress={handlePlayNext}>
                            <Ionicons name="play-skip-forward" size={26} color="#fff" />
                            <Text style={styles.landscapeCenterLabel}>Next</Text>
                          </Pressable>
                        )}
                      </View>

                      {/* Bottom Bar in Landscape */}
                      <View style={[styles.landscapeBottomBar, { paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: Math.max(insets.left, 18) }]}>
                        <Text style={styles.landscapeTimeText}>{fmtDur(Math.floor(currentTime)) || '0:00'}</Text>
                        <Pressable
                          style={styles.landscapeProgressTouch}
                          onPress={(e) => {
                            const clickX = e.nativeEvent.locationX;
                            const barWidth = width - 160;
                            handleSeekToRatio(clickX / barWidth);
                          }}
                        >
                          <View style={styles.landscapeProgressTrack}>
                            <View style={[styles.progressFill, { width: `${progPct}%` }]} />
                          </View>
                          <View style={[styles.progressKnob, { left: `${Math.max(0, Math.min(98, progPct))}%` }]} />
                        </Pressable>
                        <Text style={styles.landscapeTimeText}>{fmtDur(Math.floor(totalDuration)) || '--:--'}</Text>
                        <Pressable hitSlop={12} onPress={toggleFullscreen} style={styles.hudIconBtn}>
                          <Ionicons name="contract" size={22} color="#fff" />
                        </Pressable>
                      </View>
                    </View>
                  )}
                </Pressable>
              ) : (
                /* PORTRAIT VIDEO OVERLAY */
                <Pressable style={styles.videoOverlay} onPress={() => setWantPlay(!playing)}>
                  {ended && autoPlayCountdown === null ? (
                    <Pressable style={styles.orb} onPress={handleReplay}>
                      <Ionicons name="refresh" size={32} color={colors.onAccent} />
                    </Pressable>
                  ) : !playing && autoPlayCountdown === null ? (
                    <View style={styles.orb}>
                      <Ionicons name="play" size={36} color={colors.onAccent} style={{ marginLeft: 4 }} />
                    </View>
                  ) : (
                    <View style={styles.transparentOverlay} />
                  )}
                </Pressable>
              )}
            </View>

            {/* PORTRAIT CONTROLS & INFO */}
            {!isLandscape && (
              <>
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
                  {hasPrev ? (
                    <Pressable style={styles.controlAction} onPress={handlePlayPrev}>
                      <Ionicons name="play-skip-back" size={20} color={colors.ink} />
                      <Text style={styles.controlLabel}>Prev</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.controlAction} onPress={handleReplay}>
                      <Ionicons name="refresh" size={20} color={colors.ink} />
                      <Text style={styles.controlLabel}>Restart</Text>
                    </Pressable>
                  )}

                  <Pressable style={styles.controlAction} onPress={() => handleSeekOffset(-10)}>
                    <Ionicons name="play-back" size={20} color={colors.ink} />
                    <Text style={styles.controlLabel}>-10s</Text>
                  </Pressable>

                  <Pressable style={styles.playPauseBtn} onPress={() => setWantPlay(!playing)}>
                    <Ionicons name={playing ? 'pause' : 'play'} size={26} color={colors.onAccent} style={!playing ? { marginLeft: 2 } : undefined} />
                  </Pressable>

                  <Pressable style={styles.controlAction} onPress={() => handleSeekOffset(10)}>
                    <Ionicons name="play-forward" size={20} color={colors.ink} />
                    <Text style={styles.controlLabel}>+10s</Text>
                  </Pressable>

                  {hasNext && (
                    <Pressable style={styles.controlAction} onPress={handlePlayNext}>
                      <Ionicons name="play-skip-forward" size={20} color={colors.accent} />
                      <Text style={[styles.controlLabel, { color: colors.accent, fontWeight: '700' }]}>Next</Text>
                    </Pressable>
                  )}

                  {/* Fullscreen Landscape Toggle */}
                  <Pressable style={styles.controlAction} onPress={toggleFullscreen}>
                    <Ionicons name="expand" size={20} color={colors.ink} />
                    <Text style={styles.controlLabel}>Full</Text>
                  </Pressable>

                  <Pressable style={styles.controlAction} onPress={handleShare}>
                    <Ionicons name="share-social-outline" size={20} color={colors.ink} />
                    <Text style={styles.controlLabel}>Share</Text>
                  </Pressable>

                  <Pressable style={styles.controlAction} onPress={toggleWatched}>
                    <Ionicons name={done ? 'checkmark-circle' : 'checkmark-circle-outline'} size={20} color={done ? colors.good : colors.inkSoft} />
                    <Text style={[styles.controlLabel, done && { color: colors.good }]}>{done ? 'Watched' : 'Done'}</Text>
                  </Pressable>
                </View>

                {/* Video Details Info */}
                <View style={styles.info}>
                  <Text style={styles.title}>{video.title}</Text>
                  <Text style={styles.sub}>{video.channelTitle} · {ago(video.published)}</Text>
                  
                  {hasNext && nextVideo && (
                    <Pressable style={styles.upNextBanner} onPress={handlePlayNext}>
                      <View style={styles.upNextBannerLeft}>
                        <Ionicons name="play-forward-circle" size={22} color={colors.accent} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.upNextBannerLabel}>NEXT IN QUEUE</Text>
                          <Text style={styles.upNextBannerTitle} numberOfLines={1}>{nextVideo.title}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
                    </Pressable>
                  )}
                </View>
              </>
            )}

          </Animated.View>

          {/* MINIMIZED PLAYER CONTENT */}
          <Animated.View style={[styles.miniPlayer, animatedMiniStyle]}>
            {/* Mini Player Progress Bar */}
            <View style={styles.miniProgBar}>
              <View style={[styles.miniProgFill, { width: `${progPct}%` }]} />
            </View>
            <TouchableWithoutFeedback onPress={expand}>
              <View style={styles.miniInner}>
                {video.thumb ? (
                  <Image source={{ uri: video.thumb }} style={styles.miniThumb} />
                ) : null}
                <View style={styles.miniTextCont}>
                  <Text style={styles.miniTitle} numberOfLines={1}>{video.title}</Text>
                  <Text style={styles.miniSub} numberOfLines={1}>{video.channelTitle}</Text>
                </View>
                {hasNext && (
                  <Pressable hitSlop={12} onPress={handlePlayNext} style={styles.miniBtn}>
                    <Ionicons name="play-skip-forward" size={20} color={colors.accent} />
                  </Pressable>
                )}
                <Pressable hitSlop={12} onPress={expand} style={styles.miniBtn}>
                  <Ionicons name="expand" size={20} color={colors.inkSoft} />
                </Pressable>
                <Pressable hitSlop={12} onPress={() => setWantPlay(!playing)} style={styles.miniBtn}>
                  <Ionicons name={playing ? 'pause' : 'play'} size={24} color={colors.ink} />
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
  topBarTitleContainer: {
    alignItems: 'center',
  },
  topBarTitle: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topBarQueueCount: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },

  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  transparentOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.01)' },
  orb: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },

  /* AUTO-PLAY OVERLAY */
  autoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  autoPlayCard: {
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
  },
  autoPlayHeader: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  autoPlayTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },
  autoPlaySub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  autoPlayActions: {
    flexDirection: 'row',
    gap: 12,
  },
  autoPlayCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  autoPlayCancelText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  autoPlayNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  autoPlayNowText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },

  /* LANDSCAPE IMMERSIVE OVERLAY STYLES */
  landscapeTouchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  landscapeHudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'space-between',
  },
  landscapeTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  landscapeTitleWrap: {
    flex: 1,
  },
  landscapeVideoTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  landscapeChannelTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 1,
  },
  landscapeTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hudIconBtn: {
    padding: 8,
  },

  landscapeCenterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  landscapeCenterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 10,
  },
  landscapeCenterLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  landscapePlayOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  landscapeBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  landscapeTimeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  landscapeProgressTouch: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  landscapeProgressTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2.5,
    overflow: 'hidden',
  },

  /* PORTRAIT CONTROLS */
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
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginHorizontal: 12,
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
    paddingHorizontal: 4,
    gap: 2,
    minWidth: 38,
  },
  controlLabel: {
    color: colors.inkSoft,
    fontSize: 10.5,
    fontWeight: '600',
  },
  playPauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  info: { padding: 18 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 23, marginBottom: 6 },
  sub: { color: colors.inkSoft, fontSize: 13.5 },

  upNextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },
  upNextBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  upNextBannerLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  upNextBannerTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },

  miniPlayer: { position: 'absolute', top: 0, left: 0, right: 0, height: MINI_PLAYER_HEIGHT, backgroundColor: colors.bg2, borderTopWidth: 1, borderTopColor: colors.line },
  miniProgBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: 'rgba(255,255,255,0.1)' },
  miniProgFill: { height: '100%', backgroundColor: colors.accent },
  miniInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  miniThumb: { width: 44, height: 32, borderRadius: 4, backgroundColor: colors.bg3, marginRight: 10 },
  miniTextCont: { flex: 1, marginRight: 8 },
  miniTitle: { color: colors.ink, fontSize: 13.5, fontWeight: '600' },
  miniSub: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  miniBtn: { padding: 6, marginHorizontal: 1 },
});
