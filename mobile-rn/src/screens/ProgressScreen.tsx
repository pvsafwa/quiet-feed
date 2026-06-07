import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../store';
import { isDone, totals, streaks, lastDays } from '../lib/progress';
import { fmtSpan, fmtTotal } from '../lib/format';
import { colors, radius } from '../theme';

export function ProgressScreen() {
  const navigation = useNavigation<any>();
  const prog = useStore(s => s.prog);
  useStore(s => s.progV);

  const t = totals(prog);
  const st = streaks(prog);
  const days = lastDays(prog, 14);
  const maxSec = Math.max(60, ...days.map(d => d.sec));

  const cards = [
    { v: fmtSpan(t.spent), l: 'Time spent' },
    { v: fmtSpan(t.done), l: `Completed (${t.doneN})` },
    { v: String(t.started), l: 'In progress' },
    { v: `${st.cur} 🔥`, l: `Streak · best ${st.max}` },
  ];

  const mon = Object.keys(prog.mon).map(id => {
    const meta = prog.mon[id], pl = prog.pl[id] || ({} as any);
    const ids: string[] = pl.ids || [];
    const done = ids.filter(x => isDone(prog, x)).length;
    const tot = ids.length || meta.count || 0;
    return { id, title: meta.title, channel: meta.channelTitle || pl.channel || '', channelId: meta.channelId || pl.channelId || '', total: pl.total || 0, done, tot, pct: tot ? Math.round((done / tot) * 100) : 0 };
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={styles.statGrid}>
        {cards.map((c, i) => (
          <View key={i} style={styles.stat}>
            <Text style={styles.statVal}>{c.v}</Text>
            <Text style={styles.statLabel}>{c.l}</Text>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelHead}>Last 14 days</Text>
        <View style={styles.week}>
          {days.map(d => (
            <View key={d.key} style={styles.col}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${d.sec > 0 ? Math.max(6, Math.round((d.sec / maxSec) * 100)) : 0}%` }]} />
              </View>
              <Text style={styles.colLabel}>{d.key.slice(8)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelHead}>Tracked courses</Text>
        {mon.length === 0 ? (
          <Text style={styles.hint}>Star a playlist (or “Track course”) to follow it here.</Text>
        ) : mon.map(m => (
          <Pressable key={m.id} style={styles.course} onPress={() => navigation.navigate('PlaylistDetail', { playlist: { id: m.id, title: m.title, channelId: m.channelId, channelTitle: m.channel, count: m.tot, thumb: '' } })}>
            <View style={styles.courseTop}><Text style={styles.courseName} numberOfLines={1}>{m.title}</Text><Text style={styles.courseN}>{m.tot ? `${m.done}/${m.tot}` : '…'}</Text></View>
            <View style={styles.barWrap}><View style={[styles.barFill, { width: `${m.pct}%` }]} /></View>
            <Text style={styles.courseSub}>{m.channel} · {m.pct}% · {fmtTotal(m.total) || '—'}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  stat: { width: '47%', flexGrow: 1, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 18 },
  statVal: { color: colors.accent2, fontSize: 24, fontWeight: '600' },
  statLabel: { color: colors.inkSoft, fontSize: 12.5, marginTop: 8 },
  panel: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 18, marginBottom: 16 },
  panelHead: { color: colors.ink, fontSize: 15, fontWeight: '600', marginBottom: 16 },
  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 110 },
  col: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  barTrack: { flex: 1, width: '100%', maxWidth: 22, backgroundColor: colors.bg3, borderRadius: 5, overflow: 'hidden', justifyContent: 'flex-end', alignSelf: 'center' },
  bar: { width: '100%', backgroundColor: colors.accent, borderRadius: 5 },
  colLabel: { color: colors.inkFaint, fontSize: 9.5 },
  hint: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  course: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  courseTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  courseName: { flex: 1, color: colors.ink, fontSize: 14.5, fontWeight: '600' },
  courseN: { color: colors.inkSoft, fontSize: 13 },
  barWrap: { height: 6, borderRadius: 4, backgroundColor: colors.bg3, overflow: 'hidden', marginTop: 9 },
  barFill: { height: '100%', backgroundColor: colors.accent },
  courseSub: { color: colors.inkFaint, fontSize: 12, marginTop: 7 },
});
