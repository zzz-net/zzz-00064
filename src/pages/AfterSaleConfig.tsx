import { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Plus,
  FileText,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  Clock,
  Image,
  Upload,
  Download,
  RefreshCw,
  History,
  CheckCircle,
  XCircle,
  AlertCircle,
  Save,
} from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import {
  ReturnVisitTemplate,
  AppealCategory,
  AfterSaleConfig,
  AfterSaleOperationLog,
} from '../../shared/types.js';

const opTypeLabels: Record<string, { label: string; color: string }> = {
  config_created: { label: '创建配置', color: 'bg-green-100 text-green-700' },
  config_updated: { label: '更新配置', color: 'bg-blue-100 text-blue-700' },
  config_deleted: { label: '删除配置', color: 'bg-red-100 text-red-700' },
  template_created: { label: '创建模板', color: 'bg-green-100 text-green-700' },
  template_updated: { label: '更新模板', color: 'bg-blue-100 text-blue-700' },
  template_deleted: { label: '删除模板', color: 'bg-red-100 text-red-700' },
  category_created: { label: '创建分类', color: 'bg-green-100 text-green-700' },
  category_updated: { label: '更新分类', color: 'bg-blue-100 text-blue-700' },
  category_deleted: { label: '删除分类', color: 'bg-red-100 text-red-700' },
  import_success: { label: '导入成功', color: 'bg-green-100 text-green-700' },
  import_failure: { label: '导入失败', color: 'bg-red-100 text-red-700' },
  export_result: { label: '导出数据', color: 'bg-purple-100 text-purple-700' },
  visit_created: { label: '发起回访', color: 'bg-blue-100 text-blue-700' },
  visit_completed: { label: '完成回访', color: 'bg-green-100 text-green-700' },
  visit_cancelled: { label: '取消回访', color: 'bg-slate-100 text-slate-700' },
  appeal_created: { label: '提交申诉', color: 'bg-orange-100 text-orange-700' },
  appeal_accepted: { label: '受理申诉', color: 'bg-blue-100 text-blue-700' },
  appeal_rejected: { label: '驳回申诉', color: 'bg-red-100 text-red-700' },
  appeal_reassigned: { label: '转派申诉', color: 'bg-yellow-100 text-yellow-700' },
  appeal_resolved: { label: '解决申诉', color: 'bg-green-100 text-green-700' },
  appeal_withdrawn: { label: '撤回申诉', color: 'bg-slate-100 text-slate-700' },
};

