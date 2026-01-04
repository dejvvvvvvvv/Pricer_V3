import React, { useMemo, useState } from 'react';
import Icon from '../../components/AppIcon';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAnalyticsSessions, computeOverview } from '../../utils/adminAnalyticsStorage';
import { getTeamSummary, getSeatLimit } from '../../utils/adminTeamAccessStorage';
import { loadOrders } from '../../utils/adminOrdersStorage';
import { getAuditEntries } from '../../utils/adminAuditLogStorage';
import { readTenantJson } from '../../utils/adminTenantStorage';

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoNowEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'právě teď';
    if (diffMins < 60) return `před ${diffMins} min`;
    if (diffHours < 24) return `před ${diffHours} h`;
    if (diffDays < 7) return `před ${diffDays} dny`;
    return date.toLocaleDateString('cs-CZ');
  } catch {
    return '—';
  }
}

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);

  // Live data from Analytics
  const analyticsOverview = useMemo(() => {
    const fromISO = isoDaysAgo(30);
    const toISO = isoNowEnd();
    return computeOverview({ fromISO, toISO });
  }, [refreshKey]);

  // Live data from Team Access
  const teamSummary = useMemo(() => getTeamSummary(), [refreshKey]);
  const seatLimit = useMemo(() => getSeatLimit(), [refreshKey]);

  // Live data from Orders
  const ordersData = useMemo(() => {
    const allOrders = loadOrders();
    const newOrders = allOrders.filter(o => o.status === 'NEW' || o.status === 'REVIEW').length;
    const totalOrders = allOrders.length;
    return { newOrders, totalOrders };
  }, [refreshKey]);

  // Live data from Parameters
  const parametersData = useMemo(() => {
    const config = readTenantJson('parameters:v1', null);
    if (!config?.parameters) return { activeCount: 0, changedCount: 0 };
    
    const params = Object.values(config.parameters);
    const activeCount = params.filter(p => p?.active_for_slicing).length;
    const changedCount = params.filter(p => p?.default_value_override !== null).length;
    
    return { activeCount, changedCount };
  }, [refreshKey]);

  // Recent activity from Audit Log
  const recentActivity = useMemo(() => {
    const entries = getAuditEntries();
    return entries.slice(0, 5).map(e => ({
      id: e.id,
      text: e.summary || e.action,
      actor: e.actor_email || 'System',
      type: e.action.includes('CREATE') || e.action.includes('ADD') ? 'add' : 'update',
      time: formatTime(e.timestamp),
    }));
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  const statCards = [
    {
      label: language === 'cs' ? 'Kalkulace (30d)' : 'Calculations (30d)',
      value: analyticsOverview.metrics.calculations,
      icon: 'Calculator',
      color: '#2563EB',
      change: `${analyticsOverview.metrics.orders} ${language === 'cs' ? 'objednávek' : 'orders'}`,
    },
    {
      label: language === 'cs' ? 'Objednávky celkem' : 'Total Orders',
      value: ordersData.totalOrders,
      icon: 'ShoppingCart',
      color: '#10B981',
      change: `${ordersData.newOrders} ${language === 'cs' ? 'nových' : 'new'}`,
    },
    {
      label: language === 'cs' ? 'Konverze (30d)' : 'Conversion (30d)',
      value: `${(analyticsOverview.metrics.conversion_rate * 100).toFixed(1)}%`,
      icon: 'TrendingUp',
      color: '#F59E0B',
      change: language === 'cs' ? 'objednávky/kalkulace' : 'orders/calculations',
    },
    {
      label: language === 'cs' ? 'Aktivní uživatelé' : 'Active Users',
      value: teamSummary.activeUsers,
      icon: 'Users',
      color: '#8B5CF6',
      change: `${teamSummary.activeUsers}/${seatLimit} ${language === 'cs' ? 'míst' : 'seats'}`,
    },
    {
      label: language === 'cs' ? 'Aktivní parametry' : 'Active Parameters',
      value: parametersData.activeCount,
      icon: 'Settings',
      color: '#EC4899',
      change: `${parametersData.changedCount} ${language === 'cs' ? 'změn' : 'changed'}`,
    },
  ];

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>{t('admin.dashboard.title')}</h1>
          <p className="subtitle">{t('admin.dashboard.subtitle')}</p>
        </div>
        <button className="btn-refresh" onClick={handleRefresh}>
          <Icon name="RefreshCw" size={18} />
          {t('admin.dashboard.refresh')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
              <Icon name={stat.icon} size={24} />
            </div>
            <div className="stat-content">
              <p className="stat-label">{stat.label}</p>
              <h2 className="stat-value">{stat.value}</h2>
              <p className="stat-change">{stat.change}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="dashboard-section">
        <h3>{language === 'cs' ? 'Poslední aktivita' : 'Recent Activity'}</h3>
        <div className="activity-list">
          {recentActivity.length === 0 ? (
            <p className="empty-state">{language === 'cs' ? 'Žádná aktivita' : 'No activity'}</p>
          ) : (
            recentActivity.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className={`activity-dot ${activity.type}`}></div>
                <div className="activity-content">
                  <p>{activity.text}</p>
                  <span className="activity-time">
                    {activity.actor} • {activity.time}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="dashboard-section">
        <h3>{language === 'cs' ? 'Rychlé statistiky' : 'Quick Stats'}</h3>
        <div className="quick-stats-grid">
          <div className="quick-stat">
            <span className="quick-stat-label">{language === 'cs' ? 'Průměrná cena' : 'Avg Price'}</span>
            <span className="quick-stat-value">{analyticsOverview.metrics.avg_price.toFixed(0)} Kč</span>
          </div>
          <div className="quick-stat">
            <span className="quick-stat-label">{language === 'cs' ? 'Průměrný čas' : 'Avg Time'}</span>
            <span className="quick-stat-value">{analyticsOverview.metrics.avg_time_min.toFixed(1)} min</span>
          </div>
          <div className="quick-stat">
            <span className="quick-stat-label">{language === 'cs' ? 'Pending pozvánek' : 'Pending Invites'}</span>
            <span className="quick-stat-value">{teamSummary.pendingInvites}</span>
          </div>
          <div className="quick-stat">
            <span className="quick-stat-label">{language === 'cs' ? 'Nové objednávky' : 'New Orders'}</span>
            <span className="quick-stat-value">{ordersData.newOrders}</span>
          </div>
        </div>
      </div>

      <style>{`
        .admin-dashboard {
          max-width: 1400px;
          padding: 24px;
          background: #F9FAFB;
          min-height: 100vh;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
        }

        h1 {
          margin: 0 0 8px 0;
          font-size: 32px;
          font-weight: 700;
          color: #111827;
        }

        .subtitle {
          margin: 0;
          font-size: 14px;
          color: #6B7280;
        }

        .btn-refresh {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-refresh:hover {
          background: #F3F4F6;
          border-color: #2563EB;
          color: #2563EB;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #E5E7EB;
          display: flex;
          gap: 16px;
          transition: all 0.2s;
        }

        .stat-card:hover {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .stat-icon {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-content {
          flex: 1;
          min-width: 0;
        }

        .stat-label {
          margin: 0 0 4px 0;
          font-size: 13px;
          color: #6B7280;
          font-weight: 500;
        }

        .stat-value {
          margin: 0 0 4px 0;
          font-size: 28px;
          font-weight: 700;
          color: #111827;
        }

        .stat-change {
          margin: 0;
          font-size: 12px;
          color: #9CA3AF;
        }

        .dashboard-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #E5E7EB;
        }

        .dashboard-section h3 {
          margin: 0 0 20px 0;
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          padding-bottom: 12px;
          border-bottom: 1px solid #E5E7EB;
        }

        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .empty-state {
          text-align: center;
          color: #9CA3AF;
          padding: 20px;
          margin: 0;
        }

        .activity-item {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .activity-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }

        .activity-dot.update {
          background: #3B82F6;
        }

        .activity-dot.add {
          background: #10B981;
        }

        .activity-content {
          flex: 1;
        }

        .activity-content p {
          margin: 0 0 4px 0;
          font-size: 14px;
          color: #374151;
          line-height: 1.6;
        }

        .activity-time {
          font-size: 12px;
          color: #9CA3AF;
        }

        .quick-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .quick-stat {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 16px;
          background: #F9FAFB;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
        }

        .quick-stat-label {
          font-size: 12px;
          color: #6B7280;
          font-weight: 500;
        }

        .quick-stat-value {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
