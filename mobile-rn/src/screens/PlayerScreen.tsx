import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import type { Video } from '../lib/types';
import { useStore } from '../store';
import { addWatch, setPos, markDone, isDone } from '../lib/progress';
import { ago } from '../lib/format';
import { colors, radius } from '../theme';

export function PlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const video: Video = route.params.video;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const playerRef = useRef<any>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tcRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [videoOff, setVideoOff] = useState(true); // audio-first by default
  const [ended, setEnded] = useState(false);

  // Resume point (skip if near the end / already done).
  const pr = useStore.getState().prog.v[video.id];
  const startAt = pr && !pr.done && pr.p > 10 && (!pr.d || pr.p < pr.d * 0.95) ? Math.floor(pr.p) : 0;

  // 1s tracking tick — watch time, resume position, ≥92% completion (ported from web).
  useEffect(() => {
    if (!playing) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; useStore.getState().persistProg(); }
      return;
    }
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
      } catch { /* player not ready */ }
    }, 1000);
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  }, [playing, video]);

  // Persist on leave.
  useEffect(() => () => { useStore.getState().commitProg(); }, []);

  const onChangeState = (state: string) => {
    if (state === 'ended') {
      const prog = useStore.getState().prog;
      markDone(prog, video.id, video.seconds);
      useStore.getState().commitProg();
      setPlaying(false);
      setEnded(true);
    } else {
      if (state === 'playing') setEnded(false);
      setPlaying(state === 'playing');
    }
  };

  const playerH = Math.round(width * 9 / 16);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.topbar}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}><Ionicons name="chevron-down" size={26} color={colors.ink} /></Pressable>
        <Pressable hitSlop={10} onPress={() => setVideoOff(o => !o)}>
          <Ionicons name={videoOff ? 'videocam' : 'videocam-off'} size={22} color={colors.ink} />
        </Pressable>
      </View>

      <View style={{ width, height: playerH, backgroundColor: '#000' }}>
        <YoutubePlayer
          ref={playerRef}
          height={playerH}
          width={width}
          play={playing}
          videoId={video.id}
          onChangeState={onChangeState}
          initialPlayerParams={{ rel: false, iv_load_policy: 3, start: startAt }}
        />

        {videoOff && !ended && (
          <Pressable style={styles.cover} onPress={() => setPlaying(p => !p)}>
            <View style={styles.orb}><Ionicons name={playing ? 'pause' : 'play'} size={30} color={colors.onAccent} /></View>
            <View style={styles.bars}>
              {[14, 26, 38, 30, 20, 34, 22].map((h, i) => <View key={i} style={[styles.bar, { height: playing ? h : 8 }]} />)}
            </View>
            <Text style={styles.coverTitle} numberOfLines={2}>{video.title}</Text>
            <Text style={styles.coverSub}>{video.channelTitle} · audio only · tap to {playing ? 'pause' : 'play'}</Text>
          </Pressable>
        )}

        {ended && (
          <View style={styles.cover}>
            <Text style={styles.endTitle}>Finished</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <Pressable style={styles.btnPrimary} onPress={() => { playerRef.current?.seekTo(0, true); setEnded(false); setPlaying(true); }}>
                <Ionicons name="play" size={16} color={colors.onAccent} /><Text style={styles.btnPrimaryText}>Replay</Text>
              </Pressable>
              <Pressable style={styles.btn} onPress={() => navigation.goBack()}><Text style={styles.btnText}>Back to feed</Text></Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.sub}>{video.channelTitle} · {ago(video.published)}</Text>
        <Text style={styles.hint}>Tap the camera icon (top right) to show the video.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  topbar: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg3 },
  orb: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 40, marginBottom: 14 },
  bar: { width: 6, borderRadius: 3, backgroundColor: colors.accent2 },
  coverTitle: { color: colors.ink, fontSize: 16, fontWeight: '500', textAlign: 'center' },
  coverSub: { color: colors.inkSoft, fontSize: 12.5, marginTop: 6, textAlign: 'center' },
  endTitle: { color: colors.ink, fontSize: 20, fontWeight: '500' },
  info: { padding: 18 },
  title: { color: colors.ink, fontSize: 18, fontWeight: '600', lineHeight: 24 },
  sub: { color: colors.inkSoft, fontSize: 13.5, marginTop: 8 },
  hint: { color: colors.inkFaint, fontSize: 12.5, marginTop: 14 },
  btn: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.bg2 },
  btnText: { color: colors.ink, fontWeight: '600' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.onAccent, fontWeight: '700' },
});
