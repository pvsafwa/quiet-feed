import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Video } from '../lib/types';
import { useStore } from '../store';
import { isDone, vpct } from '../lib/progress';
import { ago, views as fmtViews } from '../lib/format';
import { colors, radius } from '../theme';

export function VideoCard({ v, onPress }: { v: Video; onPress: () => void }) {
  useStore(s => s.progV); // re-render when progress commits
  const prog = useStore(s => s.prog);
  const lastSeen = useStore(s => s.lastSeen);
  const done = isDone(prog, v.id);
  const pct = vpct(prog, v.id);
  const isNew = lastSeen > 0 && new Date(v.published).getTime() > lastSeen;

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.thumbWrap}>
        <Image source={{ uri: v.thumb }} style={styles.thumb} />
        {v.dur ? <Text style={styles.dur}>{v.dur}</Text> : null}
        {done ? (
          <View style={styles.doneBadge}><Ionicons name="checkmark" size={14} color="#0c130d" /></View>
        ) : isNew ? (
          <Text style={styles.newBadge}>NEW</Text>
        ) : null}
        {pct > 0 ? <View style={styles.progBar}><View style={[styles.progFill, { width: `${pct}%` }]} /></View> : null}
      </View>
      <View style={styles.meta}>
        {v.channelThumb ? <Image source={{ uri: v.channelThumb }} style={styles.av} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{v.title}</Text>
          <Text style={styles.channel} numberOfLines={1}>{v.channelTitle}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {v.views != null ? fmtViews(v.views) + ' · ' : ''}{ago(v.published)}
            {done ? '  ·  watched' : pct > 0 ? `  ·  ${pct}%` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 22 },
  thumbWrap: { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line },
  thumb: { width: '100%', height: '100%' },
  dur: { position: 'absolute', right: 8, bottom: 8, color: colors.ink, fontSize: 12, fontWeight: '600', backgroundColor: 'rgba(10,8,6,0.86)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  doneBadge: { position: 'absolute', left: 8, top: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.good, alignItems: 'center', justifyContent: 'center' },
  newBadge: { position: 'absolute', left: 8, top: 8, color: colors.onAccent, backgroundColor: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  progBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  progFill: { height: '100%', backgroundColor: colors.accent },
  meta: { flexDirection: 'row', gap: 11, paddingTop: 11 },
  av: { width: 34, height: 34, borderRadius: 17, marginTop: 2 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  channel: { color: colors.inkSoft, fontSize: 12.5, marginTop: 4 },
  sub: { color: colors.inkFaint, fontSize: 12.5, marginTop: 2 },
});
