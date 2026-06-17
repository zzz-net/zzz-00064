import { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Plus,
  Download,
  Upload,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { DispatchRule, RuleOperationLog, ImportResult } from '../../shared/types.js';

const typeLabels: Record<string, { label: string; color: string }> = {
  max_daily_orders: { label: '每日最大工单数', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  min_service_interval: { label: '最小服务间隔', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  required_skill_match: { label: '技能必需匹配', color: 'bg-teal-100 text-teal-700 border-teal-200' },
};

const severityLabels: Record<string, { label: string; color: string }> = {
  block: { label: '拦截', color: 'bg-red-100 text-red-700 border-red-200' },
  warn: { label: '提醒', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

const opTypeLabels: Record<string, { label: string; color: string }> = {
  rule_created: { label: '创建规则', color: 'bg-green-100 text-green-700' },
  rule_updated: { label: '更新规则', color: 'bg-blue-100 text-blue-700' },
  rule_enabled: { label: '启用规则', color: 'bg-emerald-100 text-emerald-700' },
  rule_disabled: { label: '停用规则', color: 'bg-slate-100 text-slate-700' },
  rule_deleted: { label: '删除规则', color: 'bg-red-100 text-red-700' },
  rule_hit: { label: '规则命中', color: 'bg-orange-100 text-orange-700' },
  rule_overridden: { label: '规则覆盖', color: 'bg-yellow-100 text-yellow-700' },
  import_success: { label: '导入成功', color: 'bg-green-100 text-green-700' },
  import_failure: { label: '导入失败', color: 'bg-red-100 text-red-700' },
};

export default function DispatchRules() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [rules, setRules] = useState<DispatchRule[]>([]);
  const [logs, setLogs] = useState<RuleOperationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportResult, setShowImportResult] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showLogPanel, setShowLogPanel] = useState(false);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'max_daily_orders' | 'min_service_interval' | 'required_skill_match'>('max_daily_orders');
  const [formSeverity, setFormSeverity] = useState<'block' | 'warn'>('block');
  const [formValue, setFormValue] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dispatch-rules');
      setRules(res.data || []);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await api.get('/dispatch-rules/logs?limit=50');
      setLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formValue.trim()) return;
    setActionLoading(true);
    try {
      await api.post('/dispatch-rules', {
        name: formName,
        type: formType,
        severity: formSeverity,
        value: formValue,
        description: formDescription,
      });
      setShowCreateModal(false);
      resetForm();
      loadRules();
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editingRuleId || !formName.trim() || !formValue.trim()) return;
    setActionLoading(true);
    try {
      await api.put(`/dispatch-rules/${editingRuleId}`, {
        name: formName,
        type: formType,
        severity: formSeverity,
        value: formValue,
        description: formDescription,
      });
      setShowEditModal(false);
      resetForm();
      loadRules();
    } catch (err: any) {
      alert(err.message || '更新失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleEnabled = async (rule: DispatchRule) => {
    try {
      await api.put(`/dispatch-rules/${rule.id}/enabled`, {
        enabled: rule.enabled === 1 ? 0 : 1,
      });
      loadRules();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleDelete = async (rule: DispatchRule) => {
    if (!confirm(`确定删除规则"${rule.name}"吗？`)) return;
    try {
      await api.delete(`/dispatch-rules/${rule.id}`);
      loadRules();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleExport = async () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await api.download('/dispatch-rules/export', `dispatch-rules-${timestamp}.csv`);
    } catch (err: any) {
      alert(err.message || '导出失败');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const csvContent = ev.target?.result as string;
      try {
        const res = await api.post<ImportResult>('/dispatch-rules/import', { csvContent });
        const result = res.data as ImportResult;
        setImportResult(result);
        setShowImportResult(true);
        loadRules();
      } catch (err: any) {
        alert(err.message || '导入失败');
      }
    };
    reader.readAsText(file, 'utf-8');
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const openEditModal = (rule: DispatchRule) => {
    setEditingRuleId(rule.id);
    setFormName(rule.name);
    setFormType(rule.type);
    setFormSeverity(rule.severity);
    setFormValue(rule.value);
    setFormDescription(rule.description);
    setShowEditModal(true);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormType('max_daily_orders');
    setFormSeverity('block');
    setFormValue('');
    setFormDescription('');
    setEditingRuleId(null);
  };

  const toggleLogPanel = () => {
    if (!showLogPanel) {
      loadLogs();
    }
    setShowLogPanel(!showLogPanel);
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const getValueLabel = (type: string) => {
    switch (type) {
      case 'max_daily_orders': return '最大工单数';
      case 'min_service_interval': return '间隔(分钟)';
      case 'required_skill_match': return '必需技能';
      default: return '参数值';
    }
  };

  const RuleFormModal = ({ title, onConfirm }: { title: string; onConfirm: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">规则名称 *</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="如：技师每日最大5单"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">规则类型 *</label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="max_daily_orders">技师每日最大工单数</option>
              <option value="min_service_interval">同服务类型最小间隔</option>
              <option value="required_skill_match">技能必需匹配</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">严重级别 *</label>
            <select
              value={formSeverity}
              onChange={(e) => setFormSeverity(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="block">拦截（阻止派单）</option>
              <option value="warn">提醒（仅提示，不阻止）</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{getValueLabel(formType)} *</label>
            <input
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder={
                formType === 'max_daily_orders' ? '如：5'
                : formType === 'min_service_interval' ? '如：30'
                : '如：空调维修'
              }
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">描述</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              rows={2}
              placeholder="可选，对规则的补充说明"
            />
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={() => { setShowCreateModal(false); setShowEditModal(false); resetForm(); }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={actionLoading || !formName.trim() || !formValue.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading ? '处理中...' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">调度规则管理</h1>
            <p className="text-slate-500 mt-1">维护派单限制规则，区分拦截与提醒</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadRules}
              className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
            <button
              onClick={toggleLogPanel}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${showLogPanel ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <FileText className="w-4 h-4" />
              操作日志
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm flex items-center gap-1"
            >
              <Download className="w-4 h-4" />
              导出 CSV
            </button>
            {isAdmin && (
              <>
                <label className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-1 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  导入 CSV
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleImport}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={openCreateModal}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  新建规则
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: showLogPanel ? '1fr 380px' : '1fr' }}>
          <div>
            {loading ? (
              <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
                <div className="text-slate-400">加载中...</div>
              </div>
            ) : rules.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
                <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <div className="text-slate-400">暂无调度规则</div>
                {isAdmin && (
                  <button
                    onClick={openCreateModal}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    创建第一条规则
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`bg-white rounded-xl border p-4 transition-all ${
                      rule.enabled === 1
                        ? 'border-slate-200 hover:shadow-md'
                        : 'border-slate-100 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            rule.enabled === 1
                              ? rule.severity === 'block'
                                ? 'bg-red-100'
                                : 'bg-yellow-100'
                              : 'bg-slate-100'
                          }`}
                        >
                          {rule.enabled === 1 ? (
                            rule.severity === 'block' ? (
                              <AlertTriangle className="w-5 h-5 text-red-600" />
                            ) : (
                              <Info className="w-5 h-5 text-yellow-600" />
                            )
                          ) : (
                            <XCircle className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">{rule.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                typeLabels[rule.type]?.color
                              }`}
                            >
                              {typeLabels[rule.type]?.label}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                severityLabels[rule.severity]?.color
                              }`}
                            >
                              {severityLabels[rule.severity]?.label}
                            </span>
                            {rule.enabled === 0 && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                已停用
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {getValueLabel(rule.type)}: <span className="font-medium">{rule.value}</span>
                          </div>
                          {rule.description && (
                            <div className="mt-1 text-xs text-slate-500">{rule.description}</div>
                          )}
                          <div className="mt-2 text-xs text-slate-400">
                            创建: {formatDateTime(rule.created_at)} | 更新: {formatDateTime(rule.updated_at)}
                          </div>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleToggleEnabled(rule)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              rule.enabled === 1
                                ? 'text-green-600 hover:bg-green-50'
                                : 'text-slate-400 hover:bg-slate-50'
                            }`}
                            title={rule.enabled === 1 ? '点击停用' : '点击启用'}
                          >
                            {rule.enabled === 1 ? (
                              <ToggleRight className="w-6 h-6" />
                            ) : (
                              <ToggleLeft className="w-6 h-6" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(rule)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rule)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showLogPanel && (
            <div className="bg-white rounded-xl border border-slate-200 sticky top-6 max-h-[calc(100vh-120px)] overflow-y-auto">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">操作日志</h3>
                <button
                  onClick={loadLogs}
                  className="text-sm text-slate-500 hover:text-blue-600"
                >
                  刷新
                </button>
              </div>
              {logsLoading ? (
                <div className="p-8 text-center text-slate-400 text-sm">加载中...</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">暂无日志</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 hover:bg-slate-50">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            opTypeLabels[log.operation_type]?.color
                          }`}
                        >
                          {opTypeLabels[log.operation_type]?.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">{log.detail}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        操作人: {log.operator_name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <RuleFormModal title="新建调度规则" onConfirm={handleCreate} />
      )}

      {showEditModal && (
        <RuleFormModal title="编辑调度规则" onConfirm={handleEdit} />
      )}

      {showImportResult && importResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">CSV 导入结果</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{importResult.total}</div>
                  <div className="text-xs text-blue-600">总行数</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{importResult.success}</div>
                  <div className="text-xs text-green-600">成功</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-700">{importResult.failed}</div>
                  <div className="text-xs text-red-600">失败</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">错误详情</h4>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {importResult.errors.map((err, idx) => (
                      <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-2">
                        <div className="text-xs font-medium text-red-700">
                          第 {err.row} 行
                        </div>
                        <div className="text-xs text-red-600">{err.reason}</div>
                        {err.data && (
                          <div className="text-xs text-red-400 mt-1 font-mono break-all">
                            {err.data}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => { setShowImportResult(false); setImportResult(null); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
