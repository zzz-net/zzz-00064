import { useState, useEffect } from 'react';
import {
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

interface Stats {
  pending: number;
  assigned: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    assigned: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [ordersRes, approvalsRes, conflictsRes] = await Promise.all([
        api.get('/orders?limit=5'),
        api.get('/approvals?status=pending'),
        api.get('/conflicts?resolved=false'),
      ]);

      const allOrders = await api.get('/orders');
      
      const orderList = allOrders.data || [];
      setStats({
        pending: orderList.filter((o: any) => o.status === 'pending').length,
        assigned: orderList.filter((o: any) => o.status === 'assigned').length,
        confirmed: orderList.filter((o: any) => o.status === 'confirmed').length,
        inProgress: orderList.filter((o: any) => o.status === 'in_progress').length,
        completed: orderList.filter((o: any) => o.status === 'completed').length,
        cancelled: orderList.filter((o: any) => o.status === 'cancelled').length,
      });

      setRecentOrders(ordersRes.data || []);
      setPendingApprovals(approvalsRes.data || []);
      setConflicts(conflictsRes.data || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
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

  const statCards = [
    { label: '待分配', value: stats.pending, icon: Clock, color: 'from-yellow-500 to-yellow-600', bg: 'bg-yellow-50' },
    { label: '已确认', value: stats.confirmed + stats.assigned, icon: ClipboardList, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50' },
    { label: '服务中', value: stats.inProgress, icon: AlertTriangle, color: 'from-purple-500 to-purple-600', bg: 'bg-purple-50' },
    { label: '已完成', value: stats.completed, icon: CheckCircle, color: 'from-green-500 to-green-600', bg: 'bg-green-50' },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">工作台</h1>
            <p className="text-slate-500 mt-1">欢迎回来，今天是 {new Date().toLocaleDateString('zh-CN')}</p>
          </div>
          <button
            onClick={() => navigate('/orders/new')}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            创建工单
          </button>
        </div>

        <div className="grid grid-cols-4 gap-5">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`${card.bg} rounded-xl p-5 border border-slate-200/50 hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-600">{card.label}</p>
                    <p className="text-3xl font-bold text-slate-800 mt-2">{card.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">最近工单</h2>
              <button
                onClick={() => navigate('/orders')}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                查看全部 <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {recentOrders.length === 0 ? (
                <div className="text-center py-8 text-slate-400">暂无工单</div>
              ) : (
                recentOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{order.order_no}</div>
                        <div className="text-sm text-slate-500">{order.customer_name} - {order.service_type}</div>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusLabels[order.status]?.color}`}>
                      {statusLabels[order.status]?.label}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">待审批</h2>
                {pendingApprovals.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                    {pendingApprovals.length}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {pendingApprovals.length === 0 ? (
                  <div className="text-center py-4 text-slate-400 text-sm">暂无待审批</div>
                ) : (
                  pendingApprovals.slice(0, 3).map((approval) => (
                    <div
                      key={approval.id}
                      onClick={() => navigate('/approvals')}
                      className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 cursor-pointer hover:bg-yellow-100 transition-colors"
                    >
                      <div className="text-sm font-medium text-yellow-800">
                        {approval.type === 'reassign' ? '改派申请' : approval.type === 'force_assign' ? '强制派单' : '加班申请'}
                      </div>
                      <div className="text-xs text-yellow-600 mt-1">
                        {approval.applicant_name} - {approval.order_no}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">冲突预警</h2>
                {conflicts.length > 0 && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs font-medium rounded-full">
                    {conflicts.length}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {conflicts.length === 0 ? (
                  <div className="text-center py-4 text-slate-400 text-sm">暂无冲突</div>
                ) : (
                  conflicts.slice(0, 3).map((conflict) => (
                    <div
                      key={conflict.id}
                      className="p-3 rounded-lg bg-orange-50 border border-orange-200"
                    >
                      <div className="text-sm font-medium text-orange-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {conflict.type === 'time_overlap' ? '时段重叠' : '加班冲突'}
                      </div>
                      <div className="text-xs text-orange-600 mt-1">{conflict.description}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
