import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../store';
import { isDone } from '../lib/progress';
import { fmtTotal } from '../lib/format';
import { colors } from '../theme';

export function TrackedCoursesScreen() {
  const navigation = useNavigation<any>();
  const prog = useStore(s => s.prog);
  useStore(s => s.progV);

  const mon = Object.keys(prog.mon).map(id => {
    const meta = prog.mon[id], pl = prog.pl[id] || ({} as any);
    const ids: string[] = pl.ids || [];
    const done = ids.filter(x => isDone(prog, x)).length;
    const tot = ids.length || meta.count || 0;
    return { id, title: meta.title, channel: meta.channelTitle || pl.channel || '', channelId: meta.channelId || pl.channelId || '', total: pl.total || 0, done, tot, pct: tot ? Math.round((done / tot) * 100) : 0 };
  });

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={mon}
      keyExtractor={(m) => m.id}
      initialNumToRender={8}
      maxToRenderPerBatch={5}
      windowSize={11}
      removeClippedSubviews={true}
      renderItem={({ item: m }) => (
        <Pressable style={styles.course} onPress={() => navigation.navigate('PlaylistDetail', { playlist: { id: m.id, title: m.title, channelId: m.channelId, channelTitle: m.channel, count: m.tot, thumb: '' } })}>
          <View style={styles.courseTop}>
            <Text style={styles.courseName} numberOfLines={1}>{m.title}</Text>
            <Text style={styles.courseN}>{m.tot ? `${m.done}/${m.tot}` : '…'}</Text>
          </View>
          <View style={styles.barWrap}><View style={[styles.barFill, { width: `${m.pct}%` }]} /></View>
          <Text style={styles.courseSub}>{m.channel} · {m.pct}% · {fmtTotal(m.total) || '—'}</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.hint}>Star a playlist (or “Track course”) to follow it here.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  hint: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 40 },
  course: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  courseTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  courseName: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' },
  courseN: { color: colors.inkSoft, fontSize: 13 },
  barWrap: { height: 6, borderRadius: 4, backgroundColor: colors.bg3, overflow: 'hidden', marginTop: 10 },
  barFill: { height: '100%', backgroundColor: colors.accent },
  courseSub: { color: colors.inkFaint, fontSize: 12.5, marginTop: 8 },
});
