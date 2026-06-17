import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Clock, MapPin, Phone } from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { WorkOrder, OrderStatus } from '../../shared/types.js';

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待分配' },
  { value: 'assigned', label: '已分配' },
  { value: 'confirmed', label: '已确认' },
  { value: 'in_progress', label: '服务中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待分配', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  assigned: { label: '已分配', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  confirmed: { label: '已确认', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  in_progress: { label: '服务中', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export default function Orders() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, [status, search, dateFrom, dateTo]);

  const loadOrders = async () => {
    try {
      let url = '/orders?';
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', `${dateFrom} 00:00:00`);
      if (dateTo) params.set('dateTo', `${dateTo} 23:59:59`);
      url += params.toString();

      const res = await api.get(url);
      setOrders(res.data || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">工单列表</h1>
            <p className="text-slate-500 mt-1">查看和管理所有工单</p>
          </div>
          <button
            onClick={() => navigate('/orders/new')}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            创建工单
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <span className="text-slate-400">至</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索工单号、客户名、服务类型..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <div className="text-slate-400">暂无工单数据</div>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <Clock className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-800">{order.order_no}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusLabels[order.status]?.color}`}>
                          {statusLabels[order.status]?.label}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-700">
                        <span className="font-medium">{order.customer_name}</span>
                        <span className="mx-2 text-slate-300">|</span>
                        <span>{order.service_type}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {order.customer_phone || '-'}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {order.customer_address || '未填写地址'}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        预约时间：{formatDateTime(order.scheduled_start_time)} -{' '}
                        {formatDateTime(order.scheduled_end_time)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {order.technician_name ? (
                      <div>
                        <div className="text-sm text-slate-500">负责技师</div>
                        <div className="font-medium text-slate-700">{order.technician_name}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">暂未分配</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
