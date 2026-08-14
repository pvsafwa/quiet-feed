import React, { useEffect, useMemo } from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useStore, plList, userActiveChannels, type Store } from '../store';
import { isDone } from '../lib/progress';
import { fmtTotal } from '../lib/format';
import { colors, radius } from '../theme';

export function PlaylistsScreen() {
  const navigation = useNavigation<any>();
  const items = useStore(s => s.pl.items);
  const filter = useStore(s => s.filter);
  const setFilter = useStore(s => s.setFilter);
  const search = useStore(s => s.search);
  const busy = useStore(s => s.busy);
  const channels = useStore(s => s.channels);
  const selectedChannelIds = useStore(s => s.selectedChannelIds);
  const activeChannels = useStore(useShallow(userActiveChannels));
  const plDur = useStore(s => s.plDur);
  const prog = useStore(s => s.prog);
  useStore(s => s.progV);
  const runPlaylists = useStore(s => s.runPlaylists);
  const compute = useStore(s => s.computePlaylistDurations);

  const selectedChannel = useMemo(() => {
    return channels.find(c => c.id === filter);
  }, [channels, filter]);

  useEffect(() => {
    if (filter !== 'all' && selectedChannel) {
      runPlaylists(true);
    }
  }, [filter]);

  const list = useMemo(() => {
    if (filter === 'all') return [];
    return plList({ pl: { items }, filter, search, channels, selectedChannelIds } as Store);
  }, [items, filter, search, channels, selectedChannelIds]);

  useEffect(() => {
    if (list.length) compute(list);
  }, [list, compute]);

  // When no channel is selected, prompt user to select a channel
  if (filter === 'all') {
    return (
      <ScrollView style={styles.pickerContainer} contentContainerStyle={styles.pickerContent}>
        <View style={styles.promptHeader}>
          <View style={styles.promptIconCircle}>
            <Ionicons name="folder-open-outline" size={32} color={colors.accent} />
          </View>
          <Text style={styles.promptTitle}>Select a Channel</Text>
          <Text style={styles.promptSub}>
            Choose a channel to explore its playlists and structured courses.
          </Text>
        </View>

        <View style={styles.channelGrid}>
          {activeChannels.map(c => (
            <Pressable key={c.id} onPress={() => setFilter(c.id)} style={styles.channelTile}>
              {c.thumb ? <Image source={{ uri: c.thumb }} style={styles.channelAv} /> : <View style={[styles.channelAv, { backgroundColor: colors.bg3 }]} />}
              <Text style={styles.channelName} numberOfLines={2}>{c.title}</Text>
              {c.language ? (
                <View style={styles.langPill}>
                  <Text style={styles.langPillText}>{c.language}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>

        {activeChannels.length === 0 && (
          <Text style={styles.empty}>No channels selected in your feed. Select channels in Settings.</Text>
        )}

        <Pressable
          style={styles.drawerBtn}
          onPress={() => navigation.getParent('LeftDrawer')?.dispatch(DrawerActions.openDrawer())}
        >
          <Ionicons name="menu" size={18} color={colors.ink} />
          <Text style={styles.drawerBtnText}>Open Channel Menu</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Active Channel Header */}
      <View style={styles.channelBar}>
        {selectedChannel?.thumb ? (
          <Image source={{ uri: selectedChannel.thumb }} style={styles.barAv} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.barTitle} numberOfLines={1}>{selectedChannel?.title || 'Channel'}</Text>
          <Text style={styles.barSub}>Playlists & Courses</Text>
        </View>
        <Pressable style={styles.changeBtn} onPress={() => setFilter('all')}>
          <Text style={styles.changeBtnText}>Change</Text>
        </Pressable>
      </View>

      <FlatList
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={list}
        keyExtractor={(p) => p.id}
        initialNumToRender={8}
        maxToRenderPerBatch={5}
        windowSize={11}
        removeClippedSubviews={true}
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
        ListEmptyComponent={<Text style={styles.empty}>{busy ? 'Loading playlists…' : 'No playlists found for this channel.'}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pickerContainer: { flex: 1, backgroundColor: colors.bg },
  pickerContent: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  promptHeader: { alignItems: 'center', marginBottom: 24, marginTop: 12 },
  promptIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  promptTitle: { color: colors.ink, fontSize: 20, fontWeight: '700', marginBottom: 6 },
  promptSub: { color: colors.inkSoft, fontSize: 13.5, textAlign: 'center', maxWidth: 300, lineHeight: 19 },

  channelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%', justifyContent: 'center' },
  channelTile: {
    width: '47%',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
  },
  channelAv: { width: 50, height: 50, borderRadius: 25, marginBottom: 10 },
  channelName: { color: colors.ink, fontSize: 13.5, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  langPill: { marginTop: 8, backgroundColor: colors.bg3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  langPillText: { color: colors.inkSoft, fontSize: 11, fontWeight: '600' },

  drawerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginTop: 24,
  },
  drawerBtnText: { color: colors.ink, fontSize: 14, fontWeight: '600' },

  channelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  barAv: { width: 36, height: 36, borderRadius: 18 },
  barTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  barSub: { color: colors.inkSoft, fontSize: 12, marginTop: 1 },
  changeBtn: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.bg },
  changeBtnText: { color: colors.ink, fontSize: 12.5, fontWeight: '600' },

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
