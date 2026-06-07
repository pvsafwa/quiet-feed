import React, { useState } from 'react';
import { View, Text, Image, Pressable, TextInput, ScrollView, Alert, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { colors, radius } from '../theme';

export function SettingsScreen() {
  const user = useStore(s => s.user);
  const channels = useStore(s => s.channels);
  const addChannel = useStore(s => s.addChannel);
  const removeChannel = useStore(s => s.removeChannel);
  const signOut = useStore(s => s.signOut);
  const resetProg = useStore(s => s.resetProg);
  const autoRefreshMins = useStore(s => s.autoRefreshMins);
  const setAutoRefresh = useStore(s => s.setAutoRefresh);
  const [chan, setChan] = useState('');
  const [adding, setAdding] = useState(false);
  const isAdmin = user?.role === 'admin';

  const onAdd = async () => { if (!chan.trim()) return; setAdding(true); await addChannel(chan.trim()); setChan(''); setAdding(false); };
  const confirmReset = () => Alert.alert('Reset progress?', 'Clears watch time, completed videos, resume points and tracked courses.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => resetProg() },
  ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 18 }}>
      <Text style={styles.h2}>Account</Text>
      <View style={styles.acct}>
        {user?.picture ? <Image source={{ uri: user.picture }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: colors.bg3 }]} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name || user?.email}</Text>
          <Text style={styles.sub}>{user?.email} · <Text style={[styles.role, isAdmin && styles.roleAdmin]}>{isAdmin ? 'ADMIN' : 'MEMBER'}</Text></Text>
        </View>
        <Pressable style={styles.btn} onPress={() => signOut()}><Text style={styles.btnText}>Sign out</Text></Pressable>
      </View>

      {isAdmin && (
        <>
          <View style={styles.divider} />
          <Text style={styles.h2}>Manage channels</Text>
          <Text style={styles.hint}>Add by @handle, URL, or UC… ID. Appears for everyone.</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="@handle, URL, or UC… ID" placeholderTextColor={colors.inkFaint}
              value={chan} onChangeText={setChan} autoCapitalize="none" autoCorrect={false} />
            <Pressable style={styles.btnPrimary} disabled={adding} onPress={onAdd}><Text style={styles.btnPrimaryText}>{adding ? '…' : 'Add'}</Text></Pressable>
          </View>
          {channels.map(c => (
            <View key={c.id} style={styles.row}>
              {c.thumb ? <Image source={{ uri: c.thumb }} style={styles.rowAv} /> : <View style={[styles.rowAv, { backgroundColor: colors.bg3 }]} />}
              <Text style={styles.rowName} numberOfLines={1}>{c.title}</Text>
              <Pressable onPress={() => removeChannel(c.id)} style={styles.btn}><Text style={[styles.btnText, { color: colors.danger }]}>Remove</Text></Pressable>
            </View>
          ))}
        </>
      )}

      <View style={styles.divider} />
      <Text style={styles.h2}>Auto-refresh</Text>
      <View style={styles.seg}>
        {[0, 15, 30, 60].map(m => (
          <Pressable key={m} onPress={() => setAutoRefresh(m)} style={[styles.segBtn, autoRefreshMins === m && styles.segOn]}>
            <Text style={[styles.segText, autoRefreshMins === m && styles.segTextOn]}>{m === 0 ? 'Off' : `${m}m`}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.divider} />
      <Text style={styles.h2}>Your progress</Text>
      <Text style={styles.hint}>Synced to your account across devices.</Text>
      <Pressable style={styles.btn} onPress={confirmReset}><Text style={styles.btnText}>Reset all progress</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h2: { color: colors.ink, fontSize: 17, fontWeight: '600', marginBottom: 10 },
  hint: { color: colors.inkSoft, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  acct: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  av: { width: 44, height: 44, borderRadius: 22 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.inkFaint, fontSize: 12.5, marginTop: 2 },
  role: { color: colors.inkSoft, fontSize: 11, fontWeight: '700' },
  roleAdmin: { color: colors.accent },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 22 },
  field: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, color: colors.ink, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8, marginTop: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 10 },
  rowAv: { width: 30, height: 30, borderRadius: 15 },
  rowName: { flex: 1, color: colors.ink, fontSize: 14 },
  btn: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.bg2 },
  btnText: { color: colors.ink, fontSize: 13.5, fontWeight: '600' },
  btnPrimary: { borderRadius: radius.sm, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.accent, justifyContent: 'center' },
  btnPrimaryText: { color: colors.onAccent, fontWeight: '700' },
  seg: { flexDirection: 'row', gap: 4, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, padding: 4, alignSelf: 'flex-start' },
  segBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 },
  segOn: { backgroundColor: colors.accent },
  segText: { color: colors.inkSoft, fontWeight: '600' },
  segTextOn: { color: colors.onAccent },
});
