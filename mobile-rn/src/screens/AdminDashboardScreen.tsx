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
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { colors, radius } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ago, fmtDur, fmtTotal } from '../lib/format';
import type { AdminUserData } from '../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function AdminDashboardScreen() {
  const fetchAdminData = useStore(s => s.fetchAdminDashboardData);
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

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

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedUserId(prev => (prev === id ? null : id));
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
    let totalVideosWatched = 0;
    let totalCoursesTracked = 0;
    let totalActiveWeek = 0;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    users.forEach(u => {
      if (u.last_login && new Date(u.last_login).getTime() > weekAgo) {
        totalActiveWeek++;
      }
      if (u.progress) {
        const vRecs = Object.values(u.progress.v || {});
        totalVideosWatched += vRecs.filter(v => v.done || v.p > 10).length;
        totalCoursesTracked += Object.keys(u.progress.mon || {}).length;
      }
    });

    return {
      totalUsers: users.length,
      activeUsers: totalActiveWeek,
      totalVideosWatched,
      totalCoursesTracked,
    };
  }, [users]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading user statistics…</Text>
      </View>
    );
  }

  const insets = useSafeAreaInsets();
  const cur = useStore(s => s.cur);
  const bottomPad = insets.bottom + (cur ? 60 + 20 : 20);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Overview Metric Cards */}
      <Text style={styles.sectionHeader}>Overview Metrics</Text>
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{stats.totalUsers}</Text>
          <Text style={styles.kpiLabel}>Total Users</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{stats.activeUsers}</Text>
          <Text style={styles.kpiLabel}>Active (7d)</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{stats.totalVideosWatched}</Text>
          <Text style={styles.kpiLabel}>Videos Watched</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{stats.totalCoursesTracked}</Text>
          <Text style={styles.kpiLabel}>Courses Tracked</Text>
        </View>
      </View>

      {/* User Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.inkFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by email or name…"
          placeholderTextColor={colors.inkFaint}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable hitSlop={10} onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
          </Pressable>
        )}
      </View>

      {/* Registered Users List */}
      <Text style={styles.sectionHeader}>Registered Members ({filteredUsers.length})</Text>

      {filteredUsers.map(u => {
        const isExpanded = expandedUserId === u.id;
        const prog = u.progress;
        const vEntries = Object.entries(prog?.v || {});
        const watchedEntries = vEntries.filter(([_, v]) => v.done || v.p > 10);
        const monitoredCourses = Object.entries(prog?.mon || {});

        return (
          <View key={u.id} style={styles.userCard}>
            <Pressable style={styles.userCardHeader} onPress={() => toggleExpand(u.id)}>
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
                  Last active: {u.last_login ? ago(u.last_login) : 'Unknown'} · {watchedEntries.length} videos · {monitoredCourses.length} courses
                </Text>
              </View>

              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.inkSoft}
              />
            </Pressable>

            {/* Expandable Progress Details */}
            {isExpanded && (
              <View style={styles.userDetails}>
                <View style={styles.divider} />

                {/* Tracked Courses Section */}
                <Text style={styles.detailTitle}>Tracked Courses ({monitoredCourses.length})</Text>
                {monitoredCourses.length === 0 ? (
                  <Text style={styles.detailEmpty}>No courses currently tracked.</Text>
                ) : (
                  monitoredCourses.map(([plId, mon]) => {
                    const plRecord = prog?.pl?.[plId];
                    const ids = plRecord?.ids || [];
                    const doneCount = ids.filter(id => prog?.v?.[id]?.done).length;
                    const totalCount = mon.count || ids.length || 1;
                    const pct = Math.round((doneCount / totalCount) * 100);

                    return (
                      <View key={plId} style={styles.courseRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.courseTitle} numberOfLines={1}>{mon.title}</Text>
                          <Text style={styles.courseChannel}>{mon.channelTitle || 'Course'}</Text>
                          <View style={styles.courseBar}>
                            <View style={[styles.courseFill, { width: `${Math.min(100, pct)}%` }]} />
                          </View>
                        </View>
                        <Text style={styles.coursePct}>{doneCount}/{totalCount} ({pct}%)</Text>
                      </View>
                    );
                  })
                )}

                <View style={styles.divider} />

                {/* Watch History Section */}
                <Text style={styles.detailTitle}>Watch History ({watchedEntries.length})</Text>
                {watchedEntries.length === 0 ? (
                  <Text style={styles.detailEmpty}>No watch activity recorded yet.</Text>
                ) : (
                  <View style={styles.watchList}>
                    {watchedEntries.slice(0, 15).map(([vidId, vProg]) => {
                      const pct = vProg.d > 0 ? Math.round((vProg.p / vProg.d) * 100) : (vProg.done ? 100 : 0);
                      return (
                        <View key={vidId} style={styles.watchRow}>
                          <Ionicons
                            name={vProg.done ? 'checkmark-circle' : 'time-outline'}
                            size={16}
                            color={vProg.done ? colors.good : colors.inkSoft}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.watchVidId}>Video ID: {vidId}</Text>
                            <Text style={styles.watchMeta}>
                              Progress: {pct}% {vProg.d > 0 ? `(${fmtDur(Math.round(vProg.p))} / ${fmtDur(Math.round(vProg.d))})` : ''} · {vProg.t ? ago(new Date(vProg.t).toISOString()) : ''}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    {watchedEntries.length > 15 && (
                      <Text style={styles.moreText}>+ {watchedEntries.length - 15} more videos</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}

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
  userMeta: { color: colors.inkFaint, fontSize: 11.5, marginTop: 4 },

  userDetails: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.bg },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  detailTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  detailEmpty: { color: colors.inkFaint, fontSize: 12.5, fontStyle: 'italic', marginVertical: 4 },

  courseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
  courseTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  courseChannel: { color: colors.inkFaint, fontSize: 11.5, marginTop: 1 },
  courseBar: { height: 4, backgroundColor: colors.bg3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  courseFill: { height: '100%', backgroundColor: colors.accent },
  coursePct: { color: colors.inkSoft, fontSize: 12, fontWeight: '600' },

  watchList: { gap: 8 },
  watchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  watchVidId: { color: colors.ink, fontSize: 12.5, fontWeight: '500' },
  watchMeta: { color: colors.inkFaint, fontSize: 11.5, marginTop: 1 },
  moreText: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 4 },

  empty: { color: colors.inkSoft, textAlign: 'center', paddingVertical: 40, fontSize: 14 },
});
