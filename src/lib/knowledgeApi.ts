// ============================================================
// 知识库模块 - 前端统一 API 封装
// 所有知识库相关的 API 调用必须通过这里，禁止在组件内直接拼路径/字段
// 路径、方法、字段名与 shared/contracts/knowledge.ts 一一对应
// ============================================================
import { api, ApiResponse } from './api.js';
import {
  KNOWLEDGE_ROUTES,
  KNOWLEDGE_HTTP_METHODS,
  hasKnowledgePermission,
  type CreateCategoryRequest,
  type UpdateCategoryRequest,
  type SetCategoryEnabledRequest,
  type UpdateConfigRequest,
  type CreateEntryRequest,
  type UpdateEntryRequest,
  type ApproveEntryRequest,
  type RejectEntryRequest,
  type DisableEntryRequest,
  type RollbackEntryRequest,
  type ImportKnowledgeRequest,
  type MarkHitUsedRequest,
  type SubmitHitFeedbackRequest,
  type QueryEntriesParams,
  type QueryHitRecordsParams,
  type QueryLogsParams,
  type EntryStats,
  type KnowledgeImportResult,
  type KnowledgePermissionKey,
} from '../../shared/contracts/knowledge.js';
import type {
  KnowledgeCategory,
  KnowledgeConfig,
  KnowledgeEntry,
  KnowledgeEntryDetail,
  KnowledgeVersion,
  KnowledgeHitRecord,
  KnowledgeOperationLog,
  KnowledgeMatchResult,
} from '../../shared/types.js';

// ---------- 权限辅助（前端侧 UI 显隐用，真正的权限校验在后端）----------
export function can(role: string, permission: KnowledgePermissionKey): boolean {
  return hasKnowledgePermission(role, permission);
}

// ---------- 分类 ----------
export const knowledgeCategoriesApi = {
  list: (params?: { enabled?: number }) => {
    const qs = new URLSearchParams();
    if (params?.enabled !== undefined) qs.set('enabled', String(params.enabled));
    return api.get<KnowledgeCategory[]>(
      `${KNOWLEDGE_ROUTES.CATEGORIES}${qs.toString() ? '?' + qs.toString() : ''}`
    );
  },
  create: (body: CreateCategoryRequest) =>
    api.post<KnowledgeCategory>(KNOWLEDGE_ROUTES.CATEGORIES, body),
  update: (id: number, body: UpdateCategoryRequest) =>
    api.put<KnowledgeCategory>(KNOWLEDGE_ROUTES.CATEGORY_BY_ID(id), body),
  setEnabled: (id: number, body: SetCategoryEnabledRequest) =>
    api.put<KnowledgeCategory>(KNOWLEDGE_ROUTES.CATEGORY_ENABLED(id), body),
  delete: (id: number) =>
    api.delete(KNOWLEDGE_ROUTES.CATEGORY_BY_ID(id)),
};

// ---------- 配置 ----------
export const knowledgeConfigsApi = {
  list: () => api.get<KnowledgeConfig[]>(KNOWLEDGE_ROUTES.CONFIGS),
  update: (body: UpdateConfigRequest) =>
    api.put<KnowledgeConfig>(KNOWLEDGE_ROUTES.CONFIGS, body),
};

// ---------- 统计 ----------
export const knowledgeEntriesStatsApi = {
  get: () => api.get<EntryStats>(KNOWLEDGE_ROUTES.ENTRIES_STATS),
};

