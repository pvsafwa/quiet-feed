import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { totals, streaks, lastDays } from '../lib/progress';
import { fmtSpan } from '../lib/format';
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
        <Text style={styles.panelHead}>Library</Text>
        <Pressable style={styles.libBtn} onPress={() => navigation.navigate('TrackedCourses')}>
          <Ionicons name="list" size={20} color={colors.ink} style={{ marginRight: 12 }} />
          <Text style={styles.libText}>Tracked courses</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
        </Pressable>
        <Pressable style={[styles.libBtn, { borderBottomWidth: 0 }]} onPress={() => navigation.navigate('WatchHistory')}>
          <Ionicons name="time-outline" size={20} color={colors.ink} style={{ marginRight: 12 }} />
          <Text style={styles.libText}>Watch history</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
        </Pressable>
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
  libBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  libText: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '500' },
});
