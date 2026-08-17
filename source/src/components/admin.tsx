import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { ago, fmtDur } from '../lib/format';
import type { AdminUserData } from '../lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWatchDateTime(ts?: number | string): string {
  if (!ts) return 'Recently';
  try {
    const d = new Date(typeof ts === 'number' ? ts : ts);
    if (isNaN(d.getTime())) return 'Recently';
    const month = MONTHS[d.getMonth()] || 'Jan';
    const day = d.getDate();
    const year = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${hours}:${mins} ${ampm}`;
    const rel = ago(d.toISOString());
    return `${month} ${day}, ${year} at ${timeStr} (${rel})`;
  } catch {
    return 'Recently';
  }
}

function formatUserLastActive(isoString?: string): string {
  if (!isoString) return 'Unknown';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Unknown';
    const month = MONTHS[d.getMonth()] || 'Jan';
    const day = d.getDate();
    const year = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${hours}:${mins} ${ampm}`;
    return `${month} ${day}, ${year} · ${timeStr} (${ago(isoString)})`;
  } catch {
    return 'Unknown';
  }
}

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

export function AdminDashboard() {
  const fetchAdminData = useStore(s => s.fetchAdminDashboardData);
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Video lookup map from in-memory buffers for fallback metadata resolution
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
      (u.email || '').toLowerCase().includes(q) ||
      (u.location || '').toLowerCase().includes(q) ||
      (u.timezone || '').toLowerCase().includes(q)
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
          <p className="hint">Registered members, geographic location, live watch metrics, and course progress.</p>
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
          placeholder="Search members by name, email, location, timezone…"
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
          // Sort watch entries descending (most recently watched first)
          const watchedEntries = vEntries
            .filter(([_, v]) => v.done || v.p > 10)
            .sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
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

                  {/* Location & Timezone Badge */}
                  {(u.location || u.timezone) ? (
                    <div className="admin-loc-badge">
                      <span className="loc-pin">📍</span>
                      <span className="loc-txt">
                        {u.location ? u.location : ''}
                        {u.location && u.timezone ? ' · ' : ''}
                        {u.timezone ? u.timezone : ''}
                      </span>
                    </div>
                  ) : null}

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
                    {/* User Session & Metadata Box */}
                    <div className="admin-info-box">
                      <div className="admin-info-line">
                        <span className="info-lbl">🕒 Last Active:</span>
                        <span className="info-val">{formatUserLastActive(u.last_login)}</span>
                      </div>
                      {(u.location || u.timezone) ? (
                        <div className="admin-info-line">
                          <span className="info-lbl">📍 Location:</span>
                          <span className="info-val">
                            {u.location || 'Unknown'} {u.timezone ? `(${u.timezone})` : ''}
                          </span>
                        </div>
                      ) : null}
                      <div className="admin-info-line">
                        <span className="info-lbl">📅 Joined:</span>
                        <span className="info-val">{formatJoinedDate(u.created_at)}</span>
                      </div>
                    </div>

                    <div className="divider" />
                    
                    {/* Tracked Courses Section */}
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

                    {/* Rich Watch History Cards */}
                    <h4>Watch Activity ({watchedEntries.length})</h4>
                    {watchedEntries.length === 0 ? (
                      <div className="empty-sub">No watch activity recorded yet.</div>
                    ) : (
                      <div className="admin-rich-watch-list">
                        {watchedEntries.slice(0, 20).map(([vidId, vProg]) => {
                          const pct = vProg.d > 0 ? Math.round((vProg.p / vProg.d) * 100) : (vProg.done ? 100 : 0);
                          const fallback = videoLookup.get(vidId);
                          const title = vProg.title || fallback?.title || `Video (${vidId})`;
                          const channelTitle = vProg.channelTitle || fallback?.channelTitle || '';
                          const thumb = vProg.thumb || fallback?.thumb || `https://i.ytimg.com/vi/${vidId}/mqdefault.jpg`;

                          return (
                            <div key={vidId} className="admin-rich-watch-card">
                              <img
                                className="admin-watch-thumb"
                                src={thumb}
                                alt=""
                                onError={e => {
                                  const t = e.target as HTMLImageElement;
                                  if (t.src.includes('maxresdefault.jpg')) t.src = t.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                                }}
                              />
                              <div className="admin-watch-main">
                                <div className="admin-watch-title" title={title}>{title}</div>
                                {channelTitle ? <div className="admin-watch-chan">{channelTitle}</div> : null}
                                <div className="admin-watch-meta-row">
                                  <span className={`admin-prog-badge ${vProg.done ? 'done' : ''}`}>
                                    {vProg.done ? 'Completed' : (vProg.d > 0 ? `${fmtDur(Math.round(vProg.p))} / ${fmtDur(Math.round(vProg.d))} (${pct}%)` : `${pct}%`)}
                                  </span>
                                  <span className="admin-watch-time">
                                    {formatWatchDateTime(vProg.t)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {watchedEntries.length > 20 && (
                          <div className="admin-more-text">+ {watchedEntries.length - 20} more videos</div>
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
