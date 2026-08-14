import React, { useEffect } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { PlaylistMeta } from '../lib/types';
import { useStore } from '../store';
import { isDone, isMon } from '../lib/progress';
import { VideoCard } from '../components/VideoCard';
import { colors, radius } from '../theme';

export function PlaylistDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const playlist: PlaylistMeta = route.params.playlist;

  const openPlaylist = useStore(s => s.openPlaylist);
  const sel = useStore(s => s.sel);
  const selVideos = useStore(s => s.selVideos);
  const busy = useStore(s => s.busy);
  const prog = useStore(s => s.prog);
  useStore(s => s.progV);
  const toggle = useStore(s => s.toggleMonitor);
  const markAllWatched = useStore(s => s.markAllWatched);

  useEffect(() => { openPlaylist(playlist); }, [playlist.id, openPlaylist]);

  const here = sel?.id === playlist.id ? selVideos : [];
  const doneN = here.filter(v => isDone(prog, v.id)).length;
  const pct = here.length ? Math.round((doneN / here.length) * 100) : 0;
  const mon = isMon(prog, playlist.id);
  const allDone = here.length > 0 && doneN === here.length;

  const header = (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.title}>{playlist.title}</Text>
      <Text style={styles.sub}>{playlist.channelTitle} · {here.length || playlist.count} videos · oldest first</Text>
      {here.length > 0 && (
        <>
          <View style={styles.barWrap}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
          <Text style={styles.prog}>{doneN} of {here.length} completed · {pct}%</Text>
        </>
      )}
      <View style={styles.actions}>
        {here.length > 0 && !allDone && (
          <Pressable style={styles.btn} onPress={() => markAllWatched(here)}>
            <Ionicons name="checkmark-done" size={15} color={colors.ink} /><Text style={styles.btnText}>Mark all watched</Text>
          </Pressable>
        )}
        <Pressable style={[styles.btn, mon && styles.btnOn]} onPress={() => toggle({ id: playlist.id, title: playlist.title, channelTitle: playlist.channelTitle, channelId: playlist.channelId, count: playlist.count })}>
          <Ionicons name={mon ? 'star' : 'star-outline'} size={15} color={mon ? colors.onAccent : colors.ink} /><Text style={[styles.btnText, mon && { color: colors.onAccent }]}>{mon ? 'Tracking' : 'Track course'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      data={here}
      keyExtractor={(v) => v.id}
      initialNumToRender={8}
      maxToRenderPerBatch={5}
      windowSize={11}
      removeClippedSubviews={true}
      ListHeaderComponent={header}
      renderItem={({ item }) => <VideoCard v={item} onPress={() => useStore.getState().openPlayer(item)} />}
      ListEmptyComponent={<Text style={styles.empty}>{busy ? 'Loading…' : 'No playable videos here.'}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 20, fontWeight: '600', lineHeight: 26 },
  sub: { color: colors.inkFaint, fontSize: 13, marginTop: 6 },
  barWrap: { height: 7, borderRadius: 4, backgroundColor: colors.bg3, overflow: 'hidden', marginTop: 12 },
  barFill: { height: '100%', backgroundColor: colors.accent },
  prog: { color: colors.inkSoft, fontSize: 12.5, marginTop: 7 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.bg2 },
  btnOn: { backgroundColor: colors.accent, borderColor: 'transparent' },
  btnText: { color: colors.ink, fontSize: 13.5, fontWeight: '600' },
  empty: { color: colors.inkSoft, textAlign: 'center', paddingVertical: 60, fontSize: 14 },
});
