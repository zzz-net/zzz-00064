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
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Send,
  ShieldAlert,
  UserCheck,
  UserX,
  Download,
  Undo2,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { Conflict, Technician, TechnicianScheduleItem, ConflictDetail, OrderHistory } from '../../shared/types.js';

const typeLabels: Record<string, { label: string; color: string }> = {
  time_overlap: { label: '时段重叠', color: 'bg-red-100 text-red-700 border-red-200' },
  overtime: { label: '加班冲突', color: 'bg-orange-100 text-orange-700 border-orange-200' },
};

const conflictStatusLabels: Record<string, { label: string; color: string }> = {
  assigned: { label: '已分配', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  confirmed: { label: '已确认', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  approval_pending: { label: '待审批', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approval_rejected: { label: '已驳回', color: 'bg-red-100 text-red-700 border-red-200' },
  resolved: { label: '已解决', color: 'bg-green-100 text-green-700 border-green-200' },
};

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'assigned', label: '已分配' },
  { value: 'confirmed', label: '已确认' },
  { value: 'approval_pending', label: '待审批' },
  { value: 'approval_rejected', label: '已驳回' },
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
  const [conflictDetail, setConflictDetail] = useState<ConflictDetail | null>(null);
  const [scheduleItems, setScheduleItems] = useState<TechnicianScheduleItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [applyReason, setApplyReason] = useState('');
  const [approveRemark, setApproveRemark] = useState('');
  const [rejectRemark, setRejectRemark] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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

      if (statusFilter) {
        params.set('conflictStatus', statusFilter);
      }

      if (technicianFilter) {
        params.set('technicianId', technicianFilter);
      }

      if (dateFrom) {
        params.set('dateFrom', `${dateFrom}T00:00:00.000Z`);
      }

      if (dateTo) {
        params.set('dateTo', `${dateTo}T23:59:59.999Z`);
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
      const res = await api.get(`/conflicts/${conflict.id}`);
      const detail = res.data as ConflictDetail;
      setConflictDetail(detail);
      setScheduleItems(detail?.overlapping_items || []);

      if (detail?.related_order) {
        const historyRes = await api.get(`/orders/${detail.related_order.id}/history`);
        setOrderHistory(historyRes.data || []);
      } else {
        setOrderHistory([]);
      }
    } catch (err) {
      console.error('Failed to load detail:', err);
      setConflictDetail(null);
      setScheduleItems([]);
      setOrderHistory([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApplyForceAssign = async () => {
    if (!selectedConflict || !applyReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/orders/${selectedConflict.order_id}/force-assign-request`, {
        technicianId: selectedConflict.technician_id,
        reason: applyReason,
        conflictId: selectedConflict.id,
      });
      alert('强制派单申请已提交');
      setShowApplyModal(false);
      setApplyReason('');
      loadConflicts();
      if (selectedConflict) loadConflictDetail(selectedConflict);
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!conflictDetail?.related_approval) return;
    setActionLoading(true);
    try {
      await api.put(`/approvals/${conflictDetail.related_approval.id}/approve`, {
        remark: approveRemark,
      });
      alert('审批通过');
      setShowApproveModal(false);
      setApproveRemark('');
      loadConflicts();
      if (selectedConflict) loadConflictDetail(selectedConflict);
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!conflictDetail?.related_approval) return;
    setActionLoading(true);
    try {
      await api.put(`/approvals/${conflictDetail.related_approval.id}/reject`, {
        remark: rejectRemark,
      });
      alert('已驳回');
      setShowRejectModal(false);
      setRejectRemark('');
      loadConflicts();
      if (selectedConflict) loadConflictDetail(selectedConflict);
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!conflictDetail?.related_approval) return;
    if (!confirm('确认撤回该强制派单申请？撤回后可重新发起')) return;
    setActionLoading(true);
    try {
      await api.put(`/approvals/${conflictDetail.related_approval.id}/withdraw`, {
        reason: withdrawReason,
      });
      alert('已撤回申请');
      setShowWithdrawModal(false);
      setWithdrawReason('');
      loadConflicts();
      if (selectedConflict) loadConflictDetail(selectedConflict);
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.set('conflictStatus', statusFilter);
      }
      if (technicianFilter) {
        params.set('technicianId', technicianFilter);
      }
      if (typeFilter) {
        params.set('type', typeFilter);
      }
      if (dateFrom) {
        params.set('dateFrom', `${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        params.set('dateTo', `${dateTo}T23:59:59.999Z`);
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await api.download(`/conflicts/export?${params.toString()}`, `conflicts-${timestamp}.csv`);
    } catch (err: any) {
      alert(err.message || '导出失败');
    }
  };

  const handleReassign = () => {
    if (!selectedConflict) return;
    window.location.href = `/orders/${selectedConflict.order_id}`;
  };

  const handleResolve = async () => {
    if (!selectedConflict) return;
    if (!confirm('确定标记为已解决吗？')) return;
    try {
      await api.put(`/conflicts/${selectedConflict.id}/resolve`);
      loadConflicts();
      if (selectedConflict) loadConflictDetail(selectedConflict);
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
                  <ShieldAlert className="w-4 h-4 text-slate-400" />
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
                  <Calendar className="w-4 h-4 text-slate-400" />
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

                <button
                  onClick={loadConflicts}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm flex items-center gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>

                <button
                  onClick={handleExportCsv}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  导出 CSV
                </button>
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
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            conflict.conflict_status === 'resolved'
                              ? 'bg-green-100'
                              : conflict.conflict_status === 'approval_rejected'
                              ? 'bg-red-100'
                              : conflict.conflict_status === 'approval_pending'
                              ? 'bg-yellow-100'
                              : 'bg-orange-100'
                          }`}
                        >
                          {conflict.conflict_status === 'resolved' ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : conflict.conflict_status === 'approval_rejected' ? (
                            <XCircle className="w-5 h-5 text-red-600" />
                          ) : conflict.conflict_status === 'approval_pending' ? (
                            <ClockIcon className="w-5 h-5 text-yellow-600" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-orange-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
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
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                conflictStatusLabels[conflict.conflict_status || '']?.color
                              }`}
                            >
                              {conflict.conflict_status_label}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {conflict.description}
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              {conflict.technician_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <ClockIcon className="w-3.5 h-3.5" />
                              {formatTime(conflict.scheduled_start_time)} -{' '}
                              {formatTime(conflict.scheduled_end_time)}
                            </span>
                            {conflict.customer_name && (
                              <span className="flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5" />
                                {conflict.customer_name}
                              </span>
                            )}
                          </div>
                          {conflict.approval_remark && (
                            <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                              驳回意见：{conflict.approval_remark}
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="w-[420px] shrink-0">
            {selectedConflict ? (
              <div className="bg-white rounded-xl border border-slate-200 sticky top-6">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">冲突详情</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      conflictStatusLabels[selectedConflict.conflict_status || '']?.color
                    }`}
                  >
                    {selectedConflict.conflict_status_label}
                  </span>
                </div>

                {detailLoading ? (
                  <div className="p-8 text-center text-slate-400">加载中...</div>
                ) : (
                  <>
                    <div className="p-4 space-y-3 border-b border-slate-100 max-h-80 overflow-y-auto">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">工单号</span>
                        <span className="font-medium text-slate-800">
                          {selectedConflict.order_no}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">客户</span>
                        <span className="font-medium text-slate-800">
                          {selectedConflict.customer_name || '-'}
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
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">冲突来源</span>
                        <span className="font-medium text-slate-800">
                          {selectedConflict.conflict_source}
                        </span>
                      </div>
                      <div className="pt-2">
                        <div className="text-sm text-slate-500 mb-1">冲突描述</div>
                        <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                          {selectedConflict.description}
                        </div>
                      </div>
                      {selectedConflict.approval_reason && (
                        <div className="pt-2">
                          <div className="text-sm text-slate-500 mb-1">申请理由</div>
                          <div className="text-sm text-slate-700 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                            {selectedConflict.approval_reason}
                          </div>
                        </div>
                      )}
                      {selectedConflict.applicant_name && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">申请人</span>
                          <span className="font-medium text-slate-800">
                            {selectedConflict.applicant_name}
                          </span>
                        </div>
                      )}
                      {selectedConflict.approval_remark && (
                        <div className="pt-2">
                          <div className="text-sm text-slate-500 mb-1">
                            {selectedConflict.approval_status === 'rejected' ? '驳回意见' : '审批意见'}
                          </div>
                          <div className="text-sm text-slate-700 bg-red-50 p-3 rounded-lg border border-red-200">
                            {selectedConflict.approval_remark}
                          </div>
                        </div>
                      )}
                      {selectedConflict.approver_name && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">审批人</span>
                          <span className="font-medium text-slate-800">
                            {selectedConflict.approver_name}
                          </span>
                        </div>
                      )}
                    </div>

                    {scheduleItems.length > 0 && (
                      <div className="p-4 border-b border-slate-100 max-h-60 overflow-y-auto">
                        <h4 className="font-medium text-slate-800 mb-3 text-sm">
                          同时段安排
                        </h4>
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
                              {item.applicant_name && (
                                <div className="text-xs text-slate-500 mt-1">
                                  申请人: {item.applicant_name}
                                </div>
                              )}
                              {item.approval_remark && (
                                <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                                  驳回意见：{item.approval_remark}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {orderHistory.length > 0 && (
                      <div className="p-4 border-b border-slate-100 max-h-48 overflow-y-auto">
                        <h4 className="font-medium text-slate-800 mb-3 text-sm">
                          操作日志（可追溯）
                        </h4>
                        <div className="space-y-2">
                          {orderHistory.map((h, idx) => (
                            <div key={idx} className="text-xs border-l-2 border-slate-200 pl-3 py-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-700">{h.action}</span>
                                <span className="text-slate-400">{h.operator_name}</span>
                              </div>
                              <div className="text-slate-500 mt-0.5">{formatDateTime(h.created_at)}</div>
                              {h.remark && (
                                <div className="text-slate-600 mt-0.5">{h.remark}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-4 space-y-2">
                      {conflictDetail?.available_actions.can_approve && (
                        <button
                          onClick={() => setShowApproveModal(true)}
                          className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <ThumbsUp className="w-4 h-4" />
                          审批通过
                        </button>
                      )}
                      {conflictDetail?.available_actions.can_reject && (
                        <button
                          onClick={() => setShowRejectModal(true)}
                          className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <ThumbsDown className="w-4 h-4" />
                          驳回申请
                        </button>
                      )}
                      {conflictDetail?.available_actions.can_withdraw && (
                        <button
                          onClick={() => setShowWithdrawModal(true)}
                          className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Undo2 className="w-4 h-4" />
                          撤回申请
                        </button>
                      )}
                      {conflictDetail?.available_actions.can_apply_force_assign && (
                        <button
                          onClick={() => setShowApplyModal(true)}
                          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Send className="w-4 h-4" />
                          发起强制派单申请
                        </button>
                      )}
                      {conflictDetail?.available_actions.can_reassign && (
                        <button
                          onClick={handleReassign}
                          className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          改派（跳转工单）
                        </button>
                      )}
                      {isAdmin && selectedConflict.conflict_status !== 'resolved' && (
                        <button
                          onClick={handleResolve}
                          className="w-full px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          标记为已解决
                        </button>
                      )}
                      {conflictDetail?.available_actions.approval_reason && !conflictDetail.available_actions.can_apply_force_assign && !conflictDetail.available_actions.can_approve && (
                        <div className="text-xs text-orange-700 bg-orange-50 p-3 rounded-lg border border-orange-200">
                          <UserX className="w-4 h-4 inline mr-1" />
                          {conflictDetail.available_actions.approval_reason}
                        </div>
                      )}
                    </div>
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

      {showApplyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">发起强制派单申请</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">申请理由</label>
                <textarea
                  value={applyReason}
                  onChange={(e) => setApplyReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={4}
                  placeholder="请填写强制派单理由..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowApplyModal(false); setApplyReason(''); }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleApplyForceAssign}
                disabled={actionLoading || !applyReason.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? '提交中...' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApproveModal && conflictDetail?.related_approval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">审批通过</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-slate-600">
                工单：<span className="font-medium text-slate-800">{conflictDetail.related_approval.order_no}</span>
              </div>
              <div className="text-sm text-slate-600">
                申请理由：<span className="font-medium text-slate-800">{conflictDetail.related_approval.reason}</span>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">审批意见（可选）</label>
                <textarea
                  value={approveRemark}
                  onChange={(e) => setApproveRemark(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={3}
                  placeholder="请填写审批意见..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowApproveModal(false); setApproveRemark(''); }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '确认通过'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && conflictDetail?.related_approval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">驳回申请</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-slate-600">
                工单：<span className="font-medium text-slate-800">{conflictDetail.related_approval.order_no}</span>
              </div>
              <div className="text-sm text-slate-600">
                申请理由：<span className="font-medium text-slate-800">{conflictDetail.related_approval.reason}</span>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">驳回原因</label>
                <textarea
                  value={rejectRemark}
                  onChange={(e) => setRejectRemark(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  rows={3}
                  placeholder="请填写驳回原因..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowRejectModal(false); setRejectRemark(''); }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectRemark.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '确认驳回'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && conflictDetail?.related_approval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">撤回强制派单申请</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-slate-600">
                工单：<span className="font-medium text-slate-800">{conflictDetail.related_approval.order_no}</span>
              </div>
              <div className="text-sm text-slate-600">
                申请理由：<span className="font-medium text-slate-800">{conflictDetail.related_approval.reason}</span>
              </div>
              <div className="text-xs text-orange-700 bg-orange-50 p-3 rounded-lg border border-orange-200">
                <Undo2 className="w-4 h-4 inline mr-1" />
                撤回后，工单将回到可重新派单或改派的状态，您可再次发起申请。
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">撤回原因（可选）</label>
                <textarea
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                  rows={3}
                  placeholder="请填写撤回原因..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowWithdrawModal(false); setWithdrawReason(''); }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleWithdraw}
                disabled={actionLoading}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '确认撤回'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
