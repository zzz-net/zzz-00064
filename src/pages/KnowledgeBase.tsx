import { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Eye,
  Edit2,
  Send,
  Power,
  Trash2,
  Upload,
  Download,
  X,
  Check,
  Save,
  History,
  Settings,
  Tag,
  FileText,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Undo2,
  Database,
  BarChart3,
  Layers,
  Activity,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import {
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeConfig,
  KnowledgeOperationLog,
  KnowledgeEntryDetail,
  KnowledgeVersion,
  ImportResult,
  KnowledgeStatus,
} from '../../shared/types.js';

const statusLabels: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: '草稿', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  pending_review: { label: '待审核', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  published: { label: '已发布', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500' },
  disabled: { label: '已停用', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
  archived: { label: '已归档', color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
};

const opTypeLabels: Record<string, { label: string; color: string }> = {
  category_created: { label: '创建分类', color: 'bg-green-100 text-green-700' },
  category_updated: { label: '更新分类', color: 'bg-blue-100 text-blue-700' },
  category_deleted: { label: '删除分类', color: 'bg-red-100 text-red-700' },
  knowledge_created: { label: '创建条目', color: 'bg-green-100 text-green-700' },
  knowledge_updated: { label: '更新条目', color: 'bg-blue-100 text-blue-700' },
  knowledge_submitted: { label: '提交审核', color: 'bg-yellow-100 text-yellow-700' },
  knowledge_approved: { label: '审核通过', color: 'bg-green-100 text-green-700' },
  knowledge_rejected: { label: '审核驳回', color: 'bg-red-100 text-red-700' },
  knowledge_published: { label: '发布条目', color: 'bg-green-100 text-green-700' },
  knowledge_disabled: { label: '停用条目', color: 'bg-red-100 text-red-700' },
  knowledge_rollback: { label: '回滚版本', color: 'bg-purple-100 text-purple-700' },
  knowledge_archived: { label: '归档条目', color: 'bg-slate-100 text-slate-700' },
  version_created: { label: '创建版本', color: 'bg-blue-100 text-blue-700' },
  hit_recorded: { label: '记录命中', color: 'bg-cyan-100 text-cyan-700' },
  feedback_submitted: { label: '提交反馈', color: 'bg-indigo-100 text-indigo-700' },
  config_updated: { label: '更新配置', color: 'bg-blue-100 text-blue-700' },
  import_success: { label: '导入成功', color: 'bg-green-100 text-green-700' },
  import_failure: { label: '导入失败', color: 'bg-red-100 text-red-700' },
  export_result: { label: '导出数据', color: 'bg-purple-100 text-purple-700' },
};

type TabKey = 'entries' | 'categories' | 'configs' | 'logs';

interface StatsData {
  total: number;
  draft: number;
  pending_review: number;
  published: number;
  disabled: number;
}

const emptyStats: StatsData = { total: 0, draft: 0, pending_review: 0, published: 0, disabled: 0 };

export default function KnowledgeBase() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<TabKey>('entries');

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [configs, setConfigs] = useState<KnowledgeConfig[]>([]);
  const [logs, setLogs] = useState<KnowledgeOperationLog[]>([]);
  const [stats, setStats] = useState<StatsData>(emptyStats);

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formProducts, setFormProducts] = useState('');
  const [formEscalation, setFormEscalation] = useState('');
  const [formThreshold, setFormThreshold] = useState<string>('');
  const [formTags, setFormTags] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formChangeLog, setFormChangeLog] = useState('');

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailData, setDetailData] = useState<KnowledgeEntryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'info' | 'versions'>('info');

  const [rejectRemark, setRejectRemark] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rollbackVersionId, setRollbackVersionId] = useState<string>('');
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [formCatName, setFormCatName] = useState('');
  const [formCatDesc, setFormCatDesc] = useState('');
  const [formCatSort, setFormCatSort] = useState('0');

  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterCategory) params.set('category_id', filterCategory);
      if (filterKeyword) params.set('keyword', filterKeyword);
      const res = await api.get(`/knowledge/entries?${params.toString()}`);
      setEntries(res.data || []);
      const statsRes = await api.get('/knowledge/entries/stats');
      setStats(statsRes.data || emptyStats);
    } catch (err) {
      console.error('Failed to load entries:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('/knowledge/categories');
      setCategories(res.data || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadConfigs = async () => {
    try {
      const res = await api.get('/knowledge/configs');
      setConfigs(res.data || []);
    } catch (err) {
      console.error('Failed to load configs:', err);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await api.get('/knowledge/logs?limit=200');
      setLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleSearch = () => {
    loadEntries();
  };

  const handleResetFilter = () => {
    setFilterStatus('');
    setFilterCategory('');
    setFilterKeyword('');
  };

  useEffect(() => {
    loadCategories();
    loadConfigs();
  }, []);

  useEffect(() => {
    if (activeTab === 'entries') {
      loadEntries();
    }
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const formatDateTimeLocal = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const openNewEntryModal = () => {
    setEditingEntryId(null);
    setFormTitle('');
    setFormCategoryId(categories[0]?.id?.toString() || '');
    setFormQuestion('');
    setFormAnswer('');
    setFormProducts('');
    setFormEscalation('');
    setFormThreshold('');
    setFormTags('');
    setFormExpiresAt('');
    setFormChangeLog('');
    setShowEntryModal(true);
  };

  const openEditEntryModal = (entry: KnowledgeEntry) => {
    setEditingEntryId(entry.id);
    setFormTitle(entry.title);
    setFormCategoryId(entry.category_id?.toString() || '');
    setFormQuestion(entry.question || '');
    setFormAnswer(entry.answer || '');
    setFormProducts(entry.applicable_products || '');
    setFormEscalation(entry.escalation_condition || '');
    setFormThreshold(entry.escalation_threshold?.toString() || '');
    setFormTags(entry.tags || '');
    setFormExpiresAt(formatDateTimeLocal(entry.expires_at));
    setFormChangeLog('');
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    if (!formTitle.trim() || !formCategoryId || !formAnswer.trim()) {
      alert('请填写必填字段：标题、分类、处理话术');
      return;
    }
    if (editingEntryId && !formChangeLog.trim()) {
      alert('编辑时必须填写变更说明');
      return;
    }
    setActionLoading(true);
    try {
      const payload = {
        title: formTitle,
        category_id: parseInt(formCategoryId),
        question: formQuestion,
        answer: formAnswer,
        applicable_products: formProducts,
        escalation_condition: formEscalation,
        escalation_threshold: formThreshold ? parseFloat(formThreshold) : 0,
        tags: formTags,
        expires_at: formExpiresAt || null,
        change_log: formChangeLog || undefined,
      };
      if (editingEntryId) {
        await api.put(`/knowledge/entries/${editingEntryId}`, payload);
      } else {
        await api.post('/knowledge/entries', payload);
      }
      setShowEntryModal(false);
      await loadEntries();
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setActionLoading(false);
    }
  };

  const openDetailModal = async (id: number) => {
    setDetailLoading(true);
    setShowDetailModal(true);
    setDetailTab('info');
    try {
      const res = await api.get(`/knowledge/entries/${id}`);
      setDetailData(res.data || null);
    } catch (err: any) {
      alert(err.message || '获取详情失败');
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmitReview = async (id: number) => {
    if (!confirm('确认提交该条目到审核流程？')) return;
    try {
      await api.put(`/knowledge/entries/${id}/submit`);
      alert('已提交审核');
      await loadEntries();
      if (detailData?.entry.id === id) openDetailModal(id);
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('确认审核通过并发布该条目？')) return;
    try {
      await api.put(`/knowledge/entries/${id}/approve`);
      alert('已审核通过并发布');
      await loadEntries();
      if (detailData?.entry.id === id) openDetailModal(id);
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const openRejectModal = () => {
    setRejectRemark('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectRemark.trim()) {
      alert('请填写驳回备注');
      return;
    }
    try {
      if (detailData) {
        await api.put(`/knowledge/entries/${detailData.entry.id}/reject`, { remark: rejectRemark });
        alert('已驳回');
        setShowRejectModal(false);
        await loadEntries();
        openDetailModal(detailData.entry.id);
      }
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleDisable = async (id: number, currentStatus: KnowledgeStatus) => {
    const action = currentStatus === 'disabled' ? '启用' : '停用';
    if (!confirm(`确认${action}该条目？`)) return;
    try {
      await api.put(`/knowledge/entries/${id}/disable`, {
        disabled: currentStatus !== 'disabled' ? 1 : 0,
      });
      alert(`已${action}`);
      await loadEntries();
      if (detailData?.entry.id === id) openDetailModal(id);
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该条目？此操作不可恢复。')) return;
    try {
      await api.delete(`/knowledge/entries/${id}`);
      alert('已删除');
      setShowDetailModal(false);
      await loadEntries();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const openRollbackConfirm = () => {
    if (detailData?.versions?.length) {
      setRollbackVersionId(detailData.versions[0].id?.toString() || '');
    }
    setShowRollbackConfirm(true);
  };

  const handleRollback = async () => {
    if (!rollbackVersionId) {
      alert('请选择要回滚的版本');
      return;
    }
    if (!confirm('确认回滚到所选版本？当前版本内容将被覆盖。')) return;
    try {
      if (detailData) {
        await api.put(`/knowledge/entries/${detailData.entry.id}/rollback`, {
          version_id: parseInt(rollbackVersionId),
        });
        alert('已回滚到指定版本');
        setShowRollbackConfirm(false);
        await loadEntries();
        openDetailModal(detailData.entry.id);
      }
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleSaveCategory = async () => {
    if (!formCatName.trim()) return;
    setActionLoading(true);
    try {
      const payload = {
        name: formCatName,
        description: formCatDesc,
        sort_order: parseInt(formCatSort) || 0,
      };
      if (editingCategoryId) {
        await api.put(`/knowledge/categories/${editingCategoryId}`, payload);
      } else {
        await api.post('/knowledge/categories', payload);
      }
      setShowCategoryModal(false);
      setEditingCategoryId(null);
      setFormCatName('');
      setFormCatDesc('');
      setFormCatSort('0');
      await loadCategories();
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditCategory = (cat: KnowledgeCategory) => {
    setEditingCategoryId(cat.id);
    setFormCatName(cat.name);
    setFormCatDesc(cat.description || '');
    setFormCatSort(cat.sort_order?.toString() || '0');
    setShowCategoryModal(true);
  };

  const handleToggleCategory = async (cat: KnowledgeCategory) => {
    try {
      await api.put(`/knowledge/categories/${cat.id}/enabled`, {
        enabled: cat.enabled === 1 ? 0 : 1,
      });
      await loadCategories();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('确定删除该分类？该分类下的知识条目将变为未分类状态。')) return;
    try {
      await api.delete(`/knowledge/categories/${id}`);
      await loadCategories();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleUpdateConfig = async (cfg: KnowledgeConfig, newValue: string) => {
    try {
      await api.put('/knowledge/configs', {
        config_key: cfg.config_key,
        config_value: newValue,
        description: cfg.description,
      });
      await loadConfigs();
    } catch (err: any) {
      alert(err.message || '更新失败');
    }
  };

  const renderConfigValue = (cfg: KnowledgeConfig) => {
    if (cfg.config_key === 'knowledge_auto_match') {
      return (
        <select
          className="px-2 py-1 border rounded text-sm w-24"
          defaultValue={cfg.config_value}
          disabled={!isAdmin}
          onChange={async (e) => {
            await handleUpdateConfig(cfg, e.target.value);
          }}
        >
          <option value="0">关闭</option>
          <option value="1">开启</option>
        </select>
      );
    }
    if (cfg.config_key === 'knowledge_match_threshold' || cfg.config_key === 'knowledge_max_results') {
      return (
        <input
          type="number"
          min={0}
          defaultValue={cfg.config_value}
          disabled={!isAdmin}
          className="px-2 py-1 border rounded text-sm w-24"
          onBlur={async (e) => {
            if (e.target.value !== cfg.config_value) {
              await handleUpdateConfig(cfg, e.target.value);
            }
          }}
        />
      );
    }
    return (
      <input
        type="text"
        defaultValue={cfg.config_value}
        disabled={!isAdmin}
        className="px-2 py-1 border rounded text-sm"
        onBlur={async (e) => {
          if (e.target.value !== cfg.config_value) {
            await handleUpdateConfig(cfg, e.target.value);
          }
        }}
      />
    );
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterCategory) params.set('category_id', filterCategory);
      if (filterKeyword) params.set('keyword', filterKeyword);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await api.download(`/knowledge/entries/export?${params.toString()}`, `knowledge-${timestamp}.csv`);
    } catch (err: any) {
      alert(err.message || '导出失败');
    }
  };

  const handleImportCsv = async () => {
    if (!importCsvText.trim()) {
      alert('请粘贴CSV文本内容');
      return;
    }
    setImporting(true);
    try {
      const res = await api.post('/knowledge/entries/import', { csv_text: importCsvText });
      setImportResult(res.data || null);
    } catch (err: any) {
      alert(err.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportCsvText('');
    setImportResult(null);
    loadEntries();
  };

  const statCards = useMemo(() => [
    { key: 'total', label: '全部', value: stats.total, icon: BookOpen, color: 'from-slate-500 to-slate-600', bg: 'bg-slate-50', text: 'text-slate-600' },
    { key: 'draft', label: '草稿', value: stats.draft, icon: FileText, color: 'from-slate-400 to-slate-500', bg: 'bg-slate-50', text: 'text-slate-600' },
    { key: 'pending_review', label: '待审核', value: stats.pending_review, icon: Clock, color: 'from-yellow-500 to-amber-500', bg: 'bg-yellow-50', text: 'text-yellow-700' },
    { key: 'published', label: '已发布', value: stats.published, icon: Check, color: 'from-green-500 to-emerald-500', bg: 'bg-green-50', text: 'text-green-700' },
    { key: 'disabled', label: '已停用', value: stats.disabled, icon: Power, color: 'from-red-500 to-rose-500', bg: 'bg-red-50', text: 'text-red-700' },
  ], [stats]);

  const entry = detailData?.entry;
  const actions = detailData?.available_actions;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-7 h-7 text-blue-600" />
              知识库管理
            </h1>
            <p className="text-slate-500 mt-1">管理售后知识库的条目、分类、参数配置和操作日志</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && activeTab === 'entries' && (
              <>
                <button
                  onClick={() => { setImportCsvText(''); setImportResult(null); setShowImportModal(true); }}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  CSV 导入
                </button>
                <button
                  onClick={handleExportCsv}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  CSV 导出
                </button>
              </>
            )}
            {activeTab === 'entries' && (
              <button
                onClick={openNewEntryModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                新增条目
              </button>
            )}
          </div>
        </div>

        {activeTab === 'entries' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.key} className={`rounded-xl border border-slate-200 p-4 ${card.bg}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-600">{card.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${card.text}`}>{card.value}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex border-b border-slate-200 px-2">
            {[
              { key: 'entries' as TabKey, label: '知识条目', icon: BookOpen },
              { key: 'categories' as TabKey, label: '分类配置', icon: Tag },
              { key: 'configs' as TabKey, label: '参数配置', icon: Settings },
              { key: 'logs' as TabKey, label: '操作日志', icon: History },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === key ? 'text-blue-600' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {activeTab === key && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-t" />
                )}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === 'entries' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">状态</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">全部状态</option>
                      <option value="draft">草稿</option>
                      <option value="pending_review">待审核</option>
                      <option value="published">已发布</option>
                      <option value="disabled">已停用</option>
                      <option value="archived">已归档</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">分类</label>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">全部分类</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-slate-500 mb-1">关键词</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={filterKeyword}
                        onChange={(e) => setFilterKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="搜索标题、问题、话术、标签..."
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
                      搜索
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
                        <th className="px-4 py-3 text-left font-medium text-slate-600">命中次数</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">创建人</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">创建时间</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                            加载中...
                          </td>
                        </tr>
                      ) : entries.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>暂无知识条目</p>
                          </td>
                        </tr>
                      ) : (
                        entries.map((item) => {
                          const st = statusLabels[item.status] || statusLabels.draft;
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-800 max-w-xs truncate" title={item.title}>
                                  {item.title}
                                </div>
                                {item.tags && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {item.tags.split(/[,，]/).filter(Boolean).slice(0, 3).map((t, i) => (
                                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                                        {t.trim()}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{item.category_name || '-'}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                  {st.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">v{item.version || 1}</td>
                              <td className="px-4 py-3 text-slate-600">
                                <span className="font-medium text-slate-700">{item.hits || 0}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{item.created_by_name || '-'}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                {formatDateTime(item.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openDetailModal(item.id)}
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="详情"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {(item.status === 'draft' || isAdmin) && (
                                    <button
                                      onClick={() => openEditEntryModal(item)}
                                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="编辑"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  {item.status === 'draft' && (
                                    <button
                                      onClick={() => handleSubmitReview(item.id)}
                                      className="p-1.5 text-slate-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                      title="提交审核"
                                    >
                                      <Send className="w-4 h-4" />
                                    </button>
                                  )}
                                  {(item.status === 'published' || item.status === 'disabled') && (
                                    <button
                                      onClick={() => handleDisable(item.id, item.status)}
                                      className={`p-1.5 text-slate-500 rounded-lg transition-colors ${
                                        item.status === 'disabled'
                                          ? 'hover:text-green-600 hover:bg-green-50'
                                          : 'hover:text-red-600 hover:bg-red-50'
                                      }`}
                                      title={item.status === 'disabled' ? '启用' : '停用'}
                                    >
                                      <Power className="w-4 h-4" />
                                    </button>
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
              </div>
            )}

            {activeTab === 'categories' && (
              <div>
                {isAdmin && (
                  <div className="mb-4">
                    <button
                      onClick={() => {
                        setEditingCategoryId(null);
                        setFormCatName('');
                        setFormCatDesc('');
                        setFormCatSort('0');
                        setShowCategoryModal(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      新增分类
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">ID</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">分类名称</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">描述</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">排序</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">创建时间</th>
                        {isAdmin && <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {categories.length === 0 ? (
                        <tr>
                          <td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center text-slate-400">
                            <Tag className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>暂无分类配置</p>
                          </td>
                        </tr>
                      ) : (
                        categories
                          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                          .map((cat) => (
                            <tr key={cat.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-slate-600">{cat.id}</td>
                              <td className="px-4 py-3 font-medium text-slate-800">{cat.name}</td>
                              <td className="px-4 py-3 text-slate-600">{cat.description || '-'}</td>
                              <td className="px-4 py-3 text-slate-600">{cat.sort_order || 0}</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => isAdmin && handleToggleCategory(cat)}
                                  className={isAdmin ? 'cursor-pointer' : 'cursor-default'}
                                  disabled={!isAdmin}
                                >
                                  {cat.enabled === 1 ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 启用
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> 停用
                                    </span>
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                {formatDateTime(cat.created_at)}
                              </td>
                              {isAdmin && (
                                <td className="px-4 py-3">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleEditCategory(cat)}
                                      className="text-blue-600 hover:text-blue-700 p-1"
                                      title="编辑"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCategory(cat.id)}
                                      className="text-red-600 hover:text-red-700 p-1"
                                      title="删除"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                {!isAdmin && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>只有管理员可以编辑分类配置</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'configs' && (
              <div>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">配置项</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">说明</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">值</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">更新时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {configs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                            <Settings className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>暂无参数配置</p>
                          </td>
                        </tr>
                      ) : (
                        configs.map((cfg) => {
                          const IconCfg =
                            cfg.config_key === 'knowledge_auto_match' ? Activity :
                            cfg.config_key === 'knowledge_match_threshold' ? BarChart3 :
                            cfg.config_key === 'knowledge_max_results' ? Database : Settings;
                          return (
                            <tr key={cfg.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <IconCfg className="w-4 h-4 text-slate-500" />
                                  <span className="font-medium text-slate-800">{cfg.config_key}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{cfg.description}</td>
                              <td className="px-4 py-3">{renderConfigValue(cfg)}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                {formatDateTime(cfg.updated_at)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {!isAdmin && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>只有管理员可以修改参数配置</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div>
                <div className="overflow-x-auto max-h-[560px] overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">时间</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">操作类型</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">操作人</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">关联ID</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">详情</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                            加载中...
                          </td>
                        </tr>
                      ) : logs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                            <History className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>暂无操作日志</p>
                          </td>
                        </tr>
                      ) : (
                        logs.map((log) => {
                          const label = opTypeLabels[log.operation_type] || {
                            label: log.operation_type,
                            color: 'bg-slate-100 text-slate-700',
                          };
                          return (
                            <tr key={log.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                {formatDateTime(log.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2.5 py-0.5 rounded text-xs font-medium ${label.color}`}>
                                  {label.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-700">{log.operator_name}</td>
                              <td className="px-4 py-3 text-slate-600">
                                {log.related_id ? (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="text-xs text-slate-400">{log.related_type}</span>
                                    <span className="font-mono text-xs">#{log.related_id}</span>
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600 max-w-md truncate" title={log.detail}>
                                {log.detail || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {showEntryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800">
                  {editingEntryId ? '编辑知识条目' : '新增知识条目'}
                </h3>
                <button
                  onClick={() => setShowEntryModal(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      标题 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="请输入知识条目标题（如：空调不制冷处理方案）"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      分类 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formCategoryId}
                      onChange={(e) => setFormCategoryId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">请选择分类</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">失效时间</label>
                    <input
                      type="datetime-local"
                      value={formExpiresAt}
                      onChange={(e) => setFormExpiresAt(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">常见问题（用户问题示例）</label>
                  <textarea
                    value={formQuestion}
                    onChange={(e) => setFormQuestion(e.target.value)}
                    placeholder="每行一个常见问题表述，如：&#10;空调不制冷怎么办？&#10;我家空调吹出来的风不凉"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    处理话术 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formAnswer}
                    onChange={(e) => setFormAnswer(e.target.value)}
                    placeholder="请输入标准处理话术，支持换行，将按原格式显示"
                    rows={6}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">适用商品</label>
                    <input
                      type="text"
                      value={formProducts}
                      onChange={(e) => setFormProducts(e.target.value)}
                      placeholder="逗号分隔，如：空调,柜机,挂机"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">标签</label>
                    <input
                      type="text"
                      value={formTags}
                      onChange={(e) => setFormTags(e.target.value)}
                      placeholder="逗号分隔，如：制冷,故障排查"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">升级条件</label>
                    <input
                      type="text"
                      value={formEscalation}
                      onChange={(e) => setFormEscalation(e.target.value)}
                      placeholder="如：连续3次命中仍未解决"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">升级阈值</label>
                    <input
                      type="number"
                      min={0}
                      value={formThreshold}
                      onChange={(e) => setFormThreshold(e.target.value)}
                      placeholder="数字，如：3"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                {editingEntryId && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      变更说明 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formChangeLog}
                      onChange={(e) => setFormChangeLog(e.target.value)}
                      placeholder="请描述本次修改内容，将记录在版本历史中"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button
                  onClick={() => setShowEntryModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEntry}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {actionLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">知识条目详情</h3>
                  {entry && (
                    <p className="text-xs text-slate-500 mt-0.5">ID: #{entry.id} · 当前版本 v{entry.version || 1}</p>
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
                  <div className="flex border-b border-slate-200 px-6 bg-slate-50/50">
                    <button
                      onClick={() => setDetailTab('info')}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                        detailTab === 'info' ? 'text-blue-600' : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      基本信息
                      {detailTab === 'info' && (
                        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600" />
                      )}
                    </button>
                    <button
                      onClick={() => setDetailTab('versions')}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                        detailTab === 'versions' ? 'text-blue-600' : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      版本历史 ({detailData?.versions?.length || 0})
                      {detailTab === 'versions' && (
                        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600" />
                      )}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    {detailTab === 'info' && (
                      <div className="space-y-5">
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
                            <div className="text-xs text-slate-500 mb-1">版本号</div>
                            <div className="text-sm font-medium text-slate-800">v{entry.version || 1}</div>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg">
                            <div className="text-xs text-slate-500 mb-1">创建人</div>
                            <div className="text-sm font-medium text-slate-800">{entry.created_by_name || '-'}</div>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg">
                            <div className="text-xs text-slate-500 mb-1">创建时间</div>
                            <div className="text-sm font-medium text-slate-800">{formatDateTime(entry.created_at)}</div>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg">
                            <div className="text-xs text-slate-500 mb-1">失效时间</div>
                            <div className="text-sm font-medium text-slate-800">{formatDateTime(entry.expires_at)}</div>
                          </div>
                          <div className="p-3 bg-cyan-50 rounded-lg">
                            <div className="text-xs text-cyan-600 mb-1">命中次数 / 很有帮助</div>
                            <div className="text-sm font-medium text-cyan-800">{entry.hits || 0} / {entry.helpful_count || 0}</div>
                          </div>
                        </div>

                        {entry.question && (
                          <div>
                            <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                              <span className="w-1 h-4 bg-blue-500 rounded" />
                              常见问题
                            </div>
                            <textarea
                              readOnly
                              value={entry.question}
                              rows={Math.min(5, entry.question.split('\n').length + 1)}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none"
                            />
                          </div>
                        )}

                        <div>
                          <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                            <span className="w-1 h-4 bg-green-500 rounded" />
                            处理话术
                          </div>
                          <pre className="w-full px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-slate-800 whitespace-pre-wrap break-words font-mono leading-relaxed">
                            {entry.answer || '-'}
                          </pre>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 border border-slate-200 rounded-lg">
                            <div className="text-xs text-slate-500 mb-1">适用商品</div>
                            <div className="text-sm text-slate-700">{entry.applicable_products || '-'}</div>
                          </div>
                          <div className="p-4 border border-slate-200 rounded-lg">
                            <div className="text-xs text-slate-500 mb-1">升级条件 / 阈值</div>
                            <div className="text-sm text-slate-700">
                              {entry.escalation_condition || '-'}
                              {entry.escalation_threshold ? `（阈值：${entry.escalation_threshold}）` : ''}
                            </div>
                          </div>
                          <div className="p-4 border border-slate-200 rounded-lg">
                            <div className="text-xs text-slate-500 mb-1">标签</div>
                            <div className="text-sm text-slate-700">
                              {entry.tags ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {entry.tags.split(/[,，]/).filter(Boolean).map((t, i) => (
                                    <span key={i} className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
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
                            <div className="text-xs text-slate-500 mb-1">命中统计</div>
                            <div className="text-sm text-slate-700">
                              总命中 <span className="font-semibold text-cyan-600">{entry.hits || 0}</span> 次
                              <span className="mx-2 text-slate-300">·</span>
                              很有帮助 <span className="font-semibold text-green-600">{entry.helpful_count || 0}</span> 次
                            </div>
                          </div>
                        </div>

                        {entry.review_remark && (
                          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="text-xs font-medium text-red-600 mb-1">驳回备注</div>
                            <div className="text-sm text-red-700">{entry.review_remark}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === 'versions' && (
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium text-slate-600">版本号</th>
                              <th className="px-4 py-3 text-left font-medium text-slate-600">变更说明</th>
                              <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                              <th className="px-4 py-3 text-left font-medium text-slate-600">创建人</th>
                              <th className="px-4 py-3 text-left font-medium text-slate-600">创建时间</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(detailData?.versions || []).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                                  暂无版本历史
                                </td>
                              </tr>
                            ) : (
                              (detailData?.versions || []).map((v: KnowledgeVersion) => {
                                const vst = statusLabels[v.status] || statusLabels.draft;
                                return (
                                  <tr key={v.id} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-3">
                                      <span className="inline-flex items-center gap-1.5">
                                        {v.id === entry.current_version_id && (
                                          <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded font-medium">当前</span>
                                        )}
                                        <span className="font-mono font-semibold text-slate-700">v{v.version_no}</span>
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={v.change_log || '-'}>
                                      {v.change_log || '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${vst.color}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${vst.dot}`} />
                                        {vst.label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{v.created_by_name || '-'}</td>
                                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                      {formatDateTime(v.created_at)}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 px-6 py-4 bg-slate-50/80 flex flex-wrap gap-2 items-center justify-end">
                    {actions?.can_edit && (
                      <button
                        onClick={() => { setShowDetailModal(false); openEditEntryModal(entry); }}
                        className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <Edit2 className="w-4 h-4" />
                        编辑
                      </button>
                    )}
                    {actions?.can_submit && (
                      <button
                        onClick={() => handleSubmitReview(entry.id)}
                        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <Send className="w-4 h-4" />
                        提交审核
                      </button>
                    )}
                    {(actions?.can_approve || actions?.can_reject) && (
                      <>
                        {actions?.can_approve && (
                          <button
                            onClick={() => handleApprove(entry.id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            受理通过
                          </button>
                        )}
                        {actions?.can_reject && (
                          <button
                            onClick={openRejectModal}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                          >
                            <X className="w-4 h-4" />
                            驳回
                          </button>
                        )}
                      </>
                    )}
                    {actions?.can_disable && (entry.status === 'published' || entry.status === 'disabled') && (
                      <button
                        onClick={() => handleDisable(entry.id, entry.status)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
                          entry.status === 'disabled'
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                        {entry.status === 'disabled' ? '启用' : '停用'}
                      </button>
                    )}
                    {actions?.can_rollback && (detailData?.versions || []).length > 1 && (
                      <button
                        onClick={openRollbackConfirm}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <Undo2 className="w-4 h-4" />
                        回滚版本
                      </button>
                    )}
                    {actions?.can_delete && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        删除
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <X className="w-5 h-5 text-red-500" />
                  审核驳回
                </h3>
              </div>
              <div className="p-5">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  驳回备注 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectRemark}
                  onChange={(e) => setRejectRemark(e.target.value)}
                  rows={4}
                  placeholder="请填写驳回原因，帮助编辑者了解需要修改的内容"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  取消
                </button>
                <button
                  onClick={handleReject}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  确认驳回
                </button>
              </div>
            </div>
          </div>
        )}

        {showRollbackConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Undo2 className="w-5 h-5 text-purple-500" />
                  回滚版本
                </h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>回滚将创建一个新版本，内容取自所选历史版本，当前内容不会被物理删除。</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">选择目标版本</label>
                  <select
                    value={rollbackVersionId}
                    onChange={(e) => setRollbackVersionId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">请选择版本</option>
                    {(detailData?.versions || [])
                      .filter((v: KnowledgeVersion) => v.id !== entry?.current_version_id)
                      .map((v: KnowledgeVersion) => (
                        <option key={v.id} value={v.id}>
                          v{v.version_no} - {v.change_log || '无变更说明'} ({formatDateTime(v.created_at)})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                <button
                  onClick={() => setShowRollbackConfirm(false)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  取消
                </button>
                <button
                  onClick={handleRollback}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-1.5"
                >
                  <Undo2 className="w-4 h-4" />
                  确认回滚
                </button>
              </div>
            </div>
          </div>
        )}

        {showCategoryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-800">
                  {editingCategoryId ? '编辑分类' : '新增分类'}
                </h3>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">分类名称 *</label>
                  <input
                    type="text"
                    value={formCatName}
                    onChange={(e) => setFormCatName(e.target.value)}
                    placeholder="如：空调故障、安装问题"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                  <textarea
                    value={formCatDesc}
                    onChange={(e) => setFormCatDesc(e.target.value)}
                    rows={3}
                    placeholder="分类的详细描述（可选）"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">排序</label>
                  <input
                    type="number"
                    min={0}
                    value={formCatSort}
                    onChange={(e) => setFormCatSort(e.target.value)}
                    placeholder="数字越小越靠前"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveCategory}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {actionLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  CSV 批量导入
                </h3>
                <button
                  onClick={closeImportModal}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 space-y-1">
                  <p className="font-medium">CSV 格式说明（第一行为表头）：</p>
                  <p className="font-mono">title,category_id,question,answer,applicable_products,escalation_condition,escalation_threshold,tags,expires_at</p>
                  <p>其中 <span className="font-semibold">title, category_id, answer</span> 为必填字段。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">粘贴 CSV 内容</label>
                  <textarea
                    value={importCsvText}
                    onChange={(e) => setImportCsvText(e.target.value)}
                    rows={14}
                    placeholder="粘贴带表头的 CSV 文本，用英文逗号分隔..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono"
                    disabled={importing || !!importResult}
                  />
                </div>
                {importResult && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-50 rounded-lg text-center border border-slate-200">
                      <div className="text-3xl font-bold text-slate-700">{importResult.total}</div>
                      <div className="text-xs text-slate-500 mt-1">总条数</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg text-center border border-green-200">
                      <div className="text-3xl font-bold text-green-600">{importResult.success}</div>
                      <div className="text-xs text-green-600 mt-1">成功</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg text-center border border-red-200">
                      <div className="text-3xl font-bold text-red-600">{importResult.failed}</div>
                      <div className="text-xs text-red-600 mt-1">失败</div>
                    </div>
                  </div>
                )}
                {importResult?.errors?.length ? (
                  <div className="max-h-40 overflow-y-auto border border-red-200 rounded-lg bg-red-50/50">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-red-600 w-16">行号</th>
                          <th className="px-3 py-2 text-left font-medium text-red-600">失败原因</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {importResult.errors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-mono text-red-700">#{e.row}</td>
                            <td className="px-3 py-2 text-red-600">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
                {importResult ? (
                  <button
                    onClick={closeImportModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    完成
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setShowImportModal(false)}
                      disabled={importing}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-700 disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleImportCsv}
                      disabled={importing}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-1.5"
                    >
                      {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {importing ? '导入中...' : '开始导入'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}