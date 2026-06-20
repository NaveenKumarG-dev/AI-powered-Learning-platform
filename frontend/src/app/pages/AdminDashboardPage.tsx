import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAppSelector } from '../../store';
import {
  Zap, Users, Activity, TrendingUp, Filter, RefreshCw,
  ArrowUp, ArrowDown, ChevronDown, ChevronUp, Shield,
  MessageSquare, Video, Map, Brain, Code, FileText,
  Headphones, BookOpen, ClipboardList, Search, Calendar,
  BarChart2, Clock, User, AlertTriangle,
} from 'lucide-react';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  summary: {
    total_tokens: number;
    total_input: number;
    total_output: number;
    total_api_calls: number;
    total_users: number;
    total_enrollments: number;
    active_today: number;
  };
  activity_breakdown: Array<{
    activity_type: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    count: number;
  }>;
  activity_log_breakdown: Array<{
    activity_type: string;
    count: number;
  }>;
  daily_usage: Array<{
    date: string;
    total: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  users: Array<{
    user_id: number;
    email: string;
    full_name: string;
    is_staff: boolean;
    date_joined: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    api_calls: number;
    enrollment_count: number;
    last_active: string | null;
  }>;
  recent_usage: Array<{
    id: number;
    user_id: number;
    user__email: string;
    user__full_name: string;
    activity_type: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    model_name: string;
    created_at: string;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_TYPES = [
  { key: 'all',             label: 'All Activities',   icon: Activity,      color: '#6366f1' },
  { key: 'quiz',            label: 'Quiz',             icon: ClipboardList, color: '#10b981' },
  { key: 'video_generation',label: 'Video',            icon: Video,         color: '#f59e0b' },
  { key: 'mindmap',         label: 'Mind Map',         icon: Map,           color: '#8b5cf6' },
  { key: 'chat',            label: 'Chat',             icon: MessageSquare, color: '#06b6d4' },
  { key: 'coding',          label: 'Coding',           icon: Code,          color: '#ef4444' },
  { key: 'notes',           label: 'Notes',            icon: FileText,      color: '#84cc16' },
  { key: 'podcast',         label: 'Podcast',          icon: Headphones,    color: '#ec4899' },
  { key: 'assessment',      label: 'Assessment',       icon: Brain,         color: '#f97316' },
  { key: 'course_planning', label: 'Course Planning',  icon: BookOpen,      color: '#14b8a6' },
  { key: 'remediation',     label: 'Remediation',      icon: TrendingUp,    color: '#a855f7' },
  { key: 'dynamic_script',  label: 'Dynamic Script',   icon: BarChart2,     color: '#64748b' },
];

const getActivityMeta = (key: string) =>
  ACTIVITY_TYPES.find(a => a.key === key) ?? { label: key, icon: Activity, color: '#6366f1' };

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Mini Bar Spark ───────────────────────────────────────────────────────────

function SparkBar({ data }: { data: Array<{ total: number }> }) {
  const max = Math.max(...data.map(d => d.total), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.total.toLocaleString()} tokens`}
          style={{
            flex: 1,
            height: `${Math.max(4, (d.total / max) * 40)}px`,
            background: 'linear-gradient(180deg, #6366f1 0%, #8b5cf6 100%)',
            borderRadius: 3,
            opacity: 0.75 + (i / data.length) * 0.25,
            transition: 'opacity 0.2s',
          }}
        />
      ))}
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ data }: { data: Array<{ activity_type: string; total_tokens: number }> }) {
  const total = data.reduce((s, d) => s + d.total_tokens, 0) || 1;
  let cumulative = 0;
  const segments = data.slice(0, 8).map(d => {
    const pct = d.total_tokens / total;
    const startAngle = cumulative * 360;
    cumulative += pct;
    const endAngle = cumulative * 360;
    const meta = getActivityMeta(d.activity_type);
    return { ...d, pct, startAngle, endAngle, color: meta.color, label: meta.label };
  });

  function polarToCart(angle: number, r: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: 50 + r * Math.cos(rad), y: 50 + r * Math.sin(rad) };
  }

  function describeArc(start: number, end: number, inner: number, outer: number) {
    if (end - start >= 360) end = start + 359.99;
    const s1 = polarToCart(start, outer), e1 = polarToCart(end, outer);
    const s2 = polarToCart(start, inner), e2 = polarToCart(end, inner);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s1.x} ${s1.y} A ${outer} ${outer} 0 ${large} 1 ${e1.x} ${e1.y} L ${e2.x} ${e2.y} A ${inner} ${inner} 0 ${large} 0 ${s2.x} ${s2.y} Z`;
  }

  if (data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: '#94a3b8', fontSize: 14 }}>
        No token data yet
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      <svg viewBox="0 0 100 100" width={180} height={180} style={{ flexShrink: 0 }}>
        {segments.map((seg, i) => (
          <path
            key={i}
            d={describeArc(seg.startAngle, seg.endAngle, 28, 46)}
            fill={seg.color}
            opacity={0.9}
            style={{ transition: 'opacity 0.2s' }}
          >
            <title>{seg.label}: {formatTokens(seg.total_tokens)} ({(seg.pct * 100).toFixed(1)}%)</title>
          </path>
        ))}
        <text x="50" y="47" textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="system-ui">Total</text>
        <text x="50" y="58" textAnchor="middle" fontSize="10" fill="#1e293b" fontWeight="700" fontFamily="system-ui">
          {formatTokens(total)}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#475569', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {seg.label}
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              {(seg.pct * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const navigate  = useNavigate();
  const { user, isAuthenticated } = useAppSelector(s => s.auth);

  const [stats, setStats]               = useState<AdminStats | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchUser, setSearchUser]     = useState('');
  const [sortCol, setSortCol]           = useState<'total_tokens' | 'api_calls' | 'enrollment_count'>('total_tokens');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc');
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');

  // Auth guard – only staff
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    // Allow access – backend enforces IsAdminUser
  }, [isAuthenticated, navigate]);

  const fetchStats = async () => {
    setLoading(true); setError(null);
    try {
      const token = localStorage.getItem('access_token');
      const base  = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api';
      const params: Record<string, string> = {};
      if (activeFilter !== 'all') params.activity_type = activeFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;

      const res = await axios.get(`${base}/admin/stats/`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setStats(res.data);
    } catch (e: any) {
      if (e.response?.status === 403) {
        setError('Access denied. You need staff/admin privileges to view this page.');
      } else {
        setError(e.response?.data?.detail || 'Failed to load admin stats.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAuthenticated) fetchStats(); }, [activeFilter, dateFrom, dateTo, isAuthenticated]);

  const filteredUsers = useMemo(() => {
    if (!stats) return [];
    let list = [...stats.users];
    if (searchUser.trim()) {
      const q = searchUser.toLowerCase();
      list = list.filter(u => u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const diff = a[sortCol] - b[sortCol];
      return sortDir === 'desc' ? -diff : diff;
    });
    return list;
  }, [stats, searchUser, sortCol, sortDir]);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  // ─── Loading ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={styles.shell}>
      <div style={styles.loadingCenter}>
        <div style={styles.spinner} />
        <p style={{ color: '#94a3b8', marginTop: 16, fontSize: 14 }}>Loading admin stats…</p>
      </div>
    </div>
  );

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={styles.shell}>
      <div style={styles.loadingCenter}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={28} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Access Error</h2>
          <p style={{ color: '#64748b', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>{error}</p>
          <button onClick={() => navigate('/dashboard')} style={styles.btnPrimary}>
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  const s = stats!;

  return (
    <div style={styles.shell}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <div style={styles.logoIcon}><Shield size={20} color="#fff" /></div>
          <div>
            <div style={styles.logoTitle}>Admin Panel</div>
            <div style={styles.logoSub}>Platform Analytics</div>
          </div>
        </div>

        <nav style={styles.sidebarNav}>
          <div style={styles.navLabel}>Activity Filter</div>
          {ACTIVITY_TYPES.map(act => {
            const Icon = act.icon;
            const isActive = activeFilter === act.key;
            return (
              <button
                key={act.key}
                onClick={() => setActiveFilter(act.key)}
                style={{
                  ...styles.navItem,
                  background: isActive ? act.color + '18' : 'transparent',
                  color: isActive ? act.color : '#64748b',
                  borderLeft: isActive ? `3px solid ${act.color}` : '3px solid transparent',
                }}
              >
                <Icon size={15} />
                <span>{act.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>
            ← Back to Dashboard
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={styles.main}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>Admin Dashboard</h1>
            <p style={styles.pageSubtitle}>
              Platform-wide token usage & user activity analytics
              {activeFilter !== 'all' && (
                <span style={{ marginLeft: 8, padding: '2px 10px', borderRadius: 20, background: getActivityMeta(activeFilter).color + '20', color: getActivityMeta(activeFilter).color, fontSize: 12, fontWeight: 600 }}>
                  Filtered: {getActivityMeta(activeFilter).label}
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Date range */}
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={styles.dateInput}
              title="From date"
            />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={styles.dateInput}
              title="To date"
            />
            <button onClick={fetchStats} style={styles.refreshBtn} title="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div style={styles.cardsGrid}>
          <StatCard
            icon={<Zap size={22} color="#6366f1" />}
            label="Total Tokens"
            value={formatTokens(s.summary.total_tokens)}
            sub={`${formatTokens(s.summary.total_input)} in · ${formatTokens(s.summary.total_output)} out`}
            color="#6366f1"
            gradient="linear-gradient(135deg, #6366f120 0%, #8b5cf620 100%)"
          />
          <StatCard
            icon={<Users size={22} color="#10b981" />}
            label="Total Users"
            value={String(s.summary.total_users)}
            sub={`${s.summary.active_today} active today`}
            color="#10b981"
            gradient="linear-gradient(135deg, #10b98120 0%, #06b6d420 100%)"
          />
          <StatCard
            icon={<Activity size={22} color="#f59e0b" />}
            label="API Calls"
            value={s.summary.total_api_calls.toLocaleString()}
            sub={`${s.summary.total_enrollments} enrollments`}
            color="#f59e0b"
            gradient="linear-gradient(135deg, #f59e0b20 0%, #ef444420 100%)"
          />
          <StatCard
            icon={<TrendingUp size={22} color="#8b5cf6" />}
            label="Avg Tokens / Call"
            value={s.summary.total_api_calls > 0
              ? formatTokens(Math.round(s.summary.total_tokens / s.summary.total_api_calls))
              : '—'}
            sub="per AI request"
            color="#8b5cf6"
            gradient="linear-gradient(135deg, #8b5cf620 0%, #ec489920 100%)"
          />
        </div>

        {/* ── Charts Row ── */}
        <div style={styles.chartsRow}>
          {/* Donut */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Token Distribution by Activity</h2>
            <DonutChart data={s.activity_breakdown} />
          </div>

          {/* Spark + Daily */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Daily Usage (Last 30 Days)</h2>
            {s.daily_usage.length > 0 ? (
              <>
                <SparkBar data={s.daily_usage} />
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {s.daily_usage.slice(-5).map((d, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        {formatTokens(d.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: '#94a3b8', fontSize: 13, paddingTop: 12 }}>No usage data in the last 30 days.</div>
            )}

            {/* Activity log breakdown */}
            <div style={{ marginTop: 20 }}>
              <h3 style={{ ...styles.cardTitle, fontSize: 13, marginBottom: 10 }}>Activity Event Counts</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {s.activity_log_breakdown.slice(0, 8).map((row, i) => {
                  const meta = getActivityMeta(row.activity_type);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: meta.color + '15', border: `1px solid ${meta.color}30` }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>{meta.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{row.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Users Table ── */}
        <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ ...styles.cardTitle, margin: 0 }}>User Activity Stats</h2>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                placeholder="Search users…"
                style={{ ...styles.dateInput, paddingLeft: 30, width: 200 }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={styles.th}>User</th>
                  <SortTh label="Total Tokens" col="total_tokens" active={sortCol} dir={sortDir} onClick={() => handleSort('total_tokens')} />
                  <SortTh label="API Calls"    col="api_calls"    active={sortCol} dir={sortDir} onClick={() => handleSort('api_calls')} />
                  <SortTh label="Enrollments"  col="enrollment_count" active={sortCol} dir={sortDir} onClick={() => handleSort('enrollment_count')} />
                  <th style={styles.th}>Last Active</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>No users found</td></tr>
                )}
                {filteredUsers.map(u => (
                  <>
                    <tr
                      key={u.user_id}
                      style={{
                        ...styles.tr,
                        background: expandedUser === u.user_id ? '#f8faff' : undefined,
                      }}
                    >
                      {/* User */}
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: `hsl(${(u.user_id * 47) % 360}, 60%, 92%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700, color: `hsl(${(u.user_id * 47) % 360}, 60%, 40%)`,
                            flexShrink: 0,
                          }}>
                            {(u.full_name || u.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{u.full_name || '—'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      {/* Tokens */}
                      <td style={styles.td}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#6366f1' }}>{formatTokens(u.total_tokens)}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>↑{formatTokens(u.input_tokens)} ↓{formatTokens(u.output_tokens)}</div>
                        </div>
                      </td>
                      {/* API calls */}
                      <td style={styles.td}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>{u.api_calls.toLocaleString()}</span>
                      </td>
                      {/* Enrollments */}
                      <td style={styles.td}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>{u.enrollment_count}</span>
                      </td>
                      {/* Last Active */}
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={12} color="#94a3b8" />
                          <span style={{ fontSize: 12, color: '#64748b' }}>{timeAgo(u.last_active)}</span>
                        </div>
                      </td>
                      {/* Role */}
                      <td style={styles.td}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: u.is_staff ? '#6366f115' : '#10b98115',
                          color: u.is_staff ? '#6366f1' : '#10b981',
                        }}>
                          {u.is_staff ? 'Staff' : 'Learner'}
                        </span>
                      </td>
                      {/* Expand */}
                      <td style={styles.td}>
                        <button
                          onClick={() => setExpandedUser(expandedUser === u.user_id ? null : u.user_id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
                        >
                          {expandedUser === u.user_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>
                    {/* Expanded row */}
                    {expandedUser === u.user_id && (
                      <tr key={`exp-${u.user_id}`} style={{ background: '#f8faff' }}>
                        <td colSpan={7} style={{ padding: '12px 24px 20px' }}>
                          <UserExpandedDetail user={u} recentUsage={s.recent_usage} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recent Activity Feed ── */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Recent Token Usage Feed</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {s.recent_usage.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>No recent token usage recorded yet.</p>
            )}
            {s.recent_usage.map((row, i) => {
              const meta = getActivityMeta(row.activity_type);
              const Icon = meta.icon;
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '10px 0',
                    borderBottom: i < s.recent_usage.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: meta.color + '15',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={15} color={meta.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                        {row['user__full_name'] || row['user__email'] || 'System'}
                      </span>
                      <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: meta.color + '18', color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{row['user__email']}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{formatTokens(row.total_tokens)} tok</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{timeAgo(row.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color, gradient }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
  gradient: string;
}) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #f1f5f9',
      borderRadius: 16,
      padding: '22px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
}

function SortTh({ label, col, active, dir, onClick }: {
  label: string; col: string; active: string; dir: 'asc' | 'desc'; onClick: () => void;
}) {
  const isActive = active === col;
  return (
    <th style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }} onClick={onClick}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ color: isActive ? '#6366f1' : '#cbd5e1' }}>
          {isActive ? (dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />) : <ArrowDown size={12} />}
        </span>
      </span>
    </th>
  );
}

function UserExpandedDetail({ user, recentUsage }: {
  user: AdminStats['users'][0];
  recentUsage: AdminStats['recent_usage'];
}) {
  const userActivity = recentUsage.filter(r => r.user_id === user.user_id);
  const byType: Record<string, number> = {};
  userActivity.forEach(r => { byType[r.activity_type] = (byType[r.activity_type] || 0) + r.total_tokens; });

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.entries(byType).map(([type, tokens]) => {
          const meta = getActivityMeta(type);
          const Icon = meta.icon;
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: meta.color + '15', border: `1px solid ${meta.color}25` }}>
              <Icon size={13} color={meta.color} />
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>{meta.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{formatTokens(tokens)}</span>
            </div>
          );
        })}
        {Object.keys(byType).length === 0 && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>No recent token usage from this user.</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        Joined: {user.date_joined ? new Date(user.date_joined).toLocaleDateString() : 'Unknown'}
        &nbsp;·&nbsp;
        User ID: {user.user_id}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  sidebar: {
    width: 240,
    minHeight: '100vh',
    background: '#fff',
    borderRight: '1px solid #f1f5f9',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
    zIndex: 10,
    overflowY: 'auto',
  },
  sidebarLogo: {
    padding: '20px 18px',
    borderBottom: '1px solid #f1f5f9',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 38, height: 38, borderRadius: 10,
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  logoTitle: { fontSize: 15, fontWeight: 700, color: '#0f172a' },
  logoSub:   { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  sidebarNav: { flex: 1, padding: '14px 10px', overflowY: 'auto' },
  navLabel: {
    fontSize: 10, fontWeight: 700, color: '#94a3b8',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '0 8px 8px',
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', width: '100%', textAlign: 'left',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 500, transition: 'all 0.15s',
    marginBottom: 2,
  },
  sidebarFooter: { padding: '14px 12px', borderTop: '1px solid #f1f5f9' },
  backBtn: {
    width: '100%', padding: '8px 12px', background: '#f8fafc',
    border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
    fontSize: 12, fontWeight: 500, color: '#64748b', textAlign: 'left',
  },
  main: {
    flex: 1,
    marginLeft: 240,
    padding: '28px 32px',
    maxWidth: 'calc(100vw - 240px)',
  },
  loadingCenter: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh',
  },
  spinner: {
    width: 40, height: 40, borderRadius: '50%',
    border: '3px solid #e2e8f0', borderTop: '3px solid #6366f1',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 28, flexWrap: 'wrap', gap: 16,
  },
  pageTitle: {
    fontSize: 26, fontWeight: 800, color: '#0f172a',
    letterSpacing: '-0.5px', margin: 0,
  },
  pageSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 18, marginBottom: 24,
  },
  chartsRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 18, marginBottom: 24,
  },
  card: {
    background: '#fff',
    border: '1px solid #f1f5f9',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 14, fontWeight: 700, color: '#0f172a',
    marginBottom: 18, margin: '0 0 18px 0',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 16px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
  },
  td: { padding: '12px 16px', borderTop: '1px solid #f8fafc' },
  tr: { transition: 'background 0.15s' },
  dateInput: {
    padding: '6px 10px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 12,
    outline: 'none', background: '#f8fafc', color: '#475569',
  },
  refreshBtn: {
    width: 34, height: 34, borderRadius: 8,
    border: '1px solid #e2e8f0', background: '#f8fafc',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#64748b',
  },
  btnPrimary: {
    padding: '10px 24px', borderRadius: 10,
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600,
  },
};
