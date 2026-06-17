import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  Check,
  X,
  RotateCcw,
  FileText,
  Send,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import {
  Appeal,
  AppealStatus,
  AppealDetail,
  AppealHistory,
  AppealCategory,
  ReturnVisit,
} from '../../shared/types.js';

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待受理', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  accepted: { label: '已受理', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  rejected: { label: '已驳回', color: 'bg-red-100 text-red-700 border-red-200' },
  reassigned: { label: '已转派', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  resolved: { label: '已解决', color: 'bg-green-100 text-green-700 border-green-200' },
  withdrawn: { label: '已撤回', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function Appeals() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor';
  const isCS = user?.role === 'customer_service';
  const canHandle = isAdmin || isSupervisor;

  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AppealStatus | ''>('');
  const [keyword, setKeyword] = useState('');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detail, setDetail] = useState<AppealDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [categories, setCategories] = useState<AppealCategory[]>([]);
  const [visits, setVisits] = useState<ReturnVisit[]>([]);

  const [formVisitId, setFormVisitId] = useState<number | null>(null);
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);
  const [formReason, setFormReason] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');

  const [handleRemark, setHandleRemark] = useState('');
  const [reassignHandlerId, setReassignHandlerId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadAppeals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (keyword) params.append('keyword', keyword);
      const res = await api.get(`/after-sale/appeals${params.toString() ? '?' + params.toString() : ''}`);
      setAppeals(res.data || []);
    } catch (err) {
      console.error('Failed to load appeals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppeals();
  }, [statusFilter, keyword]);

  useEffect(() => {
    const visitId = searchParams.get('visitId');
    if (visitId) {
      loadDataForCreate(parseInt(visitId));
    }
  }, [searchParams]);

  const loadDataForCreate = async (prefillVisitId?: number) => {
    try {
      const [catRes, visitRes] = await Promise.all([
        api.get('/after-sale/categories?enabled=1'),
        api.get('/after-sale/visits?status=completed'),
      ]);
      setCategories(catRes.data || []);
      setVisits(visitRes.data || []);
      if (prefillVisitId) {
        setFormVisitId(prefillVisitId);
      }
      setShowCreateModal(true);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const handleViewDetail = async (id: number) => {
    setDetailLoading(true);
    setHandleRemark('');
    setReassignHandlerId(null);
    try {
      const res = await api.get(`/after-sale/appeals/${id}`);
      setDetail(res.data);
      setShowDetailModal(true);
    } catch (err: any) {
      alert(err.message || '加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formVisitId || !formCategoryId || !formReason.trim()) {
      alert('请填写完整信息');
      return;
    }
    setActionLoading(true);
    try {
      await api.post('/after-sale/appeals', {
        visit_id: formVisitId,
        category_id: formCategoryId,
        reason: formReason,
        image_url: formImageUrl,
      });
      setShowCreateModal(false);
      setFormVisitId(null);
      setFormCategoryId(null);
      setFormReason('');
      setFormImageUrl('');
      await loadAppeals();
    } catch (err: any) {
      alert(err.message || '提交失败');
    } finally {
      setActionLoading(false);
    }
  };

  const doAction = async (action: string, endpoint: string, requireRemark: boolean = false) => {
    if (!detail) return;
    if (requireRemark && !handleRemark.trim()) {
      alert('请填写处理备注');
      return;
    }
    setActionLoading(true);
    try {
      const body: any = { remark: handleRemark };
      if (action === 'reassign' && reassignHandlerId) {
        body.target_handler_id = reassignHandlerId;
      }
      await api.post(`/after-sale/appeals/${detail.appeal.id}/${endpoint}`, body);
      setShowDetailModal(false);
      setHandleRemark('');
      setReassignHandlerId(null);
      await loadAppeals();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = () => {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    api.download(`/after-sale/appeals/export${params}`, `appeals-${Date.now()}.csv`);
  };

  const stats = {
    total: appeals.length,
    pending: appeals.filter(a => a.status === 'pending').length,
    accepted: appeals.filter(a => a.status === 'accepted' || a.status === 'reassigned').length,
    resolved: appeals.filter(a => a.status === 'resolved').length,
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-7 h-7 text-orange-500" />
              申诉处理中心
            </h1>
            <p className="text-slate-500 mt-1">受理、转派、解决客户申诉，记录处理全过程</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-slate-500">全部申诉</div>
            <div className="text-2xl font-bold mt-1">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-yellow-600">待受理</div>
            <div className="text-2xl font-bold mt-1 text-yellow-600">{stats.pending}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-blue-600">处理中</div>
            <div className="text-2xl font-bold mt-1 text-blue-600">{stats.accepted}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-sm text-green-600">已解决</div>
            <div className="text-2xl font-bold mt-1 text-green-600">{stats.resolved}</div>
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
                placeholder="搜索工单号、客户姓名、申诉理由..."
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
            {(isCS || isAdmin || isSupervisor) && (
              <button
                onClick={() => loadDataForCreate()}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm"
              >
                <Plus className="w-4 h-4" />
                提交申诉
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">工单号</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">客户</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">申诉分类</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">提交人</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">处理人</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">截止时间</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {appeals.map((a) => {
                  const st = statusLabels[a.status];
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{a.id}</td>
                      <td className="px-4 py-3 font-mono text-slate-800">{a.order_no}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{a.customer_name}</td>
                      <td className="px-4 py-3 text-slate-600">{a.category_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.submitter_name}</td>
                      <td className="px-4 py-3 text-slate-600">{a.handler_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{a.due_at}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewDetail(a.id)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                          详情
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {appeals.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      暂无申诉记录
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
              <h3 className="text-lg font-bold mb-4">提交申诉</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">关联回访记录 *</label>
                  <select
                    value={formVisitId || ''}
                    onChange={(e) => setFormVisitId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">请选择已完成的回访</option>
                    {visits.map((v) => (
                      <option key={v.id} value={v.id}>
                        #{v.id} {v.order_no} - {v.customer_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">申诉分类 *</label>
                  <select
                    value={formCategoryId || ''}
                    onChange={(e) => setFormCategoryId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">请选择分类</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">申诉理由 *</label>
                  <textarea
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg h-24 resize-none"
                    placeholder="请详细描述申诉内容"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">图片凭证链接</label>
                  <input
                    type="text"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="可选，上传图片后粘贴链接"
                  />
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
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
                >
                  <Send className="w-4 h-4" />
                  {actionLoading ? '提交中...' : '提交申诉'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && detail && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-bold">申诉详情 #{detail.appeal.id}</h3>
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
                    <div className="font-medium font-mono">{detail.appeal.order_no}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">客户</div>
                    <div className="font-medium">{detail.appeal.customer_name}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">申诉分类</div>
                    <div className="font-medium">{detail.appeal.category_name}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">状态</div>
                    <div>
                      {(() => {
                        const st = statusLabels[detail.appeal.status];
                        return (
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.color}`}>
                            {st.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">提交人</div>
                    <div className="font-medium">{detail.appeal.submitter_name}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">处理人</div>
                    <div className="font-medium">{detail.appeal.handler_name || '-'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">提交时间</div>
                    <div className="text-sm">{detail.appeal.submitted_at}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">截止时间</div>
                    <div className="text-sm">{detail.appeal.due_at}</div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="text-xs text-orange-600 font-medium mb-1">申诉理由</div>
                  <div className="text-slate-700 whitespace-pre-wrap">{detail.appeal.reason}</div>
                </div>

                {detail.appeal.image_url && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium mb-1">图片凭证</div>
                    <a href={detail.appeal.image_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm break-all">
                      {detail.appeal.image_url}
                    </a>
                  </div>
                )}

                {detail.appeal.handle_remark && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="text-xs text-green-600 font-medium mb-1">处理备注</div>
                    <div className="text-slate-700 whitespace-pre-wrap">{detail.appeal.handle_remark}</div>
                  </div>
                )}

                {canHandle && (detail.available_actions.can_accept || detail.available_actions.can_reject ||
                  detail.available_actions.can_reassign || detail.available_actions.can_resolve) && (
                  <div className="border rounded-lg p-4 bg-blue-50">
                    <h4 className="font-medium text-blue-700 mb-3">处理操作</h4>
                    <div className="space-y-3">
                      {detail.available_actions.can_reassign && (
                        <div>
                          <label className="block text-sm font-medium mb-1">转派给（可选）</label>
                          <select
                            value={reassignHandlerId || ''}
                            onChange={(e) => setReassignHandlerId(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          >
                            <option value="">请选择处理人</option>
                            <option value="1">系统管理员</option>
                            <option value="4">王主管</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium mb-1">处理备注 {detail.available_actions.can_reject || detail.available_actions.can_resolve ? '*' : ''}</label>
                        <textarea
                          value={handleRemark}
                          onChange={(e) => setHandleRemark(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-none"
                          placeholder="请输入处理说明"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {detail.available_actions.can_accept && (
                          <button
                            onClick={() => doAction('accept', 'accept')}
                            disabled={actionLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-1"
                          >
                            <Check className="w-4 h-4" />
                            受理
                          </button>
                        )}
                        {detail.available_actions.can_reject && (
                          <button
                            onClick={() => doAction('reject', 'reject', true)}
                            disabled={actionLoading || !handleRemark.trim()}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm flex items-center gap-1"
                          >
                            <XCircle className="w-4 h-4" />
                            驳回
                          </button>
                        )}
                        {detail.available_actions.can_reassign && (
                          <button
                            onClick={() => doAction('reassign', 'reassign')}
                            disabled={actionLoading || !reassignHandlerId}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm flex items-center gap-1"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                            转派
                          </button>
                        )}
                        {detail.available_actions.can_resolve && (
                          <button
                            onClick={() => doAction('resolve', 'resolve', true)}
                            disabled={actionLoading || !handleRemark.trim()}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            标记解决
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detail.available_actions.can_withdraw && (
                  <div className="border rounded-lg p-4 bg-slate-50">
                    <h4 className="font-medium text-slate-700 mb-2">撤回申诉</h4>
                    <p className="text-sm text-slate-500 mb-3">只有申诉提交人可以撤回，已驳回或已解决的申诉无法撤回。</p>
                    <button
                      onClick={async () => {
                        const remark = prompt('请输入撤回原因（可选）：');
                        if (remark === null) return;
                        setActionLoading(true);
                        try {
                          await api.post(`/after-sale/appeals/${detail.appeal.id}/withdraw`, { remark });
                          setShowDetailModal(false);
                          await loadAppeals();
                        } catch (err: any) {
                          alert(err.message || '撤回失败');
                        } finally {
                          setActionLoading(false);
                        }
                      }}
                      disabled={actionLoading}
                      className="px-4 py-2 text-slate-700 border rounded-lg hover:bg-slate-100 disabled:opacity-50 text-sm flex items-center gap-1"
                    >
                      <RotateCcw className="w-4 h-4" />
                      撤回申诉
                    </button>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    处理历史
                  </h4>
                  <div className="border rounded-lg divide-y">
                    {detail.histories.map((h: AppealHistory) => (
                      <div key={h.id} className="p-3 flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-orange-500 mt-2 shrink-0" />
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

              <div className="p-4 border-t flex justify-end">
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
      </div>
    </Layout>
  );
}