export default function AfterSaleConfig() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [templates, setTemplates] = useState<ReturnVisitTemplate[]>([]);
  const [categories, setCategories] = useState<AppealCategory[]>([]);
  const [configs, setConfigs] = useState<AfterSaleConfig[]>([]);
  const [logs, setLogs] = useState<AfterSaleOperationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'templates' | 'categories' | 'configs' | 'logs'>('templates');

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [formTplName, setFormTplName] = useState('');
  const [formTplContent, setFormTplContent] = useState('');

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [formCatName, setFormCatName] = useState('');
  const [formCatDesc, setFormCatDesc] = useState('');

  const [actionLoading, setActionLoading] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tplRes, catRes, cfgRes] = await Promise.all([
        api.get('/after-sale/templates'),
        api.get('/after-sale/categories'),
        api.get('/after-sale/configs'),
      ]);
      setTemplates(tplRes.data || []);
      setCategories(catRes.data || []);
      setConfigs(cfgRes.data || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await api.get('/after-sale/logs?limit=100');
      setLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab]);

  const handleSaveTemplate = async () => {
    if (!formTplName.trim() || !formTplContent.trim()) return;
    setActionLoading(true);
    try {
      if (editingTemplateId) {
        await api.put(`/after-sale/templates/${editingTemplateId}`, {
          name: formTplName,
          content: formTplContent,
        });
      } else {
        await api.post('/after-sale/templates', {
          name: formTplName,
          content: formTplContent,
        });
      }
      setShowTemplateModal(false);
      setEditingTemplateId(null);
      setFormTplName('');
      setFormTplContent('');
      await loadAll();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditTemplate = (tpl: ReturnVisitTemplate) => {
    setEditingTemplateId(tpl.id);
    setFormTplName(tpl.name);
    setFormTplContent(tpl.content);
    setShowTemplateModal(true);
  };

  const handleToggleTemplate = async (tpl: ReturnVisitTemplate) => {
    try {
      await api.put(`/after-sale/templates/${tpl.id}/enabled`, {
        enabled: tpl.enabled === 1 ? 0 : 1,
      });
      await loadAll();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('确定删除该回访模板？')) return;
    try {
      await api.delete(`/after-sale/templates/${id}`);
      await loadAll();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleSaveCategory = async () => {
    if (!formCatName.trim()) return;
    setActionLoading(true);
    try {
      if (editingCategoryId) {
        await api.put(`/after-sale/categories/${editingCategoryId}`, {
          name: formCatName,
          description: formCatDesc,
        });
      } else {
        await api.post('/after-sale/categories', {
          name: formCatName,
          description: formCatDesc,
        });
      }
      setShowCategoryModal(false);
      setEditingCategoryId(null);
      setFormCatName('');
      setFormCatDesc('');
      await loadAll();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditCategory = (cat: AppealCategory) => {
    setEditingCategoryId(cat.id);
    setFormCatName(cat.name);
    setFormCatDesc(cat.description || '');
    setShowCategoryModal(true);
  };

  const handleToggleCategory = async (cat: AppealCategory) => {
    try {
      await api.put(`/after-sale/categories/${cat.id}/enabled`, {
        enabled: cat.enabled === 1 ? 0 : 1,
      });
      await loadAll();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('确定删除该申诉分类？')) return;
    try {
      await api.delete(`/after-sale/categories/${id}`);
      await loadAll();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleUpdateConfig = async (cfg: AfterSaleConfig, newValue: string) => {
    try {
      await api.put('/after-sale/configs', {
        config_key: cfg.config_key,
        config_value: newValue,
        description: cfg.description,
      });
      await loadAll();
    } catch (err: any) {
      alert(err.message || '更新失败');
    }
  };

  const renderConfigValue = (cfg: AfterSaleConfig) => {
    if (cfg.config_key === 'appeal_image_required') {
      return (
        <select
          className="px-2 py-1 border rounded text-sm w-24"
          defaultValue={cfg.config_value}
          disabled={!isAdmin}
          onChange={async (e) => {
            await handleUpdateConfig(cfg, e.target.value);
          }}
        >
          <option value="0">否</option>
          <option value="1">是</option>
        </select>
      );
    }
    if (cfg.config_key.endsWith('_hours')) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            defaultValue={cfg.config_value}
            disabled={!isAdmin}
            className="px-2 py-1 border rounded text-sm w-20"
            onBlur={async (e) => {
              if (e.target.value !== cfg.config_value) {
                await handleUpdateConfig(cfg, e.target.value);
              }
            }}
          />
          <span className="text-slate-500 text-sm">小时</span>
        </div>
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

  const configIcons: Record<string, any> = {
    visit_timeout_hours: Clock,
    appeal_timeout_hours: Clock,
    appeal_image_required: Image,
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Settings className="w-7 h-7 text-blue-600" />
              售后配置管理
            </h1>
            <p className="text-slate-500 mt-1">管理回访模板、申诉分类、超时阈值等配置</p>
          </div>
          <button
            onClick={loadAll}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-white border rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border">
          <div className="border-b px-4 flex gap-1">
            {[
              { key: 'templates', label: '回访模板', icon: FileText },
              { key: 'categories', label: '申诉分类', icon: Tag },
              { key: 'configs', label: '参数配置', icon: Settings },
              { key: 'logs', label: '操作日志', icon: History },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 -mb-px transition-colors ${
                  activeTab === key
                    ? 'border-blue-500 text-blue-600 font-medium'
                    : 'border-transparent text-slate-600 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {activeTab === 'templates' && (
              <div>
                {isAdmin && (
                  <div className="mb-4 flex gap-2">
                    <button
                      onClick={() => {
                        setEditingTemplateId(null);
                        setFormTplName('');
                        setFormTplContent('');
                        setShowTemplateModal(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      新增模板
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">ID</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">模板名称</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">模板内容</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">创建时间</th>
                        {isAdmin && <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {templates.map((tpl) => (
                        <tr key={tpl.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{tpl.id}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{tpl.name}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-md">
                            <div className="truncate" title={tpl.content}>{tpl.content}</div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => isAdmin && handleToggleTemplate(tpl)}
                              className={isAdmin ? 'cursor-pointer' : 'cursor-default'}
                              disabled={!isAdmin}
                            >
                              {tpl.enabled === 1 ? (
                                <ToggleRight className="w-8 h-8 text-green-600" />
                              ) : (
                                <ToggleLeft className="w-8 h-8 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{tpl.created_at}</td>
                          {isAdmin && (
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditTemplate(tpl)}
                                  className="text-blue-600 hover:text-blue-700"
                                  title="编辑"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.id)}
                                  className="text-red-600 hover:text-red-700"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {templates.length === 0 && (
                        <tr>
                          <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-slate-400">
                            暂无数据
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'categories' && (
              <div>
                {isAdmin && (
                  <div className="mb-4 flex gap-2">
                    <button
                      onClick={() => {
                        setEditingCategoryId(null);
                        setFormCatName('');
                        setFormCatDesc('');
                        setShowCategoryModal(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      新增分类
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">ID</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">分类名称</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">描述</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">创建时间</th>
                        {isAdmin && <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {categories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{cat.id}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{cat.name}</td>
                          <td className="px-4 py-3 text-slate-600">{cat.description || '-'}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => isAdmin && handleToggleCategory(cat)}
                              className={isAdmin ? 'cursor-pointer' : 'cursor-default'}
                              disabled={!isAdmin}
                            >
                              {cat.enabled === 1 ? (
                                <ToggleRight className="w-8 h-8 text-green-600" />
                              ) : (
                                <ToggleLeft className="w-8 h-8 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{cat.created_at}</td>
                          {isAdmin && (
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditCategory(cat)}
                                  className="text-blue-600 hover:text-blue-700"
                                  title="编辑"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(cat.id)}
                                  className="text-red-600 hover:text-red-700"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {categories.length === 0 && (
                        <tr>
                          <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-slate-400">
                            暂无数据
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'configs' && (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">配置项</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">说明</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">值</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">更新时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {configs.map((cfg) => {
                        const Icon = configIcons[cfg.config_key] || Settings;
                        return (
                          <tr key={cfg.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-slate-500" />
                                <span className="font-medium text-slate-800">{cfg.config_key}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{cfg.description}</td>
                            <td className="px-4 py-3">{renderConfigValue(cfg)}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{cfg.updated_at}</td>
                          </tr>
                        );
                      })}
                      {configs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                            暂无数据
                          </td>
                        </tr>
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
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">时间</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">操作类型</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">操作人</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">详情</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {logs.map((log) => {
                        const label = opTypeLabels[log.operation_type] || { label: log.operation_type, color: 'bg-slate-100 text-slate-700' };
                        return (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{log.created_at}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${label.color}`}>
                                {label.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{log.operator_name}</td>
                            <td className="px-4 py-3 text-slate-600 max-w-md truncate" title={log.detail}>{log.detail}</td>
                          </tr>
                        );
                      })}
                      {logs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                            暂无日志
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-xl p-6">
              <h3 className="text-lg font-bold mb-4">
                {editingTemplateId ? '编辑回访模板' : '新增回访模板'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">模板名称 *</label>
                  <input
                    type="text"
                    value={formTplName}
                    onChange={(e) => setFormTplName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="请输入模板名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">模板内容 *</label>
                  <textarea
                    value={formTplContent}
                    onChange={(e) => setFormTplContent(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg h-32 resize-none"
                    placeholder="请输入回访话术内容"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Save className="w-4 h-4" />
                  {actionLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showCategoryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-lg p-6">
              <h3 className="text-lg font-bold mb-4">
                {editingCategoryId ? '编辑申诉分类' : '新增申诉分类'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">分类名称 *</label>
                  <input
                    type="text"
                    value={formCatName}
                    onChange={(e) => setFormCatName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="请输入分类名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">描述</label>
                  <textarea
                    value={formCatDesc}
                    onChange={(e) => setFormCatDesc(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg h-24 resize-none"
                    placeholder="请输入分类描述（可选）"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveCategory}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Save className="w-4 h-4" />
                  {actionLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
