import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../store';
import { ago } from '../lib/format';
import type { AdminUserData } from '../lib/types';

export function AdminDashboard() {
  const fetchAdminData = useStore(s => s.fetchAdminDashboardData);
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [users, search]);

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

  return (
    <div className="admin-dash">
      <div className="admin-head">
        <div>
          <h2>Member Directory</h2>
          <p className="hint">Registered accounts and role management.</p>
        </div>
        <button className="btn" onClick={loadData} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Member KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-val">{stats.totalUsers}</div>
          <div className="kpi-lbl">Total Members</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-val">{stats.adminCount}</div>
          <div className="kpi-lbl">Administrators</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-val">{stats.userCount}</div>
          <div className="kpi-lbl">Standard Users</div>
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

      {/* Member Cards List */}
      <div className="admin-users-list">
        {filteredUsers.map(u => (
          <div key={u.id} className="admin-user-card" style={{ cursor: 'default' }}>
            <div className="admin-user-header">
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
                  Member since: {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Unknown'}
                  {u.last_login ? ` · Last login: ${ago(u.last_login)}` : ''}
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredUsers.length === 0 && (
          <div className="empty-sub" style={{ textAlign: 'center', padding: '40px 0' }}>
            {loading ? 'Loading registered users…' : 'No users found.'}
          </div>
        )}
      </div>
    </div>
  );
}

