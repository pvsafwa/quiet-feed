import React, { useState } from 'react';
import { View, Text, Image, Pressable, TextInput, ScrollView, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { colors, radius } from '../theme';
import { CURRENT_APP_VERSION, CURRENT_VERSION_CODE } from '../lib/updater';
import type { ChannelLanguage } from '../lib/types';

const LANGUAGES: ChannelLanguage[] = ['Arabic', 'English', 'Malayalam', 'Urdu'];

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const user = useStore(s => s.user);
  const channels = useStore(s => s.channels);
  const selectedChannelIds = useStore(s => s.selectedChannelIds);
  const toggleChannelSelection = useStore(s => s.toggleChannelSelection);
  const selectAllChannels = useStore(s => s.selectAllChannels);
  const deselectAllChannels = useStore(s => s.deselectAllChannels);
  const addChannel = useStore(s => s.addChannel);
  const removeChannel = useStore(s => s.removeChannel);
  const signOut = useStore(s => s.signOut);
  const resetProg = useStore(s => s.resetProg);
  const autoRefreshMins = useStore(s => s.autoRefreshMins);
  const setAutoRefresh = useStore(s => s.setAutoRefresh);
  const checkAppUpdate = useStore(s => s.checkAppUpdate);
  const checkingUpdate = useStore(s => s.checkingUpdate);

  const [chan, setChan] = useState('');
  const [selectedLang, setSelectedLang] = useState<ChannelLanguage>('English');
  const [adding, setAdding] = useState(false);
  const isAdmin = user?.role === 'admin';

  const onAdd = async () => {
    if (!chan.trim()) return;
    setAdding(true);
    await addChannel(chan.trim(), selectedLang);
    setChan('');
    setAdding(false);
  };

  const confirmRemoveChannel = (id: string, title: string) => {
    Alert.alert(
      'Remove Channel?',
      `Are you sure you want to remove "${title}" from the global catalog? This will affect all users.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeChannel(id) },
      ]
    );
  };

  const confirmReset = () => Alert.alert('Reset progress?', 'Clears watch time, completed videos, resume points and tracked courses.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => resetProg() },
  ]);

  const isChannelSelected = (id: string) => {
    if (selectedChannelIds === null) return true;
    return selectedChannelIds.includes(id);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
      <Text style={styles.h2}>Account</Text>
      <View style={styles.acct}>
        {user?.picture ? <Image source={{ uri: user.picture }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: colors.bg3 }]} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name || user?.email}</Text>
          <Text style={styles.sub}>{user?.email} · <Text style={[styles.role, isAdmin && styles.roleAdmin]}>{isAdmin ? 'ADMIN' : 'MEMBER'}</Text></Text>
        </View>
        <Pressable style={styles.btn} onPress={() => signOut()}><Text style={styles.btnText}>Sign out</Text></Pressable>
      </View>

      {/* ADMIN CONTROLS */}
      {isAdmin && (
        <>
          <View style={styles.divider} />
          <Text style={styles.h2}>Admin Hub</Text>
          
          <Pressable
            style={styles.adminDashCard}
            onPress={() => navigation.navigate('AdminDashboard')}
          >
            <View style={styles.adminIconBox}>
              <Ionicons name="bar-chart" size={24} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.adminCardTitle}>User Analytics & Tracking</Text>
              <Text style={styles.adminCardSub}>View registered members, watch histories & courses</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
          </Pressable>

          <View style={styles.divider} />
          <Text style={styles.h2}>Manage Catalog Channels</Text>
          <Text style={styles.hint}>Add by @handle, URL, or UC… ID with language category.</Text>
          
          {/* Language Selector for Adding */}
          <Text style={styles.fieldLabel}>Channel Language:</Text>
          <View style={styles.langPillRow}>
            {LANGUAGES.map(lang => (
              <Pressable
                key={lang}
                onPress={() => setSelectedLang(lang)}
                style={[styles.langPill, selectedLang === lang && styles.langPillActive]}
              >
                <Text style={[styles.langPillText, selectedLang === lang && styles.langPillTextActive]}>{lang}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.field}>
            <TextInput
              style={styles.input}
              placeholder="@handle, URL, or UC… ID"
              placeholderTextColor={colors.inkFaint}
              value={chan}
              onChangeText={setChan}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.btnPrimary} disabled={adding} onPress={onAdd}>
              <Text style={styles.btnPrimaryText}>{adding ? '…' : 'Add'}</Text>
            </Pressable>
          </View>

          {channels.map(c => (
            <View key={c.id} style={styles.row}>
              {c.thumb ? <Image source={{ uri: c.thumb }} style={styles.rowAv} /> : <View style={[styles.rowAv, { backgroundColor: colors.bg3 }]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{c.title}</Text>
                <Text style={styles.rowLang}>{c.language || 'English'}</Text>
              </View>
              <Pressable onPress={() => confirmRemoveChannel(c.id, c.title)} style={styles.btn}>
                <Text style={[styles.btnText, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      {/* USER CHANNEL PICKER / SUBSCRIPTION */}
      <View style={styles.divider} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h2}>My Channels</Text>
          <Text style={styles.hint}>Choose which channels appear in your feed and side menu.</Text>
        </View>
        <View style={styles.quickSelectRow}>
          <Pressable onPress={selectAllChannels} style={styles.quickBtn}>
            <Text style={styles.quickBtnText}>All</Text>
          </Pressable>
          <Pressable onPress={deselectAllChannels} style={styles.quickBtn}>
            <Text style={styles.quickBtnText}>None</Text>
          </Pressable>
        </View>
      </View>

      {channels.length === 0 ? (
        <Text style={styles.hint}>No channels available in the catalog yet.</Text>
      ) : (
        channels.map(c => {
          const selected = isChannelSelected(c.id);
          return (
            <Pressable
              key={c.id}
              style={[styles.userChanRow, selected && styles.userChanRowActive]}
              onPress={() => toggleChannelSelection(c.id)}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? colors.accent : colors.inkFaint}
              />
              {c.thumb ? <Image source={{ uri: c.thumb }} style={styles.rowAv} /> : <View style={[styles.rowAv, { backgroundColor: colors.bg3 }]} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, selected && { fontWeight: '700' }]} numberOfLines={1}>{c.title}</Text>
                <Text style={styles.rowLang}>{c.language || 'English'}</Text>
              </View>
            </Pressable>
          );
        })
      )}

      {/* AUTO REFRESH */}
      <View style={styles.divider} />
      <Text style={styles.h2}>Auto-refresh</Text>
      <View style={styles.seg}>
        {[0, 15, 30, 60].map(m => (
          <Pressable key={m} onPress={() => setAutoRefresh(m)} style={[styles.segBtn, autoRefreshMins === m && styles.segOn]}>
            <Text style={[styles.segText, autoRefreshMins === m && styles.segTextOn]}>{m === 0 ? 'Off' : `${m}m`}</Text>
          </Pressable>
        ))}
      </View>

      {/* APP UPDATES */}
      <View style={styles.divider} />
      <Text style={styles.h2}>App Updates</Text>
      <View style={styles.updateCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.versionTitle}>Quiet Feed v{CURRENT_APP_VERSION}</Text>
          <Text style={styles.versionSub}>Build {CURRENT_VERSION_CODE} · Release</Text>
        </View>
        <Pressable style={styles.btn} disabled={checkingUpdate} onPress={() => checkAppUpdate(true)}>
          <Text style={styles.btnText}>{checkingUpdate ? 'Checking…' : 'Check for updates'}</Text>
        </Pressable>
      </View>

      {/* PROGRESS RESET */}
      <View style={styles.divider} />
      <Text style={styles.h2}>Your progress</Text>
      <Text style={styles.hint}>Synced to your account across devices.</Text>
      <Pressable style={styles.btn} onPress={confirmReset}><Text style={styles.btnText}>Reset all progress</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h2: { color: colors.ink, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  hint: { color: colors.inkSoft, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  quickSelectRow: { flexDirection: 'row', gap: 6 },
  quickBtn: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 10 },
  quickBtnText: { color: colors.inkSoft, fontSize: 12, fontWeight: '600' },

  acct: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  av: { width: 44, height: 44, borderRadius: 22 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.inkFaint, fontSize: 12.5, marginTop: 2 },
  role: { color: colors.inkSoft, fontSize: 11, fontWeight: '700' },
  roleAdmin: { color: colors.accent },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 22 },

  adminDashCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 14,
    gap: 12,
    marginBottom: 6,
  },
  adminIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(217,119,6,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCardTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  adminCardSub: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2 },

  fieldLabel: { color: colors.inkSoft, fontSize: 12.5, fontWeight: '600', marginBottom: 6 },
  langPillRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  langPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  langPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langPillText: { color: colors.inkSoft, fontSize: 12.5, fontWeight: '600' },
  langPillTextActive: { color: colors.onAccent, fontWeight: '700' },

  field: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  input: { flex: 1, color: colors.ink, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 11 },
  
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, marginTop: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 10, backgroundColor: colors.bg2 },
  rowAv: { width: 32, height: 32, borderRadius: 16 },
  rowName: { color: colors.ink, fontSize: 14 },
  rowLang: { color: colors.inkFaint, fontSize: 11.5, marginTop: 1 },

  userChanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    backgroundColor: colors.bg2,
  },
  userChanRowActive: { borderColor: colors.line2 },

  btn: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.bg2 },
  btnText: { color: colors.ink, fontSize: 13.5, fontWeight: '600' },
  btnPrimary: { borderRadius: radius.sm, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.accent, justifyContent: 'center' },
  btnPrimaryText: { color: colors.onAccent, fontWeight: '700' },
  seg: { flexDirection: 'row', gap: 4, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, padding: 4, alignSelf: 'flex-start' },
  segBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 },
  segOn: { backgroundColor: colors.accent },
  segText: { color: colors.inkSoft, fontWeight: '600' },
  segTextOn: { color: colors.onAccent },
  updateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 14, gap: 12 },
  versionTitle: { color: colors.ink, fontSize: 14.5, fontWeight: '600' },
  versionSub: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2 },
});
