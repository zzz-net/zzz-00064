import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Filter,
  Calendar,
  User,
  Clock,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock as ClockIcon,
  FileText,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { Conflict, Technician, TechnicianScheduleItem } from '../../shared/types.js';

const typeLabels: Record<string, { label: string; color: string }> = {
  time_overlap: { label: '时段重叠', color: 'bg-red-100 text-red-700 border-red-200' },
  overtime: { label: '加班冲突', color: 'bg-orange-100 text-orange-700 border-orange-200' },
};

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'unresolved', label: '未解决' },
  { value: 'resolved', label: '已解决' },
];

const typeOptions = [
  { value: '', label: '全部类型' },
  { value: 'time_overlap', label: '时段重叠' },
  { value: 'overtime', label: '加班冲突' },
];

const scheduleTypeLabels: Record<string, { label: string; color: string }> = {
  order_assigned: { label: '已分配工单', color: 'bg-blue-100 text-blue-700' },
  order_confirmed: { label: '已确认工单', color: 'bg-indigo-100 text-indigo-700' },
  order_in_progress: { label: '服务中工单', color: 'bg-purple-100 text-purple-700' },
  approval_pending: { label: '待审批申请', color: 'bg-yellow-100 text-yellow-700' },
  approval_rejected: { label: '已驳回申请', color: 'bg-red-100 text-red-700' },
};

export default function ConflictCenter() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [scheduleItems, setScheduleItems] = useState<TechnicianScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState('unresolved');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    loadTechnicians();
  }, []);

  useEffect(() => {
    loadConflicts();
  }, [statusFilter, technicianFilter, dateFrom, dateTo, typeFilter]);

  const loadTechnicians = async () => {
    try {
      const res = await api.get('/technicians?status=active');
      setTechnicians(res.data || []);
    } catch (err) {
      console.error('Failed to load technicians:', err);
    }
  };

  const loadConflicts = async () => {
    setLoading(true);
    try {
      let url = '/conflicts?';
      const params = new URLSearchParams();

      if (statusFilter === 'resolved') {
        params.set('resolved', 'true');
      } else if (statusFilter === 'unresolved') {
        params.set('resolved', 'false');
      }

      if (technicianFilter) {
        params.set('technicianId', technicianFilter);
      }

      if (dateFrom) {
        params.set('dateFrom', `${dateFrom} 00:00:00`);
      }

      if (dateTo) {
        params.set('dateTo', `${dateTo} 23:59:59`);
      }

      if (typeFilter) {
        params.set('type', typeFilter);
      }

      url += params.toString();
      const res = await api.get(url);
      setConflicts(res.data || []);
    } catch (err) {
      console.error('Failed to load conflicts:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadConflictDetail = async (conflict: Conflict) => {
    setSelectedConflict(conflict);
    setDetailLoading(true);
    try {
      if (conflict.technician_id && conflict.scheduled_start_time && conflict.scheduled_end_time) {
        const res = await api.get(
          `/conflicts/technician/${conflict.technician_id}/schedule?startTime=${conflict.scheduled_start_time}&endTime=${conflict.scheduled_end_time}`
        );
        setScheduleItems(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResolve = async (id: number) => {
    if (!confirm('确定标记为已解决吗？')) return;
    try {
      await api.put(`/conflicts/${id}/resolve`);
      loadConflicts();
      if (selectedConflict?.id === id) {
        setSelectedConflict(null);
      }
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const formatDateTime = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">冲突处理中心</h1>
          <p className="text-slate-500 mt-1">查看和处理技师时段冲突</p>
        </div>

        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
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
                  <User className="w-4 h-4 text-slate-400" />
                  <select
                    value={technicianFilter}
                    onChange={(e) => setTechnicianFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">全部技师</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    {typeOptions.map((opt) => (
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
              </div>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
                  <div className="text-slate-400">加载中...</div>
                </div>
              ) : conflicts.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <div className="text-slate-400">暂无冲突记录</div>
                </div>
              ) : (
                conflicts.map((conflict) => (
                  <div
                    key={conflict.id}
                    onClick={() => loadConflictDetail(conflict)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                      selectedConflict?.id === conflict.id
                        ? 'border-blue-500 ring-2 ring-blue-100'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            conflict.resolved
                              ? 'bg-green-100'
                              : 'bg-red-100'
                          }`}
                        >
                          {conflict.resolved ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {conflict.order_no}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                              typeLabels[conflict.type]?.color
                            }`}
                          >
                            {typeLabels[conflict.type]?.label}
                          </span>
                          {conflict.resolved && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              已解决
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {conflict.description}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {conflict.technician_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-3.5 h-3.5" />
                            {formatTime(conflict.scheduled_start_time)} -{' '}
                            {formatTime(conflict.scheduled_end_time)}
                          </span>
                        </div>
                      </div>
                    </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="w-96 shrink-0">
            {selectedConflict ? (
              <div className="bg-white rounded-xl border border-slate-200 sticky top-6">
                <div className="p-4 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800">冲突详情</h3>
                </div>

                {detailLoading ? (
                  <div className="p-8 text-center text-slate-400">加载中...</div>
                ) : (
                  <>
                    <div className="p-4 space-y-3 border-b border-slate-100">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">工单号</span>
                        <span className="font-medium text-slate-800">
                          {selectedConflict.order_no}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">客户</span>
                        <span className="font-medium text-slate-800">
                          {selectedConflict.customer_name}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">技师</span>
                        <span className="font-medium text-slate-800">
                          {selectedConflict.technician_name}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">预约时间</span>
                        <span className="font-medium text-slate-800">
                          {formatDateTime(selectedConflict.scheduled_start_time)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">冲突类型</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                            typeLabels[selectedConflict.type]?.color
                          }`}
                        >
                          {typeLabels[selectedConflict.type]?.label}
                        </span>
                      </div>
                      <div className="pt-2">
                        <div className="text-sm text-slate-500 mb-1">冲突描述</div>
                        <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                          {selectedConflict.description}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border-b border-slate-100">
                      <h4 className="font-medium text-slate-800 mb-3 text-sm">
                        同时段安排
                      </h4>
                      {scheduleItems.length === 0 ? (
                        <div className="text-sm text-slate-400 text-center py-4">
                          暂无安排
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {scheduleItems.map((item) => (
                            <div
                              key={item.id}
                              className="p-3 bg-slate-50 rounded-lg"
                            >
                              <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-slate-800">
                                {item.order_no}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  scheduleTypeLabels[item.type]?.color
                                }`}
                              >
                                {scheduleTypeLabels[item.type]?.label}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatTime(item.scheduled_start_time)} -{' '}
                              {formatTime(item.scheduled_end_time)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {item.customer_name}
                            </div>
                            {item.approval_remark && (
                              <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                                驳回意见：{item.approval_remark}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {!selectedConflict.resolved && isAdmin && (
                    <div className="p-4">
                      <button
                        onClick={() => handleResolve(selectedConflict.id)}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        标记为已解决
                      </button>
                    </div>
                  )}
                </>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-8 sticky top-6">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <div className="text-slate-400 text-sm">点击左侧冲突记录查看详情</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
