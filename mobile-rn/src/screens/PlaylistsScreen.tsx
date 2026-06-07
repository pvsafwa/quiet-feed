import React, { useEffect, useMemo } from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore, plList, type Store } from '../store';
import { isDone } from '../lib/progress';
import { fmtTotal } from '../lib/format';
import { colors, radius } from '../theme';

export function PlaylistsScreen() {
  const navigation = useNavigation<any>();
  const items = useStore(s => s.pl.items);
  const filter = useStore(s => s.filter);
  const search = useStore(s => s.search);
  const busy = useStore(s => s.busy);
  const channels = useStore(s => s.channels);
  const plDur = useStore(s => s.plDur);
  const prog = useStore(s => s.prog);
  useStore(s => s.progV);
  const runPlaylists = useStore(s => s.runPlaylists);
  const compute = useStore(s => s.computePlaylistDurations);

  useEffect(() => { if (!useStore.getState().pl.loaded && channels.length) runPlaylists(true); }, [channels.length, runPlaylists]);

  const list = useMemo(() => plList({ pl: { items }, filter, search } as Store), [items, filter, search]);
  useEffect(() => { if (list.length) compute(list); }, [list, compute]);

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      data={list}
      keyExtractor={(p) => p.id}
      renderItem={({ item: p }) => {
        const m = prog.pl[p.id];
        const ids = m?.ids || [];
        const done = ids.filter(id => isDone(prog, id)).length;
        const pct = ids.length ? Math.round((done / ids.length) * 100) : 0;
        const dur = plDur[p.id];
        return (
          <Pressable style={styles.card} onPress={() => navigation.navigate('PlaylistDetail', { playlist: p })}>
            <Image source={{ uri: p.thumb }} style={styles.thumb} />
            <View style={styles.meta}>
              <Text style={styles.title} numberOfLines={2}>{p.title}</Text>
              <Text style={styles.sub}>{p.channelTitle} · {p.count} videos{dur ? ` · ${fmtTotal(dur)}` : ''}</Text>
              {ids.length > 0 && (
                <View style={styles.barWrap}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
              )}
              {ids.length > 0 && <Text style={styles.prog}>{done}/{ids.length} done · {pct}%</Text>}
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>{busy ? 'Loading…' : 'No playlists found.'}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, marginBottom: 16, backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  thumb: { width: 120, aspectRatio: 16 / 9, borderRadius: radius.sm, backgroundColor: colors.bg3 },
  meta: { flex: 1, justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 14.5, fontWeight: '600', lineHeight: 19 },
  sub: { color: colors.inkFaint, fontSize: 12.5, marginTop: 5 },
  barWrap: { height: 5, borderRadius: 3, backgroundColor: colors.bg3, overflow: 'hidden', marginTop: 9 },
  barFill: { height: '100%', backgroundColor: colors.accent },
  prog: { color: colors.inkFaint, fontSize: 11.5, marginTop: 5 },
  empty: { color: colors.inkSoft, textAlign: 'center', paddingVertical: 80, fontSize: 14 },
});
