import React, { useEffect, useMemo } from 'react';
import { View, Text, FlatList, TextInput, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, feedItems, hasMoreVideos, type Store } from '../store';
import { VideoCard } from '../components/VideoCard';
import { colors, radius } from '../theme';

export function FeedScreen() {
  const navigation = useNavigation<any>();
  const vid = useStore(s => s.vid);
  const channels = useStore(s => s.channels);
  const filter = useStore(s => s.filter);
  const search = useStore(s => s.search);
  const hideShorts = useStore(s => s.hideShorts);
  const busy = useStore(s => s.busy);
  const setSearch = useStore(s => s.setSearch);
  const setHideShorts = useStore(s => s.setHideShorts);
  const runVideos = useStore(s => s.runVideos);

  useEffect(() => { if (!useStore.getState().vid.loaded && channels.length) runVideos(true); }, [channels.length, runVideos]);

  const list = useMemo(() => feedItems({ vid, filter, search, hideShorts } as Store), [vid, filter, search, hideShorts]);
  const more = useMemo(() => hasMoreVideos({ channels, filter, vid } as Store), [channels, filter, vid]);

  const header = (
    <View style={styles.toolbar}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          style={styles.input} placeholder="Search videos…" placeholderTextColor={colors.inkFaint}
          value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false}
        />
        {search ? <Pressable hitSlop={8} onPress={() => setSearch('')}><Ionicons name="close" size={16} color={colors.inkFaint} /></Pressable> : null}
      </View>
      <Pressable onPress={() => setHideShorts(!hideShorts)} style={[styles.toggle, hideShorts && styles.toggleOn]}>
        <View style={[styles.dot, hideShorts && styles.dotOn]} />
        <Text style={[styles.toggleText, hideShorts && styles.toggleTextOn]}>Shorts</Text>
      </Pressable>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      data={list}
      keyExtractor={(v) => v.id}
      initialNumToRender={8}
      maxToRenderPerBatch={5}
      windowSize={11}
      removeClippedSubviews={true}
      ListHeaderComponent={header}
      renderItem={({ item }) => <VideoCard v={item} onPress={() => useStore.getState().openPlayer(item)} />}
      refreshControl={<RefreshControl refreshing={busy && list.length > 0} onRefresh={() => runVideos(true)} tintColor={colors.accent} />}
      onEndReachedThreshold={0.6}
      onEndReached={() => { if (more && !busy) runVideos(false); }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="tv-outline" size={40} color={colors.accent} />
          <Text style={styles.emptyTitle}>{busy ? 'Loading…' : search || hideShorts ? 'Nothing matches' : 'No videos yet'}</Text>
          {!busy && <Text style={styles.emptyBody}>{search || hideShorts ? 'Try clearing the search or the Shorts filter.' : 'Pull down to refresh, or add channels.'}</Text>}
        </View>
      }
      ListFooterComponent={more && list.length > 0 ? <Text style={styles.more}>{busy ? 'Loading…' : 'Pull up to load more'}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingHorizontal: 12 },
  input: { flex: 1, color: colors.ink, fontSize: 14.5, paddingVertical: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, backgroundColor: colors.bg2 },
  toggleOn: { borderColor: colors.accent },
  toggleText: { color: colors.inkSoft, fontSize: 13, fontWeight: '600' },
  toggleTextOn: { color: colors.ink },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line2 },
  dotOn: { backgroundColor: colors.accent, borderColor: 'transparent' },
  empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  emptyBody: { color: colors.inkSoft, fontSize: 13.5, textAlign: 'center', paddingHorizontal: 40 },
  more: { color: colors.inkFaint, textAlign: 'center', paddingVertical: 18, fontSize: 13 },
});
