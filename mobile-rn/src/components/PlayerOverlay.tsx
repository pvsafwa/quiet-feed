import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, DeviceEventEmitter, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { Video } from '../lib/types';
import { useStore } from '../store';
import { addWatch, setPos, markDone, isDone } from '../lib/progress';
import { ago } from '../lib/format';
import { colors } from '../theme';
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

  // Resume point
  const pr = useStore.getState().prog.v[video.id];
  const startAt = pr && !pr.done && pr.p > 10 && (!pr.d || pr.p < pr.d * 0.95) ? Math.floor(pr.p) : 0;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onPipPlayPause', () => {
      if (ended) {
        playerRef.current?.seekTo(0, true);
        setEnded(false);
        setWantPlay(true);
      } else {
        setWantPlay(p => !p);
      }
    });
    return () => sub.remove();
  }, [ended]);

  useEffect(() => {
    if (!playing) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; useStore.getState().persistProg(); }
      return;
    }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    tickRef.current = setInterval(async () => {
      try {
        const t = (await playerRef.current?.getCurrentTime()) || 0;
        const d = (await playerRef.current?.getDuration()) || 0;
        const prog = useStore.getState().prog;
        addWatch(prog, video.id, 1, d || video.seconds);
        setPos(prog, video.id, t, d || video.seconds);
        if (d && t / d >= 0.92 && !isDone(prog, video.id)) markDone(prog, video.id, d);
        
        tcRef.current++;
        if (tcRef.current % 5 === 0) useStore.getState().persistProg();
        
        // Sync position natively for the Foreground Service Status Bar UI
        ExpoPip.syncPlaybackPosition(t, d || video.seconds, playing);
      } catch { /* player not ready */ }
    }, 1000);
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  }, [playing, video]);

  useEffect(() => () => { 
    useStore.getState().commitProg(); 
    ExpoPip.setPlaybackState(false);
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
      ExpoPip.setPlaybackState(false);
      return;
    }
    if (state === 'playing') { 
      setPlaying(true); 
      setEnded(false); 
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

  const closePlayer = () => {
    ExpoPip.setPlaybackState(false);
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

  return (
    <View style={styles.rootWrapper} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Animated.View pointerEvents="box-none" style={[styles.container, animatedContainerStyle]}>
          
          {/* EXPANDED PLAYER CONTENT */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.expandedBg, animatedExpandedStyle]}>
            <View style={{ width, height: parentHeight + insets.top, backgroundColor: '#000', overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ 
                position: 'absolute', 
                left: (width - TARGET_WIDTH) / 2, 
                top: insets.top + (parentHeight - TARGET_HEIGHT) / 2, 
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
                    <View style={styles.orb}>
                      <Ionicons name="refresh" size={32} color={colors.onAccent} />
                    </View>
                  ) : !playing ? (
                    <View style={styles.orb}>
                      <Ionicons name="play" size={36} color={colors.onAccent} style={{ marginLeft: 4 }} />
                    </View>
                  ) : (
                    <View style={styles.transparentOverlay} />
                  )}
              </Pressable>
            </View>

            <View style={styles.info}>
              <Text style={styles.title}>{video.title}</Text>
              <Text style={styles.sub}>{video.channelTitle} · {ago(video.published)}</Text>
            </View>
          </Animated.View>

          {/* MINIMIZED PLAYER CONTENT */}
          <Animated.View style={[styles.miniPlayer, animatedMiniStyle]}>
            <TouchableWithoutFeedback onPress={expand}>
              <View style={styles.miniInner}>
                <View style={styles.miniTextCont}>
                  <Text style={styles.miniTitle} numberOfLines={1}>{video.title}</Text>
                  <Text style={styles.miniSub} numberOfLines={1}>{video.channelTitle}</Text>
                </View>
                <Pressable hitSlop={16} onPress={() => setWantPlay(!playing)} style={styles.miniBtn}>
                  <Ionicons name={playing ? 'pause' : 'play'} size={26} color={colors.ink} />
                </Pressable>
                <Pressable hitSlop={16} onPress={closePlayer} style={styles.miniBtn}>
                  <Ionicons name="close" size={24} color={colors.ink} />
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
  
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  transparentOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.01)' },
  orb: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  
  info: { padding: 16 },
  title: { color: colors.ink, fontSize: 18, fontWeight: '700', lineHeight: 24, marginBottom: 6 },
  sub: { color: colors.inkSoft, fontSize: 14 },
  
  miniPlayer: { position: 'absolute', top: 0, left: 0, right: 0, height: MINI_PLAYER_HEIGHT, backgroundColor: colors.bg2, borderTopWidth: 1, borderTopColor: colors.line },
  miniInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  miniTextCont: { flex: 1, marginRight: 12 },
  miniTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  miniSub: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
  miniBtn: { paddingHorizontal: 8 },
});
