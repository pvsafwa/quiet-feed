import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { ago, fmtDur } from '../lib/format';
import type { AdminUserData } from '../lib/types';
import { IChart, IPlay, IList } from './states';

export function AdminDashboard() {
  const fetchAdminData = useStore(s => s.fetchAdminDashboardData);
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminData();
      setUsers(data);
    } catch (e) {
      console.warn('Failed to load admin users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedUserId(prev => (prev === id ? null : id));
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [users, search]);

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

  return (
    <div className="admin-dash">
      <div className="admin-head">
        <div>
          <h2>Admin Analytics & Tracking</h2>
          <p className="hint">Registered members, live watch metrics, and course progress.</p>
        </div>
        <button className="btn" onClick={loadData} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh stats'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-val">{stats.totalUsers}</div>
          <div className="kpi-lbl">Total Users</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-val">{stats.activeUsers}</div>
          <div className="kpi-lbl">Active (7 Days)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-val">{stats.totalVideosWatched}</div>
          <div className="kpi-lbl">Videos Watched</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-val">{stats.totalCoursesTracked}</div>
          <div className="kpi-lbl">Courses Tracked</div>
        </div>
      </div>

      {/* Search Filter */}
      <div className="admin-search-wrap">
        <input
          type="text"
          className="admin-search"
          placeholder="Search members by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className="sx" onClick={() => setSearch('')}>×</button>}
      </div>

      {/* User Cards List */}
      <div className="admin-users-list">
        {filteredUsers.map(u => {
          const isExpanded = expandedUserId === u.id;
          const prog = u.progress;
          const vEntries = Object.entries(prog?.v || {});
          const watchedEntries = vEntries.filter(([_, v]) => v.done || v.p > 10);
          const monitoredCourses = Object.entries(prog?.mon || {});

          return (
            <div key={u.id} className="admin-user-card">
              <div className="admin-user-header" onClick={() => toggleExpand(u.id)}>
                {u.picture ? (
                  <img className="acct-av" src={u.picture} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="acct-av ph" />
                )}
                <div className="admin-user-meta">
                  <div className="admin-name-row">
                    <span className="admin-uname">{u.name || u.email}</span>
                    <span className={`role ${u.role === 'admin' ? 'admin' : ''}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </div>
                  <div className="admin-uemail">{u.email}</div>
                  <div className="admin-usub">
                    Last active: {u.last_login ? ago(u.last_login) : 'Unknown'} · {watchedEntries.length} videos watched · {monitoredCourses.length} courses
                  </div>
                </div>
                <button className="btn icon exp-btn">
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>

              {/* Expandable Progress View */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    className="admin-user-details"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <div className="divider" />
                    
                    {/* Courses */}
                    <h4>Tracked Courses ({monitoredCourses.length})</h4>
                    {monitoredCourses.length === 0 ? (
                      <div className="empty-sub">No courses tracked yet.</div>
                    ) : (
                      <div className="admin-course-list">
                        {monitoredCourses.map(([plId, mon]) => {
                          const plRecord = prog?.pl?.[plId];
                          const ids = plRecord?.ids || [];
                          const doneCount = ids.filter(id => prog?.v?.[id]?.done).length;
                          const totalCount = mon.count || ids.length || 1;
                          const pct = Math.round((doneCount / totalCount) * 100);

                          return (
                            <div key={plId} className="admin-course-row">
                              <div className="admin-course-info">
                                <div className="admin-ctitle">{mon.title}</div>
                                <div className="admin-cchan">{mon.channelTitle || 'Course'}</div>
                                <div className="admin-bar-wrap">
                                  <div className="admin-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                              </div>
                              <div className="admin-cpct">{doneCount}/{totalCount} ({pct}%)</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="divider" />

                    {/* Watch History */}
                    <h4>Watch Activity ({watchedEntries.length})</h4>
                    {watchedEntries.length === 0 ? (
                      <div className="empty-sub">No watch activity recorded yet.</div>
                    ) : (
                      <div className="admin-watch-list">
                        {watchedEntries.slice(0, 15).map(([vidId, vProg]) => {
                          const pct = vProg.d > 0 ? Math.round((vProg.p / vProg.d) * 100) : (vProg.done ? 100 : 0);
                          return (
                            <div key={vidId} className="admin-watch-row">
                              <span className="watch-status-ic">{vProg.done ? '✓' : '⏱'}</span>
                              <div className="watch-info">
                                <span className="watch-vid-id">Video ID: <code>{vidId}</code></span>
                                <span className="watch-meta">
                                  Progress: {pct}% {vProg.d > 0 ? `(${fmtDur(Math.round(vProg.p))} / ${fmtDur(Math.round(vProg.d))})` : ''} · {vProg.t ? ago(new Date(vProg.t).toISOString()) : ''}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {watchedEntries.length > 15 && (
                          <div className="admin-more-text">+ {watchedEntries.length - 15} more videos</div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="empty-sub" style={{ textAlign: 'center', padding: '40px 0' }}>
            {loading ? 'Loading registered users…' : 'No users found.'}
          </div>
        )}
      </div>
    </div>
  );
}
