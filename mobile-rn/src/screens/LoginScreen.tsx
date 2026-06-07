import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { GOOGLE_WEB_CLIENT_ID } from '../config';
import { colors, radius } from '../theme';

export function LoginScreen() {
  const signIn = useStore(s => s.signIn);
  const configured = !!GOOGLE_WEB_CLIENT_ID;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.mark}><Ionicons name="play" size={30} color={colors.onAccent} /></View>
        <Text style={styles.title}>quiet feed</Text>
        <Text style={styles.sub}>Only your channels · no rabbit holes.{'\n'}Sign in to see your feed and pick up where you left off.</Text>

        <Pressable style={[styles.gbtn, !configured && styles.disabled]} disabled={!configured} onPress={() => signIn()}>
          <Ionicons name="logo-google" size={18} color={colors.onAccent} />
          <Text style={styles.gbtnText}>Continue with Google</Text>
        </Pressable>

        {!configured && <Text style={styles.warn}>Google sign-in isn’t configured — set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg2 },
  mark: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 30, fontWeight: '500', color: colors.ink, marginBottom: 10 },
  sub: { color: colors.inkSoft, textAlign: 'center', lineHeight: 22, fontSize: 14.5, marginBottom: 26 },
  gbtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accent, paddingVertical: 13, paddingHorizontal: 22, borderRadius: radius.pill },
  gbtnText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  warn: { marginTop: 16, color: colors.danger, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
});
