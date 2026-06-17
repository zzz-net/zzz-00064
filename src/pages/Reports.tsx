import { useState, useEffect } from 'react';
import { Download, Calendar, Users, ClipboardCheck, XCircle, Clock } from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';

interface DailyReport {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  technicianStats: {
    technicianId: number;
    technicianName: string;
    completedCount: number;
    totalWorkHours: number;
  }[];
}

export default function Reports() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, [date]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const [reportRes, ordersRes] = await Promise.all([
        api.get(`/reports/daily?date=${date}`),
        api.get(`/reports/daily/orders?date=${date}`),
      ]);
      setReport(reportRes.data);
      setOrders(ordersRes.data || []);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const filename = `daily-report-${date}.csv`;
      await api.download(`/reports/daily/export?date=${date}`, filename);
    } catch (err: any) {
      alert('导出失败：' + (err.message || '未知错误'));
    }
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '待分配', color: 'bg-yellow-100 text-yellow-700' },
    assigned: { label: '已分配', color: 'bg-blue-100 text-blue-700' },
    confirmed: { label: '已确认', color: 'bg-indigo-100 text-indigo-700' },
    in_progress: { label: '服务中', color: 'bg-purple-100 text-purple-700' },
    completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
    cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-700' },
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statCards = report
    ? [
        {
          label: '总工单数',
          value: report.totalOrders,
          icon: ClipboardCheck,
          color: 'from-blue-500 to-blue-600',
          bg: 'bg-blue-50',
        },
        {
          label: '已完成',
          value: report.completedOrders,
          icon: Users,
          color: 'from-green-500 to-green-600',
          bg: 'bg-green-50',
        },
        {
          label: '已取消',
          value: report.cancelledOrders,
          icon: XCircle,
          color: 'from-red-500 to-red-600',
          bg: 'bg-red-50',
        },
        {
          label: '待处理',
          value: report.pendingOrders + report.inProgressOrders,
          icon: Clock,
          color: 'from-yellow-500 to-yellow-600',
          bg: 'bg-yellow-50',
        },
      ]
    : [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">日报导出</h1>
            <p className="text-slate-500 mt-1">查看和导出每日工单统计</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleExport}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出 CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-5">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`${card.bg} rounded-xl p-5 border border-slate-200/50`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-600">{card.label}</p>
                    <p className="text-3xl font-bold text-slate-800 mt-2">{card.value}</p>
                  </div>
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">工单明细</h3>
            {loading ? (
              <div className="text-center py-8 text-slate-400">加载中...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">当日暂无工单</div>
            ) : (
              <div className="overflow-auto max-h-96">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-600">
                        工单号
                      </th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-600">
                        客户
                      </th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-600">
                        服务类型
                      </th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-600">
                        技师
                      </th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-600">
                        状态
                      </th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-600">
                        预约时间
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-slate-100">
                        <td className="py-3 px-3 text-sm font-medium text-slate-700">
                          {order.order_no}
                        </td>
                        <td className="py-3 px-3 text-sm text-slate-600">
                          {order.customer_name}
                        </td>
                        <td className="py-3 px-3 text-sm text-slate-600">
                          {order.service_type}
                        </td>
                        <td className="py-3 px-3 text-sm text-slate-600">
                          {order.technician_name || '-'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusLabels[order.status]?.color}`}
                          >
                            {statusLabels[order.status]?.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-sm text-slate-500">
                          {formatDateTime(order.scheduled_start_time)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">技师工作量统计</h3>
            {loading ? (
              <div className="text-center py-8 text-slate-400">加载中...</div>
            ) : report?.technicianStats.length === 0 ? (
              <div className="text-center py-8 text-slate-400">暂无数据</div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const maxCount = Math.max(
                    1,
                    ...(report?.technicianStats.map((s) => s.completedCount) || [1])
                  );
                  return (
                    report?.technicianStats.map((stat) => (
                      <div
                        key={stat.technicianId}
                        className="p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-slate-700">
                            {stat.technicianName}
                          </span>
                          <span className="text-sm text-slate-500">
                            {stat.completedCount} 单
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (stat.completedCount / maxCount) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          总工时：{stat.totalWorkHours} 小时
                        </div>
                      </div>
                    ))
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
