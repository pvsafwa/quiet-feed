import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { colors, radius } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ago } from '../lib/format';
import type { AdminUserData } from '../lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatJoinedDate(isoString?: string): string {
  if (!isoString) return 'Unknown';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Unknown';
    const month = MONTHS[d.getMonth()] || 'Jan';
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
  } catch {
    return 'Unknown';
  }
}

export function AdminDashboardScreen() {
  const fetchAdminData = useStore(s => s.fetchAdminDashboardData);
  const cur = useStore(s => s.cur);
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + (cur ? 60 + 36 : 36);

  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      const data = await fetchAdminData();
      setUsers(data);
    } catch (e) {
      console.warn('Failed to load admin users:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Filter users by search
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  // Compute aggregate stats
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const userCount = totalUsers - adminCount;

    return {
      totalUsers,
      adminCount,
      userCount,
    };
  }, [users]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading member directory…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Registered Users List */}
      <Text style={styles.sectionHeader}>Registered Members ({filteredUsers.length})</Text>

      {filteredUsers.map(u => (
        <View key={u.id} style={styles.userCard}>
          <View style={styles.userCardHeader}>
            {u.picture ? (
              <Image source={{ uri: u.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.bg3 }]}>
                <Ionicons name="person" size={20} color={colors.inkSoft} />
              </View>
            )}

            <View style={{ flex: 1 }}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{u.name || u.email}</Text>
                <View style={[styles.roleBadge, u.role === 'admin' && styles.roleBadgeAdmin]}>
                  <Text style={[styles.roleText, u.role === 'admin' && styles.roleTextAdmin]}>
                    {u.role.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.userEmail}>{u.email}</Text>
              <Text style={styles.userMeta}>
                Joined: {formatJoinedDate(u.created_at)}
                {u.last_login ? ` · Active: ${ago(u.last_login)}` : ''}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {filteredUsers.length === 0 && (
        <Text style={styles.empty}>No matching users found.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 40 },
  centerContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { color: colors.inkSoft, fontSize: 14, marginTop: 12 },

  sectionHeader: { color: colors.ink, fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 10 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: { width: '48%', backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  kpiValue: { color: colors.accent, fontSize: 24, fontWeight: '800' },
  kpiLabel: { color: colors.inkSoft, fontSize: 12, marginTop: 4, fontWeight: '600' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    marginBottom: 20,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },

  userCard: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginBottom: 12, overflow: 'hidden' },
  userCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { color: colors.ink, fontSize: 14.5, fontWeight: '700' },
  roleBadge: { backgroundColor: colors.bg3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  roleBadgeAdmin: { backgroundColor: 'rgba(217,119,6,0.18)' },
  roleText: { color: colors.inkSoft, fontSize: 10, fontWeight: '700' },
  roleTextAdmin: { color: colors.accent },
  userEmail: { color: colors.inkSoft, fontSize: 12.5, marginTop: 2 },
  userLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  userLocationText: { color: colors.accent, fontSize: 11.5, fontWeight: '600' },
  userMeta: { color: colors.inkFaint, fontSize: 11.5, marginTop: 4 },

  userDetails: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.bg },
  empty: { color: colors.inkSoft, textAlign: 'center', paddingVertical: 40, fontSize: 14 },
});

