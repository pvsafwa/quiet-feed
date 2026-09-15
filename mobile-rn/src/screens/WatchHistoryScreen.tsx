import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, watchHistory } from '../store';
import { VideoCard } from '../components/VideoCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export function WatchHistoryScreen() {
  const vid = useStore(s => s.vid);
  const selVideos = useStore(s => s.selVideos);
  const prog = useStore(s => s.prog);
  const progV = useStore(s => s.progV);

  const list = useMemo(() => watchHistory({ vid, selVideos, prog } as any), [vid, selVideos, prog, progV]);

  const insets = useSafeAreaInsets();
  const cur = useStore(s => s.cur);
  const bottomPad = insets.bottom + (cur ? 60 + 36 : 36);

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'Are you sure you want to clear your entire watch history?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => useStore.getState().clearWatchHistory() },
      ]
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}
      data={list}
      keyExtractor={(v) => v.id}
      initialNumToRender={8}
      maxToRenderPerBatch={5}
      windowSize={11}
      removeClippedSubviews={true}
      ListHeaderComponent={
        list.length > 0 ? (
          <View style={styles.headerRow}>
            <Text style={styles.headerCount}>{list.length} video{list.length === 1 ? '' : 's'}</Text>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearHistory} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={15} color={colors.accent} />
              <Text style={styles.clearBtnText}>Clear History</Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      renderItem={({ item }) => <VideoCard v={item} onPress={() => useStore.getState().openPlayer(item, list)} />}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  headerCount: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '500',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.line,
  },
  clearBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  emptyBody: { color: colors.inkSoft, fontSize: 13.5, textAlign: 'center', paddingHorizontal: 40 },
});

