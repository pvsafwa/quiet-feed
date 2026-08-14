import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, watchHistory } from '../store';
import { VideoCard } from '../components/VideoCard';
import { colors } from '../theme';

export function WatchHistoryScreen() {
  const vid = useStore(s => s.vid);
  const selVideos = useStore(s => s.selVideos);
  const prog = useStore(s => s.prog);
  const progV = useStore(s => s.progV);

  const list = useMemo(() => watchHistory({ vid, selVideos, prog } as any), [vid, selVideos, prog, progV]);

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
      renderItem={({ item }) => <VideoCard v={item} onPress={() => useStore.getState().openPlayer(item)} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={40} color={colors.accent} />
          <Text style={styles.emptyTitle}>No watch history</Text>
          <Text style={styles.emptyBody}>Videos you watch from your feed or tracked courses will appear here.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  emptyBody: { color: colors.inkSoft, fontSize: 13.5, textAlign: 'center', paddingHorizontal: 40 },
});
