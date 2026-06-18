import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Eye,
  Check,
  ThumbsUp,
  Meh,
  ThumbsDown,
  FileText,
  User,
  RefreshCw,
  Target,
  Zap,
  Star,
  Percent,
  Filter,
  X,
  Save,
  ClipboardList,
  Bookmark,
  Send,
  MessageSquare,
  TrendingUp,
  Hash,
  Clock,
  BarChart3,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { knowledgeApi } from '@/lib/knowledgeApi';
import { useAuthStore } from '@/store/useAuthStore';
import {
  KnowledgeHitRecord,
  KnowledgeEffectiveness,
} from '../../shared/types.js';

const matchedByLabels: Record<string, { label: string; color: string; icon: any }> = {
  strong: { label: '强匹配', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Target },
  keyword: { label: '关键词', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Zap },
  category: { label: '分类匹配', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Hash },
};

const effectivenessLabels: Record<string, { label: string; color: string; icon: any }> = {
  helpful: { label: '很有帮助', color: 'bg-green-100 text-green-700', icon: ThumbsUp },
  partially_helpful: { label: '部分有帮助', color: 'bg-yellow-100 text-yellow-700', icon: Meh },
  not_helpful: { label: '没有帮助', color: 'bg-red-100 text-red-700', icon: ThumbsDown },
};

interface HitStats {
  total: number;
  used: number;
  helpful: number;
  avg_score: number;
}

const emptyStats: HitStats = { total: 0, used: 0, helpful: 0, avg_score: 0 };

