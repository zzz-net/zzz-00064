import { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ThumbsUp,
  ThumbsDown,
  X,
  PhoneOff,
  PhoneMissed,
  Ban,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import {
  ReturnVisit,
  ReturnVisitStatus,
  ReturnVisitResult,
  ReturnVisitDetail,
  ReturnVisitHistory,
  Appeal,
  ImportResult,
  WorkOrder,
} from '../../shared/types.js';

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  in_progress: { label: '处理中', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Phone },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  timeout: { label: '已超时', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
  cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: XCircle },
};

const resultLabels: Record<string, { label: string; color: string; icon: any }> = {
  satisfied: { label: '满意', color: 'bg-green-100 text-green-700', icon: ThumbsUp },
  dissatisfied: { label: '不满意', color: 'bg-red-100 text-red-700', icon: ThumbsDown },
  no_answer: { label: '无人接听', color: 'bg-yellow-100 text-yellow-700', icon: PhoneMissed },
  invalid_number: { label: '号码无效', color: 'bg-orange-100 text-orange-700', icon: PhoneOff },
  refused: { label: '拒绝回访', color: 'bg-slate-100 text-slate-700', icon: Ban },
};

export default function ReturnVisits() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor';
  const isCS = user?.role === 'customer_service';
  const canImport = isAdmin;

  const [visits, setVisits] = useState<ReturnVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReturnVisitStatus | ''>('');
  const [keyword, setKeyword] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showImportResult, setShowImportResult] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [detail, setDetail] = useState<ReturnVisitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [formOrderId, setFormOrderId] = useState<number | null>(null);
  const [formTemplateId, setFormTemplateId] = useState<number | null>(null);
  const [formResult, setFormResult] = useState<ReturnVisitResult | ''>('');
  const [formRemark, setFormRemark] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const loadVisits = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (keyword) params.append('keyword', keyword);
      const res = await api.get(`/after-sale/visits${params.toString() ? '?' + params.toString() : ''}`);
      setVisits(res.data || []);
    } catch (err) {
      console.error('Failed to load visits:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedOrders = async () => {
    try {
      const res = await api.get('/orders?status=completed&limit=100');
      setOrders(res.data || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
  };

  useEffect(() => {
    loadVisits();
  }, [statusFilter, keyword]);

  const handleCreate = async () => {
    if (!formOrderId) {
      alert('请选择工单');
      return;
    }
    setActionLoading(true);
    try {
      await api.post('/after-sale/visits', {
        order_id: formOrderId,
        template_id: formTemplateId,
      });
      setShowCreateModal(false);
      setFormOrderId(null);
      setFormTemplateId(null);
      await loadVisits();
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/after-sale/visits/${id}`);
      setDetail(res.data);
      setShowDetailModal(true);
    } catch (err: any) {
      alert(err.message || '加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!detail || !formResult) return;
    setActionLoading(true);
    try {
      await api.post(`/after-sale/visits/${detail.visit.id}/complete`, {
        result: formResult,
        remark: formRemark,
        image_url: formImageUrl,
      });
      setShowDetailModal(false);
      setFormResult('');
      setFormRemark('');
      setFormImageUrl('');
      await loadVisits();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!detail) return;
    const remark = prompt('请输入取消原因：');
    if (remark === null) return;
    try {
      await api.post(`/after-sale/visits/${detail.visit.id}/cancel`, { remark });
      setShowDetailModal(false);
      await loadVisits();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await api.post('/after-sale/visits/import', { csvContent: text });
      setImportResult(res.data);
      setShowImportResult(true);
      await loadVisits();
    } catch (err: any) {
      alert(err.message || '导入失败');
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    api.download(`/after-sale/visits/export${params}`, `return-visits-${Date.now()}.csv`);
  };

  const stats = {
    total: visits.length,
    pending: visits.filter(v => v.status === 'pending').length,
    completed: visits.filter(v => v.status === 'completed').length,
    timeout: visits.filter(v => v.status === 'timeout').length,
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Phone className="w-7 h-7 text-blue-600" />
              回访管理
            </h1>
            <p className="text-slate-500 mt-1">发起、登记售后回访，记录客户反馈</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-slate-500">全部回访</div>
            <div className="text-2xl font-bold mt-1">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-yellow-600">待处理</div>
            <div className="text-2xl font-bold mt-1 text-yellow-600">{stats.pending}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-green-600">已完成</div>
            <div className="text-2xl font-bold mt-1 text-green-600">{stats.completed}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-red-600">已超时</div>
            <div className="text-2xl font-bold mt-1 text-red-600">{stats.timeout}</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索工单号、客户姓名、电话..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <div className="flex-1" />
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-lg hover:bg-slate-50 text-sm"
            >
              <Download className="w-4 h-4" />
              导出CSV
            </button>
            {canImport && (
              <>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 border rounded-lg hover:bg-slate-50 text-sm"
                >
                  <Upload className="w-4 h-4" />
                  导入名单
                </button>
              </>
            )}
            {(isCS || isAdmin || isSupervisor) && (
              <button
                onClick={() => {
                  loadCompletedOrders();
                  setShowCreateModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <Plus className="w-4 h-4" />
                发起回访
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">工单号</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">客户信息</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">回访模板</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">回访结果</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">发起人</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">截止时间</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visits.map((v) => {
                  const st = statusLabels[v.status];
                  const rt = v.result ? resultLabels[v.result] : null;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{v.id}</td>
                      <td className="px-4 py-3 font-mono text-slate-800">{v.order_no}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{v.customer_name}</div>
                        <div className="text-xs text-slate-500">{v.customer_phone}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{v.template_name || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${st.color}`}>
                          <st.icon className="w-3 h-3" />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {rt ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${rt.color}`}>
                            <rt.icon className="w-3 h-3" />
                            {rt.label}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{v.initiator_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{v.due_at}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewDetail(v.id)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                          详情
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visits.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      暂无回访记录
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      加载中...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4">发起回访</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">选择已完成工单 *</label>
                  <select
                    value={formOrderId || ''}
                    onChange={(e) => setFormOrderId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">请选择工单</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_no} - {o.customer_name} ({o.customer_phone})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">回访模板（可选）</label>
                  <select
                    value={formTemplateId || ''}
                    onChange={(e) => setFormTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">不使用模板</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading ? '创建中...' : '确认发起'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && detail && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-bold">回访详情 #{detail.visit.id}</h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">工单号</div>
                    <div className="font-medium font-mono">{detail.visit.order_no}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">客户信息</div>
                    <div className="font-medium">{detail.visit.customer_name}</div>
                    <div className="text-sm text-slate-600">{detail.visit.customer_phone}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">服务类型</div>
                    <div className="font-medium">{detail.visit.service_type || '-'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">回访模板</div>
                    <div className="font-medium">{detail.visit.template_name || '-'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">状态</div>
                    <div>
                      {(() => {
                        const st = statusLabels[detail.visit.status];
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${st.color}`}>
                            <st.icon className="w-3 h-3" />
                            {st.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">回访结果</div>
                    <div>
                      {detail.visit.result ? (() => {
                        const rt = resultLabels[detail.visit.result];
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${rt.color}`}>
                            <rt.icon className="w-3 h-3" />
                            {rt.label}
                          </span>
                        );
                      })() : <span className="text-slate-400">-</span>}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">发起人</div>
                    <div className="font-medium">{detail.visit.initiator_name}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">处理人</div>
                    <div className="font-medium">{detail.visit.handler_name || '-'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">发起时间</div>
                    <div className="text-sm">{detail.visit.initiated_at}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">截止时间</div>
                    <div className="text-sm">{detail.visit.due_at}</div>
                  </div>
                </div>

                {detail.visit.remark && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium mb-1">备注</div>
                    <div className="text-slate-700">{detail.visit.remark}</div>
                  </div>
                )}

                {detail.appeals.length > 0 && (
                  <div>
                    <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                      关联申诉 ({detail.appeals.length})
                    </h4>
                    <div className="space-y-2">
                      {detail.appeals.map((a: Appeal) => (
                        <div key={a.id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">申诉 #{a.id}</span>
                            <span className="text-xs text-slate-500">{a.category_name}</span>
                          </div>
                          <div className="text-sm text-slate-600 mt-1">{a.reason}</div>
                          <button
                            onClick={() => navigate(`/after-sale/appeals`)}
                            className="text-blue-600 text-sm mt-1 hover:underline"
                          >
                            查看申诉详情 →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.available_actions.can_complete && (
                  <div className="border rounded-lg p-4 bg-green-50">
                    <h4 className="font-medium text-green-700 mb-3">登记回访结果</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">回访结果 *</label>
                        <div className="grid grid-cols-5 gap-2">
                          {Object.entries(resultLabels).map(([k, v]) => (
                            <button
                              key={k}
                              onClick={() => setFormResult(k as ReturnVisitResult)}
                              className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                                formResult === k
                                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                                  : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <v.icon className="w-5 h-5" />
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">备注</label>
                        <textarea
                          value={formRemark}
                          onChange={(e) => setFormRemark(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-none"
                          placeholder="请输入回访备注"
                        />
                      </div>
                      {detail.visit.image_required === 1 && (
                        <div>
                          <label className="block text-sm font-medium mb-1">图片凭证 *</label>
                          <input
                            type="text"
                            value={formImageUrl}
                            onChange={(e) => setFormImageUrl(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="请输入图片链接"
                          />
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={handleComplete}
                          disabled={!formResult || actionLoading}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                        >
                          {actionLoading ? '提交中...' : '提交回访结果'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    处理历史
                  </h4>
                  <div className="border rounded-lg divide-y">
                    {detail.histories.map((h: ReturnVisitHistory) => (
                      <div key={h.id} className="p-3 flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-sm">{h.operator_name}</span>
                            <span className="text-xs text-slate-500">{h.created_at}</span>
                          </div>
                          <div className="text-sm text-slate-600 mt-0.5">{h.action}</div>
                          {h.remark && <div className="text-xs text-slate-500 mt-0.5">{h.remark}</div>}
                        </div>
                      </div>
                    ))}
                    {detail.histories.length === 0 && (
                      <div className="p-4 text-center text-slate-400 text-sm">暂无历史记录</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t flex justify-between">
                <div>
                  {detail.available_actions.can_cancel && (
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm"
                    >
                      取消回访
                    </button>
                  )}
                  {detail.available_actions.can_submit_appeal && (
                    <button
                      onClick={() => navigate(`/after-sale/appeals?visitId=${detail.visit.id}`)}
                      className="ml-2 px-4 py-2 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 text-sm"
                    >
                      提交申诉
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-slate-50 text-sm"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportResult && importResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-lg p-6">
              <h3 className="text-lg font-bold mb-4">导入结果</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{importResult.total}</div>
                  <div className="text-xs text-slate-500">总计</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.success}</div>
                  <div className="text-xs text-green-600">成功</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                  <div className="text-xs text-red-600">失败</div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-red-600 mb-2">错误详情：</div>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="p-2 border-b last:border-b-0 text-sm">
                        <span className="text-red-600">行 {e.row}：</span>
                        {e.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowImportResult(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
