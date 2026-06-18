import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Eye,
  Check,
  X,
  Clock,
  FileText,
  User,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Ban,
  Send,
  Filter,
  ChevronDown,
  Tag,
  BookOpen,
  History,
  Power,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { knowledgeApi } from '@/lib/knowledgeApi';
import { useAuthStore } from '@/store/useAuthStore';
import {
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeEntryDetail,
  KnowledgeVersion,
  KnowledgeStatus,
} from '../../shared/types.js';

const statusLabels: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: '草稿', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  pending_review: { label: '待审核', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  published: { label: '已发布', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500' },
  disabled: { label: '已停用', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
  archived: { label: '已归档', color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
};

const matchedByLabels: Record<string, string> = {
  strong: '强匹配',
  keyword: '关键词',
  category: '分类',
};

interface ReviewStats {
  pending_review: number;
  published: number;
  rejected: number;
  disabled: number;
}

const emptyStats: ReviewStats = { pending_review: 0, published: 0, rejected: 0, disabled: 0 };

export default function KnowledgeReview() {
  const { user } = useAuthStore();

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [stats, setStats] = useState<ReviewStats>(emptyStats);

  const [filterStatus, setFilterStatus] = useState<string>('pending_review');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [loading, setLoading] = useState(false);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState<KnowledgeEntryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [rejectRemark, setRejectRemark] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterCategory) params.set('category_id', filterCategory);
      if (filterKeyword) params.set('keyword', filterKeyword);
      const [entriesRes, catRes, statsRes] = await Promise.all([
        (async () => {
          try {
            const status = filterStatus ? (filterStatus as KnowledgeStatus) : undefined;
            const category_id = filterCategory ? parseInt(filterCategory) : undefined;
            const keyword = filterKeyword || undefined;
            return await knowledgeApi.entries.list({ status, category_id, keyword });
          } catch {
            return { data: [] };
          }
        })(),
        knowledgeApi.categories.list(),
        (async () => {
          try {
            return await knowledgeApi.entriesStats.get();
          } catch {
            return { data: emptyStats };
          }
        })(),
      ]);
      setEntries(entriesRes.data || []);
      setCategories(catRes.data || []);
      const statsData: any = statsRes.data || emptyStats;
      setStats({
        pending_review: statsData.pending_review || 0,
        published: statsData.published || 0,
        rejected: statsData.rejected || 0,
        disabled: statsData.disabled || 0,
      });
    } catch (err) {
      console.error('Failed to load review data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const handleSearch = () => {
    loadData();
  };

  const handleResetFilter = () => {
    setFilterStatus('pending_review');
    setFilterCategory('');
    setFilterKeyword('');
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const openDetailModal = async (id: number) => {
    setDetailLoading(true);
    setShowDetailModal(true);
    try {
      const res = await knowledgeApi.entries.detail(id);
      setDetailData(res.data || null);
    } catch (err: any) {
      alert(err.message || '获取详情失败');
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('确认审核通过并发布该条目？发布后将对客服人员可见。')) return;
    setActionLoading(true);
    try {
      await knowledgeApi.entries.approve(id);
      alert('已审核通过并发布');
      setShowDetailModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = () => {
    setRejectRemark('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectRemark.trim()) {
      alert('请填写驳回备注，帮助编辑者了解修改方向');
      return;
    }
    setActionLoading(true);
    try {
      if (detailData) {
        await knowledgeApi.entries.reject(detailData.entry.id, { remark: rejectRemark });
        alert('已驳回');
        setShowRejectModal(false);
        setShowDetailModal(false);
        await loadData();
      }
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchApprove = async () => {
    const pending = entries.filter((e) => e.status === 'pending_review');
    if (pending.length === 0) {
      alert('当前列表中没有待审核的条目');
      return;
    }
    if (!confirm(`确认批量通过当前列表中 ${pending.length} 条待审核条目？`)) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/knowledge/reviews/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pending.map((e) => e.id) }),
      });
      const data: any = (await res.json()) || {};
      if (!res.ok) throw new Error(data.message || '批量操作失败');
      alert(`批量审核完成：成功 ${data.success || 0} 条，失败 ${data.failed || 0} 条`);
      await loadData();
    } catch (err: any) {
      alert(err.message || '批量操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const statCards = useMemo(() => [
    {
      key: 'pending_review',
      label: '待审核',
      value: stats.pending_review,
      icon: Clock,
      gradient: 'from-yellow-500 to-amber-500',
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      status: 'pending_review',
    },
    {
      key: 'published',
      label: '已发布',
      value: stats.published,
      icon: Check,
      gradient: 'from-green-500 to-emerald-500',
      bg: 'bg-green-50',
      text: 'text-green-700',
      status: 'published',
    },
    {
      key: 'rejected',
      label: '已驳回',
      value: stats.rejected,
      icon: Ban,
      gradient: 'from-red-500 to-rose-500',
      bg: 'bg-red-50',
      text: 'text-red-700',
      status: 'rejected',
    },
    {
      key: 'disabled',
      label: '已停用',
      value: stats.disabled,
      icon: Power,
      gradient: 'from-slate-500 to-slate-600',
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      status: 'disabled',
    },
  ], [stats]);

  const entry = detailData?.entry;
  const actions = detailData?.available_actions;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-indigo-600" />
              审核中心
            </h1>
            <p className="text-slate-500 mt-1">审核和管理知识库条目的发布状态</p>
          </div>
          <div className="flex gap-2">
            {filterStatus === 'pending_review' && (
              <button
                onClick={handleBatchApprove}
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                批量通过
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            const isActive = filterStatus === card.status;
            return (
              <button
                key={card.key}
                onClick={() => setFilterStatus(card.status)}
                className={`text-left rounded-xl border p-4 transition-all ${
                  isActive
                    ? 'border-blue-400 ring-2 ring-blue-100 bg-white shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-slate-600'}`}>
                      {card.label}
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${card.text}`}>{card.value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                {isActive && (
                  <div className="mt-2 pt-2 border-t border-blue-100 flex items-center gap-1 text-xs text-blue-600">
                    <Filter className="w-3 h-3" /> 正在筛选此状态
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">状态</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">全部状态</option>
                <option value="pending_review">待审核</option>
                <option value="published">已发布</option>
                <option value="rejected">已驳回</option>
                <option value="disabled">已停用</option>
                <option value="draft">草稿</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">分类</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">全部分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-slate-500 mb-1">关键词</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索标题、问题、话术内容..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <Search className="w-4 h-4" />
                查询
              </button>
              <button
                onClick={handleResetFilter}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                重置
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">标题</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">分类</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">版本</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">创建人</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">提交时间</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 w-28">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                      加载中...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p>暂无审核记录</p>
                    </td>
                  </tr>
                ) : (
                  entries.map((item) => {
                    const st = statusLabels[item.status] || statusLabels.draft;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 max-w-sm truncate" title={item.title}>
                            {item.title}
                          </div>
                          {item.tags && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.tags.split(/[,，]/).filter(Boolean).slice(0, 3).map((t, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                                  {t.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-slate-400" />
                            <span>{item.category_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="inline-flex items-center gap-1 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                            <History className="w-3 h-3" />
                            v{item.version || 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{item.created_by_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {formatDateTime(item.submitted_at || item.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openDetailModal(item.id)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="查看详情并审核"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {item.status === 'pending_review' && (
                              <>
                                <button
                                  onClick={() => handleApprove(item.id)}
                                  className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="审核通过"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    openDetailModal(item.id);
                                    setTimeout(() => openRejectModal(), 300);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="驳回"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2 pt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>提示：点击"查看详情"按钮可以阅读完整内容后再进行审核操作</span>
          </div>
        </div>

        {showDetailModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">审核 - 知识条目详情</h3>
                  {entry && (
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-slate-500">ID: #{entry.id}</p>
                      <p className="text-xs text-slate-500">版本 v{entry.version || 1}</p>
                      {entry.status === 'pending_review' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                          <Clock className="w-3 h-3" /> 等待您审核
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex-1 flex items-center justify-center py-16">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : entry ? (
                <>
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">标题</div>
                        <div className="text-sm font-medium text-slate-800">{entry.title}</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">分类</div>
                        <div className="text-sm font-medium text-slate-800">{entry.category_name || '-'}</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">状态</div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusLabels[entry.status]?.color || statusLabels.draft.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusLabels[entry.status]?.dot || statusLabels.draft.dot}`} />
                          {statusLabels[entry.status]?.label || entry.status}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">创建人 / 时间</div>
                        <div className="text-sm font-medium text-slate-800">{entry.created_by_name || '-'}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{formatDateTime(entry.created_at)}</div>
                      </div>
                    </div>

                    {entry.question && (
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                          <span className="w-1 h-4 bg-blue-500 rounded" />
                          常见问题（触发示例）
                        </div>
                        <textarea
                          readOnly
                          value={entry.question}
                          rows={Math.min(6, entry.question.split('\n').length + 1)}
                          className="w-full px-4 py-3 bg-blue-50/60 border border-blue-100 rounded-lg text-sm text-slate-700 resize-none"
                        />
                      </div>
                    )}

                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                        <span className="w-1 h-4 bg-green-500 rounded" />
                        处理话术（审核重点）
                      </div>
                      <pre className="w-full px-4 py-3 bg-green-50/60 border border-green-200 rounded-lg text-sm text-slate-800 whitespace-pre-wrap break-words font-mono leading-relaxed">
                        {entry.answer || '-'}
                      </pre>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" /> 适用商品
                        </div>
                        <div className="text-sm text-slate-700">{entry.applicable_products || '-'}</div>
                      </div>
                      <div className="p-4 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                          <Send className="w-3.5 h-3.5" /> 升级条件 / 阈值
                        </div>
                        <div className="text-sm text-slate-700">
                          {entry.escalation_condition || '-'}
                          {entry.escalation_threshold ? `（阈值：${entry.escalation_threshold}）` : ''}
                        </div>
                      </div>
                      <div className="p-4 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5" /> 标签
                        </div>
                        <div className="text-sm text-slate-700">
                          {entry.tags ? (
                            <div className="flex flex-wrap gap-1.5">
                              {entry.tags.split(/[,，]/).filter(Boolean).map((t, i) => (
                                <span key={i} className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded">
                                  {t.trim()}
                                </span>
                              ))}
                            </div>
                          ) : (
                            '-'
                          )}
                        </div>
                      </div>
                      <div className="p-4 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> 失效时间
                        </div>
                        <div className="text-sm text-slate-700">{formatDateTime(entry.expires_at)}</div>
                      </div>
                    </div>

                    {entry.review_remark && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1.5">
                          <Ban className="w-3.5 h-3.5" /> 上次驳回备注
                        </div>
                        <div className="text-sm text-red-700">{entry.review_remark}</div>
                      </div>
                    )}

                    {(detailData?.versions || []).length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5" />
                          版本变更历史（最近 5 条）
                        </div>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-slate-600">版本</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-600">变更说明</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-600">状态</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-600">创建人</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-600">时间</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(detailData?.versions || []).slice(0, 5).map((v: KnowledgeVersion) => {
                                const vst = statusLabels[v.status] || statusLabels.draft;
                                return (
                                  <tr key={v.id} className="hover:bg-slate-50/50">
                                    <td className="px-3 py-2">
                                      <span className="inline-flex items-center gap-1">
                                        {v.id === entry.current_version_id && (
                                          <span className="px-1 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded font-medium">当前</span>
                                        )}
                                        <span className="font-mono font-semibold text-slate-700">v{v.version_no}</span>
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 max-w-md truncate" title={v.change_log || '-'}>
                                      {v.change_log || '初始化版本'}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${vst.color}`}>
                                        {vst.label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600">{v.created_by_name || '-'}</td>
                                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(v.created_at)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {entry.status === 'pending_review' && (
                    <div className="border-t-2 border-indigo-100 px-6 py-4 bg-gradient-to-r from-indigo-50/60 to-purple-50/60">
                      <div className="text-xs font-semibold text-indigo-700 mb-3 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" /> 审核操作
                        <span className="text-xs font-normal text-indigo-500 ml-1">（请仔细阅读上方内容后再操作）</span>
                      </div>
                      <div className="flex flex-wrap gap-3 items-center">
                        <button
                          onClick={() => handleApprove(entry.id)}
                          disabled={actionLoading}
                          className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-60 shadow-sm shadow-green-200"
                        >
                          <Check className="w-4 h-4" />
                          审核通过并发布
                        </button>
                        <button
                          onClick={openRejectModal}
                          disabled={actionLoading}
                          className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-60 shadow-sm shadow-red-200"
                        >
                          <X className="w-4 h-4" />
                          驳回（填写备注）
                        </button>
                        <div className="text-xs text-slate-500 ml-2">
                          快捷键：通过将立即发布至知识库，驳回需要填写原因告知编辑者
                        </div>
                      </div>
                    </div>
                  )}

                  {entry.status !== 'pending_review' && (
                    <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex justify-end">
                      <button
                        onClick={() => setShowDetailModal(false)}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
                      >
                        关闭
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}

        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-red-50/60">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-red-500" />
                  驳回审核
                </h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>驳回将使条目回到草稿状态，请认真填写驳回原因，帮助内容编辑者了解需要如何修改。</span>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    驳回备注 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectRemark}
                    onChange={(e) => setRejectRemark(e.target.value)}
                    rows={5}
                    placeholder="例如：&#10;1. 处理话术不够规范，缺少问候语和结束语&#10;2. 故障排查步骤需要补充第3步检查电源&#10;3. 适用商品范围需明确到型号系列"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none leading-relaxed"
                  />
                  <div className="text-[11px] text-slate-400 mt-1 text-right">
                    已输入 {rejectRemark.length} 字
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
                <button
                  onClick={() => setShowRejectModal(false)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading || !rejectRemark.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  {actionLoading ? '提交中...' : '确认驳回'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
