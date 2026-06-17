import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  RotateCcw,
  Send,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { WorkOrder, OrderHistory, Technician, AssignCheckResult, TechnicianScheduleItem } from '../../shared/types.js';

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待分配', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  assigned: { label: '已分配', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  confirmed: { label: '已确认', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  in_progress: { label: '服务中', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const actionLabels: Record<string, string> = {
  create: '创建工单',
  assign: '分配技师',
  confirm: '确认工单',
  start_progress: '开始服务',
  complete: '完成工单',
  cancel: '取消工单',
  reassign: '改派技师',
  apply_reassign: '申请改派',
  reassign_approved: '改派审批通过',
  force_assign: '强制派单',
  apply_force_assign: '申请强制派单',
  conflict_resolved: '冲突已处理',
  approval_rejected_reassign: '改派审批驳回',
  approval_rejected_force_assign: '强制派单审批驳回',
  approval_rejected_overtime: '加班审批驳回',
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [history, setHistory] = useState<OrderHistory[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignTechnician, setReassignTechnician] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assignCheckResult, setAssignCheckResult] = useState<AssignCheckResult | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [forceAssignReason, setForceAssignReason] = useState('');
  const [showForceAssignInput, setShowForceAssignInput] = useState(false);

  useEffect(() => {
    if (id) {
      loadOrderData();
      loadTechnicians();
    }
  }, [id]);

  const loadOrderData = async () => {
    try {
      const [orderRes, historyRes] = await Promise.all([
        api.get(`/orders/${id}`),
        api.get(`/orders/${id}/history`),
      ]);
      setOrder(orderRes.data);
      setHistory(historyRes.data || []);
    } catch (err) {
      console.error('Failed to load order:', err);
    }
  };

  const loadTechnicians = async () => {
    try {
      const res = await api.get('/technicians?status=active');
      setTechnicians(res.data || []);
    } catch (err) {
      console.error('Failed to load technicians:', err);
    }
  };

  const checkAssignConflict = async (technicianId: number) => {
    if (!id || !technicianId) return;
    setCheckingConflict(true);
    setAssignCheckResult(null);
    try {
      const res = await api.get(`/conflicts/check-assign/${id}/${technicianId}`);
      setAssignCheckResult(res.data);
    } catch (err: any) {
      console.error('Failed to check conflict:', err);
    } finally {
      setCheckingConflict(false);
    }
  };

  const handleTechnicianSelect = (techId: string) => {
    setSelectedTechnician(techId);
    setError('');
    setShowForceAssignInput(false);
    setForceAssignReason('');
    if (techId) {
      checkAssignConflict(parseInt(techId));
    } else {
      setAssignCheckResult(null);
    }
  };

  const handleAssign = async () => {
    if (!selectedTechnician) {
      setError('请选择技师');
      return;
    }

    if (assignCheckResult && !assignCheckResult.can_assign) {
      setError('该技师在此时段存在冲突，请申请强制派单或更换技师');
      return;
    }

    setLoading(true);
    try {
      await api.put(`/orders/${id}/assign`, {
        technicianId: parseInt(selectedTechnician),
      });
      setShowAssignModal(false);
      setSelectedTechnician('');
      setAssignCheckResult(null);
      loadOrderData();
    } catch (err: any) {
      if (err.response?.conflict_detail) {
        setAssignCheckResult(err.response.conflict_detail);
      }
      setError(err.message || '分配失败');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirm('确认该工单吗？')) return;
    try {
      await api.put(`/orders/${id}/confirm`);
      loadOrderData();
    } catch (err: any) {
      alert(err.message || '确认失败');
    }
  };

  const handleStart = async () => {
    if (!confirm('开始上门服务？')) return;
    try {
      await api.put(`/orders/${id}/start`);
      loadOrderData();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleComplete = async () => {
    if (!confirm('确认完成工单？')) return;
    try {
      await api.put(`/orders/${id}/complete`);
      loadOrderData();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleCancel = async () => {
    if (!cancelReason) {
      alert('请填写取消原因');
      return;
    }
    try {
      await api.put(`/orders/${id}/cancel`, { reason: cancelReason });
      setShowCancelModal(false);
      setCancelReason('');
      loadOrderData();
    } catch (err: any) {
      alert(err.message || '取消失败');
    }
  };

  const handleReassign = async () => {
    if (!reassignReason) {
      alert('请填写改派原因');
      return;
    }

    try {
      const body: any = { reason: reassignReason };
      if (reassignTechnician) {
        body.technicianId = parseInt(reassignTechnician);
      }
      await api.put(`/orders/${id}/reassign`, body);
      setShowReassignModal(false);
      setReassignReason('');
      setReassignTechnician('');
      loadOrderData();
      alert(reassignTechnician ? '改派成功' : '改派申请已提交，等待审批');
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleForceAssign = async () => {
    if (!selectedTechnician) {
      alert('请选择技师');
      return;
    }

    if (!showForceAssignInput) {
      setShowForceAssignInput(true);
      return;
    }

    if (!forceAssignReason.trim()) {
      alert('请输入强制派单理由');
      return;
    }

    setLoading(true);
    try {
      if (isAdmin) {
        await api.put(`/orders/${id}/force-assign`, {
          technicianId: parseInt(selectedTechnician),
          reason: forceAssignReason,
        });
        setShowAssignModal(false);
        setSelectedTechnician('');
        setAssignCheckResult(null);
        setShowForceAssignInput(false);
        setForceAssignReason('');
        loadOrderData();
        alert('强制派单成功');
      } else {
        await api.post(`/orders/${id}/force-assign-request`, {
          technicianId: parseInt(selectedTechnician),
          reason: forceAssignReason,
        });
        setShowAssignModal(false);
        setSelectedTechnician('');
        setAssignCheckResult(null);
        setShowForceAssignInput(false);
        setForceAssignReason('');
        loadOrderData();
        alert('强制派单申请已提交，等待管理员审批');
      }
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const formatAssignTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  if (!order) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  const canAssign = order.status === 'pending';
  const canConfirm = order.status === 'assigned';
  const canStart = order.status === 'confirmed';
  const canComplete = order.status === 'in_progress' || order.status === 'confirmed';
  const canCancel = order.status !== 'completed' && order.status !== 'cancelled';
  const canReassign = order.status === 'assigned' || order.status === 'confirmed';

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/orders')}
            className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">工单详情</h1>
            <p className="text-slate-500">{order.order_no}</p>
          </div>
          <span className={`ml-4 px-3 py-1 rounded-full text-sm font-medium border ${statusLabels[order.status]?.color}`}>
            {statusLabels[order.status]?.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">客户信息</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-slate-400" />
                  <div>
                    <div className="text-sm text-slate-500">客户姓名</div>
                    <div className="font-medium text-slate-800">{order.customer_name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-slate-400" />
                  <div>
                    <div className="text-sm text-slate-500">联系电话</div>
                    <div className="font-medium text-slate-800">{order.customer_phone || '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-slate-400" />
                  <div>
                    <div className="text-sm text-slate-500">服务地址</div>
                    <div className="font-medium text-slate-800">{order.customer_address || '未填写'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">服务信息</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-slate-500 mb-1">服务类型</div>
                  <div className="font-medium text-slate-800">{order.service_type}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500 mb-1">问题描述</div>
                  <div className="text-slate-700">{order.description || '无'}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-sm text-slate-500 mb-1">预约开始时间</div>
                    <div className="font-medium text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      {formatDateTime(order.scheduled_start_time)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-sm text-slate-500 mb-1">预约结束时间</div>
                    <div className="font-medium text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-green-500" />
                      {formatDateTime(order.scheduled_end_time)}
                    </div>
                  </div>
                </div>
                {order.cancel_reason && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <div className="text-sm text-red-600 mb-1">取消原因</div>
                    <div className="text-red-700">{order.cancel_reason}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">操作历史</h3>
              <div className="space-y-4">
                {history.map((item, index) => (
                  <div key={item.id} className="relative pl-8 pb-4">
                    {index < history.length - 1 && (
                      <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-200" />
                    )}
                    <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                    <div className="font-medium text-slate-800">
                      {actionLabels[item.action] || item.action}
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {item.operator_name} · {formatDateTime(item.created_at)}
                    </div>
                    {item.remark && (
                      <div className="mt-1 text-sm text-slate-600 p-2 bg-slate-50 rounded">
                        {item.remark}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">负责技师</h3>
              {order.technician_name ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-800">{order.technician_name}</div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-sm">暂未分配技师</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">工单操作</h3>
              <div className="space-y-3">
                {canAssign && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    分配技师
                  </button>
                )}
                {canConfirm && (
                  <button
                    onClick={handleConfirm}
                    className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    确认工单
                  </button>
                )}
                {canStart && (
                  <button
                    onClick={handleStart}
                    className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    开始服务
                  </button>
                )}
                {canComplete && (
                  <button
                    onClick={handleComplete}
                    className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    完成工单
                  </button>
                )}
                {canReassign && (
                  <button
                    onClick={() => setShowReassignModal(true)}
                    className="w-full px-4 py-2.5 border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    申请改派
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full px-4 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    取消工单
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">创建信息</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">创建人</span>
                  <span className="text-slate-700">{order.created_by_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">创建时间</span>
                  <span className="text-slate-700">{formatDateTime(order.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">更新时间</span>
                  <span className="text-slate-700">{formatDateTime(order.updated_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showAssignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">分配技师</h3>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">选择技师</label>
                <select
                  value={selectedTechnician}
                  onChange={(e) => handleTechnicianSelect(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">请选择技师</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name} - {tech.skill}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTechnician && checkingConflict && (
                <div className="mb-5 p-4 bg-slate-50 rounded-lg text-center text-slate-500 text-sm">
                  正在检查时段冲突...
                </div>
              )}

              {selectedTechnician && !checkingConflict && assignCheckResult && (
                <div className="mb-5 space-y-4">
                  {!assignCheckResult.can_assign && assignCheckResult.conflicts.length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-red-800">检测到时段冲突</div>
                          <div className="text-sm text-red-600 mt-1">
                            {assignCheckResult.conflicts[0]?.available_actions.approval_reason ||
                              '该技师在该时段已有安排'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="text-sm font-medium text-red-700">冲突来源：</div>
                        {assignCheckResult.conflicts.map((conflict, idx) => (
                          <div key={idx} className="space-y-1">
                            {conflict.overlapping_items.map((item) => (
                              <div
                                key={item.id}
                                className="text-sm bg-white p-2 rounded border border-red-100 flex justify-between items-center"
                              >
                                <div>
                                  <span className="font-medium text-slate-800">
                                    {item.order_no}
                                  </span>
                                  <span className="ml-2 text-xs text-slate-500">
                                    {item.customer_name}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      item.type.startsWith('order_')
                                        ? 'bg-blue-100 text-blue-700'
                                        : item.type === 'approval_pending'
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {item.status_label}
                                  </span>
                                  <div className="text-xs text-slate-500 mt-1">
                                    {formatAssignTime(item.scheduled_start_time)} -{' '}
                                    {formatAssignTime(item.scheduled_end_time)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 pt-3 border-t border-red-200">
                        <div className="text-sm font-medium text-red-700 mb-2">
                          可选处理动作：
                        </div>
                        <div className="space-y-1 text-sm text-red-600">
                          <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          改派其他技师
                        </div>
                          {assignCheckResult.conflicts[0]?.available_actions
                            .can_apply_force_assign && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              申请强制派单（需主管审批）
                            </div>
                          )}
                          {assignCheckResult.conflicts[0]?.available_actions
                            .can_force_assign && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              直接强制派单（您是主管）
                            </div>
                          )}
                          {!assignCheckResult.conflicts[0]?.available_actions
                            .can_apply_force_assign &&
                            !assignCheckResult.conflicts[0]?.available_actions
                              .can_force_assign && (
                              <div className="flex items-center gap-2 text-red-500">
                                <XCircle className="w-4 h-4" />
                                不可申请强制派单（已有驳回记录）
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  )}

                  {assignCheckResult.schedule_items.length > 0 && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-sm font-medium text-blue-800 mb-2">
                      该技师同时段安排（共 {assignCheckResult.schedule_items.length} 项
                    </div>
                      <div className="space-y-2">
                        {assignCheckResult.schedule_items.map((item) => (
                          <div
                            key={item.id}
                            className="text-sm bg-white p-2 rounded border border-blue-100 flex justify-between items-center"
                          >
                            <div>
                              <span className="font-medium text-slate-800">
                                {item.order_no}
                              </span>
                              <span className="ml-2 text-xs text-slate-500">
                                {item.customer_name}
                              </span>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  item.type.startsWith('order_')
                                    ? 'bg-blue-100 text-blue-700'
                                    : item.type === 'approval_pending'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {item.status_label}
                              </span>
                              <div className="text-xs text-slate-500 mt-1">
                                {formatAssignTime(item.scheduled_start_time)} -{' '}
                                {formatAssignTime(item.scheduled_end_time)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {assignCheckResult.can_assign &&
                    assignCheckResult.schedule_items.length === 0 && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-700">该时段无冲突，可以分配</span>
                      </div>
                    )}
                </div>
              )}

              {showForceAssignInput && (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    强制派单理由
                  </label>
                  <textarea
                    value={forceAssignReason}
                    onChange={(e) => setForceAssignReason(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
                    placeholder="请填写强制派单理由..."
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedTechnician('');
                    setError('');
                    setAssignCheckResult(null);
                    setShowForceAssignInput(false);
                    setForceAssignReason('');
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAssign}
                  disabled={loading || !assignCheckResult?.can_assign}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '分配中...' : '确认分配'}
                </button>
              </div>

              {selectedTechnician &&
                assignCheckResult &&
                !assignCheckResult.can_assign &&
                assignCheckResult.conflicts[0]?.available_actions
                  .can_apply_force_assign &&
                !isAdmin && (
                  <button
                    onClick={handleForceAssign}
                    disabled={loading}
                    className="w-full mt-3 px-4 py-2.5 text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                  >
                    {showForceAssignInput ? '提交强制派单申请' : '申请强制派单'}
                  </button>
                )}

              {selectedTechnician &&
                assignCheckResult &&
                !assignCheckResult.can_assign &&
                assignCheckResult.conflicts[0]?.available_actions
                  .can_force_assign &&
                isAdmin && (
                  <button
                    onClick={handleForceAssign}
                    disabled={loading}
                    className="w-full mt-3 px-4 py-2.5 text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                  >
                    {showForceAssignInput ? '确认强制派单' : '强制派单'}
                  </button>
                )}
            </div>
          </div>
        )}

        {showCancelModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">取消工单</h3>
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">取消原因</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  placeholder="请填写取消原因"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelReason('');
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  确认取消
                </button>
              </div>
            </div>
          </div>
        )}

        {showReassignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">申请改派</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">改派原因</label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  placeholder="请填写改派原因"
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  指定新技师（可选，不指定则进入审批流程）
                </label>
                <select
                  value={reassignTechnician}
                  onChange={(e) => setReassignTechnician(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">不指定，等待审批</option>
                  {technicians
                    .filter((t) => t.id !== order?.technician_id)
                    .map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name} - {tech.skill}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowReassignModal(false);
                    setReassignReason('');
                    setReassignTechnician('');
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleReassign}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  提交申请
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