// ---------- 条目 ----------
export const knowledgeEntriesApi = {
  list: (params?: QueryEntriesParams) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.category_id !== undefined) qs.set('category_id', String(params.category_id));
    if (params?.created_by !== undefined) qs.set('created_by', String(params.created_by));
    if (params?.keyword) qs.set('keyword', params.keyword);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    return api.get<KnowledgeEntry[]>(
      `${KNOWLEDGE_ROUTES.ENTRIES}${qs.toString() ? '?' + qs.toString() : ''}`
    );
  },
  create: (body: CreateEntryRequest) =>
    api.post<KnowledgeEntry>(KNOWLEDGE_ROUTES.ENTRIES, body),
  detail: (id: number) =>
    api.get<KnowledgeEntryDetail>(KNOWLEDGE_ROUTES.ENTRY_BY_ID(id)),
  update: (id: number, body: UpdateEntryRequest) =>
    api.put<KnowledgeEntry>(KNOWLEDGE_ROUTES.ENTRY_BY_ID(id), body),
  delete: (id: number) =>
    api.delete(KNOWLEDGE_ROUTES.ENTRY_BY_ID(id)),

  // 动作接口：全部用 POST（与契约一致）
  submit: (id: number) =>
    api.post<KnowledgeEntry>(KNOWLEDGE_ROUTES.ENTRY_SUBMIT(id), {}),
  approve: (id: number, body: ApproveEntryRequest = {}) =>
    api.post<KnowledgeEntry>(KNOWLEDGE_ROUTES.ENTRY_APPROVE(id), body),
  reject: (id: number, body: RejectEntryRequest) =>
    api.post<KnowledgeEntry>(KNOWLEDGE_ROUTES.ENTRY_REJECT(id), body),
  disable: (id: number, body: DisableEntryRequest = {}) =>
    api.post<KnowledgeEntry>(KNOWLEDGE_ROUTES.ENTRY_DISABLE(id), body),
  rollback: (id: number, body: RollbackEntryRequest) =>
    api.post<KnowledgeEntry>(KNOWLEDGE_ROUTES.ENTRY_ROLLBACK(id), body),
  versions: (id: number) =>
    api.get<KnowledgeVersion[]>(KNOWLEDGE_ROUTES.ENTRY_VERSIONS(id)),

  // 导入/导出
  // 注意字段名是 csvContent（不是 csv_text）
  importCsv: (body: ImportKnowledgeRequest) =>
    api.post<KnowledgeImportResult>(KNOWLEDGE_ROUTES.ENTRIES_IMPORT, body),
  exportCsv: async (params?: QueryEntriesParams) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.category_id !== undefined) qs.set('category_id', String(params.category_id));
    if (params?.keyword) qs.set('keyword', params.keyword);
    const url = `${KNOWLEDGE_ROUTES.ENTRIES_EXPORT}${qs.toString() ? '?' + qs.toString() : ''}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await api.download(url, `knowledge-entries-${timestamp}.csv`);
  },
};

// ---------- 匹配 ----------
export const knowledgeMatchApi = {
  forOrder: (orderId: number) =>
    api.post<KnowledgeMatchResult[]>(KNOWLEDGE_ROUTES.MATCH_ORDER(orderId), {}),
};

// ---------- 命中记录 ----------
export const knowledgeHitRecordsApi = {
  list: (params?: QueryHitRecordsParams) => {
    const qs = new URLSearchParams();
    if (params?.entry_id !== undefined) qs.set('entry_id', String(params.entry_id));
    if (params?.order_id !== undefined) qs.set('order_id', String(params.order_id));
    if (params?.operator_id !== undefined) qs.set('operator_id', String(params.operator_id));
    if (params?.used !== undefined) qs.set('used', String(params.used));
    if (params?.effectiveness) qs.set('effectiveness', params.effectiveness);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    return api.get<KnowledgeHitRecord[]>(
      `${KNOWLEDGE_ROUTES.HIT_RECORDS}${qs.toString() ? '?' + qs.toString() : ''}`
    );
  },
  markUsed: (id: number, body: MarkHitUsedRequest) =>
    api.post<KnowledgeHitRecord>(KNOWLEDGE_ROUTES.HIT_RECORD_USED(id), body),
  submitFeedback: (id: number, body: SubmitHitFeedbackRequest) =>
    api.post<KnowledgeHitRecord>(KNOWLEDGE_ROUTES.HIT_RECORD_FEEDBACK(id), body),
  exportCsv: async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await api.download(KNOWLEDGE_ROUTES.HIT_RECORDS_EXPORT, `knowledge-hit-records-${timestamp}.csv`);
  },
};

// ---------- 操作日志 ----------
export const knowledgeLogsApi = {
  list: (params?: QueryLogsParams) => {
    const qs = new URLSearchParams();
    if (params?.operation_type) qs.set('operation_type', params.operation_type);
    if (params?.related_type) qs.set('related_type', params.related_type);
    if (params?.related_id !== undefined) qs.set('related_id', String(params.related_id));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    return api.get<KnowledgeOperationLog[]>(
      `${KNOWLEDGE_ROUTES.LOGS}${qs.toString() ? '?' + qs.toString() : ''}`
    );
  },
};

// 统一导出对象
export const knowledgeApi = {
  categories: knowledgeCategoriesApi,
  configs: knowledgeConfigsApi,
  entriesStats: knowledgeEntriesStatsApi,
  entries: knowledgeEntriesApi,
  match: knowledgeMatchApi,
  hitRecords: knowledgeHitRecordsApi,
  logs: knowledgeLogsApi,
  can,
};

export type { ApiResponse };