export default function KnowledgeHitRecords() {
  const { user } = useAuthStore();

  const [records, setRecords] = useState<KnowledgeHitRecord[]>([]);
  const [stats, setStats] = useState<HitStats>(emptyStats);

  const [filterEntryId, setFilterEntryId] = useState('');
  const [filterOrderId, setFilterOrderId] = useState('');
  const [filterUsed, setFilterUsed] = useState('');
  const [filterEffectiveness, setFilterEffectiveness] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [loading, setLoading] = useState(false);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState<KnowledgeHitRecord | null>(null);

  const [feedbackEffectiveness, setFeedbackEffectiveness] = useState<KnowledgeEffectiveness | ''>('');
  const [feedbackRemark, setFeedbackRemark] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const entry_id = filterEntryId ? parseInt(filterEntryId) : undefined;
      const order_id = filterOrderId ? parseInt(filterOrderId) : undefined;
      const used = filterUsed !== '' ? (parseInt(filterUsed) as 0 | 1) : undefined;
      const effectiveness = filterEffectiveness ? (filterEffectiveness as KnowledgeEffectiveness) : undefined;
      const recordsRes = await knowledgeApi.hitRecords.list({ entry_id, order_id, used, effectiveness, limit: 200 });
      setRecords(recordsRes.data || []);
    } catch (err) {
      console.error('Failed to load hit records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSearch = () => {
    loadData();
  };

  const handleResetFilter = () => {
    setFilterEntryId('');
    setFilterOrderId('');
    setFilterUsed('');
    setFilterEffectiveness('');
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

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-emerald-600 font-bold';
    if (score >= 0.75) return 'text-green-600 font-semibold';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 0.9) return 'bg-emerald-50 border-emerald-200';
    if (score >= 0.75) return 'bg-green-50 border-green-200';
    if (score >= 0.6) return 'bg-yellow-50 border-yellow-200';
    return 'bg-orange-50 border-orange-200';
  };

  const openDetailModal = async (record: KnowledgeHitRecord) => {
    setDetailData(record);
    setFeedbackEffectiveness(record.effectiveness || '');
    setFeedbackRemark(record.feedback || '');
    setShowDetailModal(true);
  };

  const handleMarkUsed = async () => {
    if (!detailData) return;
    const used = detailData.used === 1 ? 0 : 1;
    if (detailData.used === 1) {
      if (!confirm('取消标记为已采用？')) return;
    }
    try {
      await knowledgeApi.hitRecords.markUsed(detailData.id, { used });
      alert(detailData.used === 1 ? '已取消采用标记' : '已标记为采用');
      await loadData();
      setShowDetailModal(false);
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!detailData) return;
    if (!feedbackEffectiveness) {
      alert('请选择效果反馈');
      return;
    }
    setActionLoading(true);
    try {
      await knowledgeApi.hitRecords.submitFeedback(detailData.id, {
        effectiveness: feedbackEffectiveness,
        feedback: feedbackRemark,
      });
      alert('反馈已提交');
      setActionLoading(false);
      await loadData();
      setShowDetailModal(false);
    } catch (err: any) {
      alert(err.message || '提交失败');
      setActionLoading(false);
    }
  };

  const statCards = useMemo(() => [
    {
      key: 'total',
      label: '总命中次数',
      value: stats.total,
      icon: Target,
      gradient: 'from-blue-500 to-indigo-500',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      suffix: '次',
    },
    {
      key: 'used',
      label: '已采用',
      value: stats.used,
      icon: Bookmark,
      gradient: 'from-emerald-500 to-green-500',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      suffix: stats.total ? `${((stats.used / Math.max(stats.total, 1)) * 100).toFixed(1)}%` : '',
    },
    {
      key: 'helpful',
      label: '很有帮助',
      value: stats.helpful,
      icon: Star,
      gradient: 'from-amber-500 to-yellow-500',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      suffix: '次',
    },
    {
      key: 'avg_score',
      label: '平均匹配分',
      value: stats.avg_score ? (stats.avg_score * 100).toFixed(1) : '0.0',
      icon: Percent,
      gradient: 'from-purple-500 to-violet-500',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      suffix: '%',
      isPercent: true,
    },
  ], [stats]);

  const r = detailData;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-7 h-7 text-teal-600" />
              命中记录
            </h1>
            <p className="text-slate-500 mt-1">查看知识库条目在工单中的命中情况、采用率和效果反馈</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              刷新数据
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className={`rounded-xl border border-slate-200 p-4 ${card.bg} relative overflow-hidden`}>
                <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${card.gradient} opacity-10`} />
                <div className="flex items-start justify-between relative z-10">
                  <div>
                    <p className="text-sm text-slate-600">{card.label}</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <p className={`text-2xl font-bold ${card.text}`}>{card.value}</p>
                      <span className={`text-xs ${card.text} opacity-80`}>{card.suffix}</span>
                    </div>
                  </div>
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3" /> 条目ID
              </label>
              <input
                type="text"
                value={filterEntryId}
                onChange={(e) => setFilterEntryId(e.target.value.replace(/\D/g, ''))}
                placeholder="数字ID"
                className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> 工单ID
              </label>
              <input
                type="text"
                value={filterOrderId}
                onChange={(e) => setFilterOrderId(e.target.value.replace(/\D/g, ''))}
                placeholder="数字ID"
                className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">是否采用</label>
              <select
                value={filterUsed}
                onChange={(e) => setFilterUsed(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">全部</option>
                <option value="1">已采用</option>
                <option value="0">未采用</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">效果反馈</label>
              <select
                value={filterEffectiveness}
                onChange={(e) => setFilterEffectiveness(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">全部</option>
                <option value="helpful">很有帮助</option>
                <option value="partially_helpful">部分有帮助</option>
                <option value="not_helpful">没有帮助</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Search className="w-3 h-3" /> 关键词
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="条目标题、工单号、匹配词..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <Filter className="w-4 h-4" />
                筛选
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
                  <th className="px-4 py-3 text-left font-medium text-slate-600">条目标题</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">工单</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">匹配方式</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">匹配分数</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">采用状态</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">效果反馈</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">操作人</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">命中时间</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 w-16">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                      加载中...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p>暂无命中记录</p>
                    </td>
                  </tr>
                ) : (
                  records.map((item) => {
                    const mb = matchedByLabels[item.matched_by] || matchedByLabels.keyword;
                    const MbIcon = mb.icon;
                    const eff = item.effectiveness ? effectivenessLabels[item.effectiveness] : null;
                    const EffIcon = eff?.icon;
                    const scorePct = Math.round((item.score || 0) * 100);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="max-w-xs truncate font-medium text-slate-800" title={item.entry_title}>
                            {item.entry_title || `#${item.entry_id}`}
                          </div>
                          {item.matched_keywords && (
                            <div className="mt-1 flex flex-wrap gap-1 max-w-xs">
                              {item.matched_keywords.split(/[,，]/).filter(Boolean).slice(0, 3).map((k, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                  {k.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-mono text-xs text-slate-700">
                              {item.order_no ? `#${item.order_no}` : `#${item.order_id}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${mb.color}`}>
                            <MbIcon className="w-3 h-3" />
                            {mb.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-mono ${getScoreBg(item.score)}`}>
                            <Percent className="w-3 h-3" />
                            <span className={getScoreColor(item.score)}>{scorePct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {item.used === 1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                              <Bookmark className="w-3 h-3 fill-current" />
                              已采用
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                              <X className="w-3 h-3" />
                              未采用
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {eff ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${eff.color}`}>
                              <EffIcon className="w-3 h-3" />
                              {eff.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400">
                              <MessageSquare className="w-3 h-3" />
                              待反馈
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-slate-700">{item.operator_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(item.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openDetailModal(item)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="查看详情并反馈"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2 pt-1">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>统计概览：共 {records.length} 条记录显示，可使用上方筛选条件缩小范围</span>
          </div>
        </div>

        {showDetailModal && r && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-teal-50 to-cyan-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Target className="w-5 h-5 text-teal-600" />
                    命中详情
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span>记录ID: #{r.id}</span>
                    <span>版本: v{r.version_no || '-'}</span>
                    <span>分类: {r.category_name || '-'}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-1.5 hover:bg-white/80 rounded-lg text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> 命中条目
                    </div>
                    <div className="text-sm font-semibold text-slate-800 truncate" title={r.entry_title}>
                      {r.entry_title || `条目 #${r.entry_id}`}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" /> 关联工单
                    </div>
                    <div className="text-sm font-semibold text-slate-800">
                      {r.order_no ? `工单 #${r.order_no}` : `工单 #${r.order_id}`}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> 操作人 / 时间
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{r.operator_name || '-'}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{formatDateTime(r.created_at)}</div>
                  </div>
                  <div className={`p-4 rounded-xl border ${getScoreBg(r.score)}`}>
                    <div className="text-xs text-slate-600 mb-1 flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5" /> 匹配分数
                    </div>
                    <div className={`text-2xl font-bold ${getScoreColor(r.score)}`}>
                      {Math.round((r.score || 0) * 100)}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-slate-200 rounded-xl">
                    <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      匹配方式
                    </div>
                    {(() => {
                      const mb = matchedByLabels[r.matched_by] || matchedByLabels.keyword;
                      const MbIcon = mb.icon;
                      return (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${mb.color}`}>
                            <MbIcon className="w-3.5 h-3.5" />
                            {mb.label}
                          </span>
                          <span className="text-xs text-slate-500">（matched_by: {r.matched_by}）</span>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="p-4 border border-slate-200 rounded-xl">
                    <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5" />
                      采用状态
                    </div>
                    <div className="flex items-center gap-3">
                      {r.used === 1 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <Check className="w-3.5 h-3.5" />
                          已采用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                          <X className="w-3.5 h-3.5" />
                          未采用
                        </span>
                      )}
                      {r.used_at && (
                        <span className="text-[11px] text-slate-500">于 {formatDateTime(r.used_at)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-slate-200 rounded-xl">
                  <div className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" />
                    命中关键词明细
                  </div>
                  {r.matched_keywords ? (
                    <div className="flex flex-wrap gap-2">
                      {r.matched_keywords.split(/[,，]/).filter(Boolean).map((k, i) => (
                        <div key={i} className="group relative">
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 text-sm font-medium rounded-lg border border-blue-100">
                            <Zap className="w-3.5 h-3.5 text-blue-500" />
                            {k.trim()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400 italic">无具体匹配关键词（可能为分类级命中）</div>
                  )}
                </div>

                {r.effectiveness && (
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                    <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      历史效果反馈
                      {r.feedback_at && <span className="text-[11px] font-normal text-slate-400 ml-2">于 {formatDateTime(r.feedback_at)}</span>}
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      {(() => {
                        const eff = effectivenessLabels[r.effectiveness!] || effectivenessLabels.helpful;
                        const EffIcon = eff.icon;
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${eff.color}`}>
                            <EffIcon className="w-4 h-4" />
                            {eff.label}
                          </span>
                        );
                      })()}
                    </div>
                    {r.feedback && (
                      <div className="p-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed">
                        {r.feedback}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t-2 border-teal-100 px-6 py-5 bg-gradient-to-r from-teal-50/60 to-emerald-50/60 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Send className="w-4 h-4 text-teal-600" />
                    反馈操作区
                  </h4>
                  <button
                    onClick={handleMarkUsed}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      r.used === 1
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200'
                    }`}
                  >
                    <Bookmark className="w-4 h-4" />
                    {r.used === 1 ? '取消采用标记' : '标记为已采用'}
                  </button>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2.5">
                      效果反馈 <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => setFeedbackEffectiveness('helpful')}
                        className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                          feedbackEffectiveness === 'helpful'
                            ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                            : 'border-slate-200 hover:border-green-300 hover:bg-green-50/50 text-slate-600'
                        }`}
                      >
                        <ThumbsUp className={`w-5 h-5 ${feedbackEffectiveness === 'helpful' ? 'fill-green-200' : ''}`} />
                        <div className="text-left">
                          <div className="text-sm font-semibold">很有帮助</div>
                          <div className="text-[10px] opacity-70">直接解决了问题</div>
                        </div>
                      </button>
                      <button
                        onClick={() => setFeedbackEffectiveness('partially_helpful')}
                        className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                          feedbackEffectiveness === 'partially_helpful'
                            ? 'border-yellow-500 bg-yellow-50 text-yellow-700 shadow-sm'
                            : 'border-slate-200 hover:border-yellow-300 hover:bg-yellow-50/50 text-slate-600'
                        }`}
                      >
                        <Meh className={`w-5 h-5 ${feedbackEffectiveness === 'partially_helpful' ? 'fill-yellow-200' : ''}`} />
                        <div className="text-left">
                          <div className="text-sm font-semibold">部分有帮助</div>
                          <div className="text-[10px] opacity-70">提供了部分参考</div>
                        </div>
                      </button>
                      <button
                        onClick={() => setFeedbackEffectiveness('not_helpful')}
                        className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                          feedbackEffectiveness === 'not_helpful'
                            ? 'border-red-500 bg-red-50 text-red-700 shadow-sm'
                            : 'border-slate-200 hover:border-red-300 hover:bg-red-50/50 text-slate-600'
                        }`}
                      >
                        <ThumbsDown className={`w-5 h-5 ${feedbackEffectiveness === 'not_helpful' ? 'fill-red-200' : ''}`} />
                        <div className="text-left">
                          <div className="text-sm font-semibold">没有帮助</div>
                          <div className="text-[10px] opacity-70">未能解决问题</div>
                        </div>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">反馈备注（可选）</label>
                    <textarea
                      value={feedbackRemark}
                      onChange={(e) => setFeedbackRemark(e.target.value)}
                      rows={3}
                      placeholder="例如：话术很标准，但客户场景需要结合订单情况补充；或者：该条目匹配不够精确，建议增加XX关键词..."
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none leading-relaxed"
                    />
                    <div className="text-[11px] text-slate-400 mt-1 text-right">
                      已输入 {feedbackRemark.length} 字 · 反馈将用于优化知识库匹配质量
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setShowDetailModal(false)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSubmitFeedback}
                      disabled={actionLoading || !feedbackEffectiveness}
                      className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5 shadow-sm shadow-teal-200"
                    >
                      {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {actionLoading ? '提交中...' : '提交反馈'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
