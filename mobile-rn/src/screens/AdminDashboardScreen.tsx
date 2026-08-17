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
import { ago, fmtDur } from '../lib/format';
import type { AdminUserData } from '../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatWatchDateTime(ts?: number | string): string {
  if (!ts) return 'Unknown time';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  if (isNaN(d.getTime())) return 'Unknown time';
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const rel = ago(d.toISOString());
  return `${dateStr} at ${timeStr} (${rel})`;
}

function formatUserLastActive(isoString?: string): string {
  if (!isoString) return 'Unknown';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Unknown';
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dateStr} · ${timeStr} (${ago(isoString)})`;
}

export function AdminDashboardScreen() {
  const fetchAdminData = useStore(s => s.fetchAdminDashboardData);
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Video lookup map from store cache for fallback metadata resolution
  const videoLookup = useMemo(() => {
    const map = new Map<string, { title: string; channelTitle: string; thumb: string }>();
    const buffers = useStore.getState().vid?.buffers || {};
    Object.values(buffers).forEach(list => {
      (list || []).forEach(v => {
        if (v && v.id) map.set(v.id, { title: v.title, channelTitle: v.channelTitle, thumb: v.thumb });
      });
    });
    return map;
  }, []);

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
      (u.email || '').toLowerCase().includes(q) ||
      (u.location || '').toLowerCase().includes(q) ||
      (u.timezone || '').toLowerCase().includes(q)
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
  const bottomPad = insets.bottom + (cur ? 60 + 36 : 36);

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
          placeholder="Search by email, name, location, timezone…"
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
        // Sort watched entries by timestamp descending (most recently watched first)
        const watchedEntries = vEntries
          .filter(([_, v]) => v.done || v.p > 10)
          .sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
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

                {/* Location & Timezone Badge */}
                {(u.location || u.timezone) ? (
                  <View style={styles.userLocationRow}>
                    <Ionicons name="location-sharp" size={12} color={colors.accent} />
                    <Text style={styles.userLocationText} numberOfLines={1}>
                      {u.location ? u.location : ''}
                      {u.location && u.timezone ? ' · ' : ''}
                      {u.timezone ? u.timezone : ''}
                    </Text>
                  </View>
                ) : null}

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
                {/* User Session & Location Information */}
                <View style={styles.userInfoBox}>
                  <View style={styles.infoLine}>
                    <Ionicons name="time-outline" size={14} color={colors.inkSoft} />
                    <Text style={styles.infoLabel}>Last Active:</Text>
                    <Text style={styles.infoVal}>{formatUserLastActive(u.last_login)}</Text>
                  </View>
                  {(u.location || u.timezone) ? (
                    <View style={styles.infoLine}>
                      <Ionicons name="globe-outline" size={14} color={colors.inkSoft} />
                      <Text style={styles.infoLabel}>Location:</Text>
                      <Text style={styles.infoVal}>
                        {u.location || 'Unknown'} {u.timezone ? `(${u.timezone})` : ''}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.infoLine}>
                    <Ionicons name="calendar-outline" size={14} color={colors.inkSoft} />
                    <Text style={styles.infoLabel}>Joined:</Text>
                    <Text style={styles.infoVal}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                    </Text>
                  </View>
                </View>

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
                    {watchedEntries.slice(0, 20).map(([vidId, vProg]) => {
                      const pct = vProg.d > 0 ? Math.round((vProg.p / vProg.d) * 100) : (vProg.done ? 100 : 0);
                      const fallback = videoLookup.get(vidId);
                      const title = vProg.title || fallback?.title || `Video ID: ${vidId}`;
                      const channelTitle = vProg.channelTitle || fallback?.channelTitle || 'YouTube Channel';
                      const thumbUri = vProg.thumb || fallback?.thumb || (vidId ? `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg` : '');

                      return (
                        <View key={vidId} style={styles.watchItemCard}>
                          {/* Video Thumbnail */}
                          <View style={styles.watchThumbWrap}>
                            {thumbUri ? (
                              <Image source={{ uri: thumbUri }} style={styles.watchThumb} resizeMode="cover" />
                            ) : (
                              <View style={[styles.watchThumb, styles.watchThumbPlaceholder]}>
                                <Ionicons name="play" size={16} color={colors.inkSoft} />
                              </View>
                            )}
                            {vProg.d > 0 && (
                              <View style={styles.watchDurationBadge}>
                                <Text style={styles.watchDurationText}>{fmtDur(Math.round(vProg.d))}</Text>
                              </View>
                            )}
                          </View>

                          {/* Video Info & Watch Stats */}
                          <View style={styles.watchInfo}>
                            <Text style={styles.watchTitle} numberOfLines={2}>{title}</Text>
                            <Text style={styles.watchChannel} numberOfLines={1}>{channelTitle}</Text>

                            {/* Progress & Time Details */}
                            <View style={styles.watchProgressRow}>
                              <View style={[styles.statusPill, vProg.done ? styles.statusPillDone : styles.statusPillProg]}>
                                <Ionicons
                                  name={vProg.done ? 'checkmark-circle' : 'time-outline'}
                                  size={11}
                                  color={vProg.done ? colors.good : colors.accent}
                                />
                                <Text style={[styles.statusPillText, vProg.done ? styles.statusPillTextDone : styles.statusPillTextProg]}>
                                  {vProg.done ? 'Completed' : `${pct}% Watched`}
                                </Text>
                              </View>

                              {vProg.d > 0 && (
                                <Text style={styles.watchRatio}>
                                  {fmtDur(Math.round(vProg.p))} / {fmtDur(Math.round(vProg.d))}
                                </Text>
                              )}
                            </View>

                            {/* Exact Watch Date & Time */}
                            <View style={styles.watchTimestampRow}>
                              <Ionicons name="time" size={11} color={colors.inkFaint} />
                              <Text style={styles.watchTimestampText}>{formatWatchDateTime(vProg.t)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    {watchedEntries.length > 20 && (
                      <Text style={styles.moreText}>+ {watchedEntries.length - 20} more videos watched</Text>
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
  userLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  userLocationText: { color: colors.accent, fontSize: 11.5, fontWeight: '600' },
  userMeta: { color: colors.inkFaint, fontSize: 11.5, marginTop: 4 },

  userDetails: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.bg },
  userInfoBox: { backgroundColor: colors.bg2, borderRadius: radius.sm, padding: 10, gap: 6, marginTop: 10, borderWidth: 1, borderColor: colors.line },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoLabel: { color: colors.inkFaint, fontSize: 11.5, fontWeight: '600' },
  infoVal: { color: colors.ink, fontSize: 11.5, flex: 1 },

  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  detailTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  detailEmpty: { color: colors.inkFaint, fontSize: 12.5, fontStyle: 'italic', marginVertical: 4 },

  courseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 10 },
  courseTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  courseChannel: { color: colors.inkFaint, fontSize: 11.5, marginTop: 1 },
  courseBar: { height: 4, backgroundColor: colors.bg3, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  courseFill: { height: '100%', backgroundColor: colors.accent },
  coursePct: { color: colors.inkSoft, fontSize: 12, fontWeight: '600' },

  watchList: { gap: 10 },
  watchItemCard: { flexDirection: 'row', backgroundColor: colors.bg2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 10 },
  watchThumbWrap: { width: 76, height: 48, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.bg3, position: 'relative' },
  watchThumb: { width: '100%', height: '100%' },
  watchThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  watchDurationBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
  watchDurationText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  watchInfo: { flex: 1, justifyContent: 'center' },
  watchTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
  watchChannel: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },
  watchProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: radius.pill },
  statusPillDone: { backgroundColor: 'rgba(22,163,74,0.15)' },
  statusPillProg: { backgroundColor: 'rgba(217,119,6,0.15)' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  statusPillTextDone: { color: colors.good },
  statusPillTextProg: { color: colors.accent },
  watchRatio: { color: colors.inkFaint, fontSize: 10.5 },
  watchTimestampRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  watchTimestampText: { color: colors.inkFaint, fontSize: 10.5 },

  moreText: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  empty: { color: colors.inkSoft, textAlign: 'center', paddingVertical: 40, fontSize: 14 },
});
