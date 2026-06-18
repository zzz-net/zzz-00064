import type {
  KnowledgeStatus,
  KnowledgeEffectiveness,
  KnowledgeOperationType,
  ImportResult,
} from '../types.js';

// ============================================================
// 知识库模块 - 前后端统一契约层
// 所有 API 路径、请求字段、响应结构、CSV 列头、权限定义必须从这里引用
// 禁止在前端或后端单独硬编码任何本模块内的字段名/路径
// ============================================================

// ---------- 路由路径常量 ----------
// 统一约定：契约路径是从 /api 之后开始的完整子路径（前后端一致）
// 前端: /api + KNOWLEDGE_ROUTES.XXX   后端挂载: app.use('/api', knowledgeRoutes) 内直接用
export const KNOWLEDGE_ROUTES = {
  CATEGORIES: '/knowledge/categories',
  CATEGORY_BY_ID: (id: number | string) => `/knowledge/categories/${id}`,
  CATEGORY_ENABLED: (id: number | string) => `/knowledge/categories/${id}/enabled`,

  CONFIGS: '/knowledge/configs',

  ENTRIES: '/knowledge/entries',
  ENTRIES_STATS: '/knowledge/entries/stats',
  ENTRIES_IMPORT: '/knowledge/entries/import',
  ENTRIES_EXPORT: '/knowledge/entries/export',
  ENTRY_BY_ID: (id: number | string) => `/knowledge/entries/${id}`,
  ENTRY_SUBMIT: (id: number | string) => `/knowledge/entries/${id}/submit`,
  ENTRY_APPROVE: (id: number | string) => `/knowledge/entries/${id}/approve`,
  ENTRY_REJECT: (id: number | string) => `/knowledge/entries/${id}/reject`,
  ENTRY_DISABLE: (id: number | string) => `/knowledge/entries/${id}/disable`,
  ENTRY_ROLLBACK: (id: number | string) => `/knowledge/entries/${id}/rollback`,
  ENTRY_VERSIONS: (id: number | string) => `/knowledge/entries/${id}/versions`,

  MATCH_ORDER: (orderId: number | string) => `/knowledge/match/${orderId}`,

  HIT_RECORDS: '/knowledge/hit-records',
  HIT_RECORDS_EXPORT: '/knowledge/hit-records/export',
  HIT_RECORD_USED: (id: number | string) => `/knowledge/hit-records/${id}/used`,
  HIT_RECORD_FEEDBACK: (id: number | string) => `/knowledge/hit-records/${id}/feedback`,

  LOGS: '/knowledge/logs',
} as const;

// ---------- HTTP 方法约定 ----------
export const KNOWLEDGE_HTTP_METHODS = {
  CATEGORIES: { LIST: 'GET', CREATE: 'POST' },
  CATEGORY_BY_ID: { UPDATE: 'PUT', DELETE: 'DELETE' },
  CATEGORY_ENABLED: { UPDATE: 'PUT' },
  CONFIGS: { LIST: 'GET', UPDATE: 'PUT' },
  ENTRIES: { LIST: 'GET', CREATE: 'POST' },
  ENTRIES_STATS: { GET: 'GET' },
  ENTRIES_IMPORT: { POST: 'POST' },
  ENTRIES_EXPORT: { GET: 'GET' },
  ENTRY_BY_ID: { GET: 'GET', UPDATE: 'PUT', DELETE: 'DELETE' },
  ENTRY_SUBMIT: { POST: 'POST' },
  ENTRY_APPROVE: { POST: 'POST' },
  ENTRY_REJECT: { POST: 'POST' },
  ENTRY_DISABLE: { POST: 'POST' },
  ENTRY_ROLLBACK: { POST: 'POST' },
  ENTRY_VERSIONS: { GET: 'GET' },
  MATCH_ORDER: { POST: 'POST' },
  HIT_RECORDS: { LIST: 'GET' },
  HIT_RECORDS_EXPORT: { GET: 'GET' },
  HIT_RECORD_USED: { POST: 'POST' },
  HIT_RECORD_FEEDBACK: { POST: 'POST' },
  LOGS: { LIST: 'GET' },
} as const;

// ---------- CSV 导入列头定义 ----------
export const KNOWLEDGE_CSV_HEADERS = {
  REQUIRED: ['标题', '分类', '常见问题', '处理话术'] as const,
  OPTIONAL: ['适用商品', '升级条件', '升级阈值', '标签', '失效时间'] as const,
  ALL: [
    '标题', '分类', '常见问题', '处理话术',
    '适用商品', '升级条件', '升级阈值', '标签', '失效时间',
  ] as const,
} as const;

export const KNOWLEDGE_CSV_EXPORT_HEADERS = [
  '条目ID', '标题', '分类', '状态', '版本', '常见问题', '处理话术',
  '适用商品', '升级条件', '升级阈值', '标签', '命中次数', '有效次数',
  '创建人', '创建时间', '发布时间', '失效时间',
] as const;

export const HIT_RECORDS_CSV_EXPORT_HEADERS = [
  '记录ID', '条目ID', '条目标题', '版本', '工单号', '工单ID', '分类',
  '匹配方式', '匹配关键词', '匹配分数', '是否采用', '效果反馈', '反馈备注',
  '操作人', '命中时间', '采用时间', '反馈时间',
] as const;

// ---------- 请求 DTO 类型 ----------

export interface CreateCategoryRequest {
  name: string;
  description?: string;
  sort_order?: number;
}

export interface UpdateCategoryRequest {
  name: string;
  description?: string;
  sort_order?: number;
}

export interface SetCategoryEnabledRequest {
  enabled: 0 | 1;
}

export interface UpdateConfigRequest {
  config_key: string;
  config_value: string;
  description?: string;
}

export interface QueryEntriesParams {
  status?: KnowledgeStatus;
  category_id?: number;
  created_by?: number;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface CreateEntryRequest {
  title: string;
  question?: string;
  answer?: string;
  applicable_products?: string;
  escalation_condition?: string;
  escalation_threshold?: number;
  category_id: number;
  tags?: string;
  expires_at?: string | null;
}

export interface UpdateEntryRequest {
  title?: string;
  question?: string;
  answer?: string;
  applicable_products?: string;
  escalation_condition?: string;
  escalation_threshold?: number;
  category_id?: number;
  tags?: string;
  expires_at?: string | null;
  change_log?: string;
}

export interface ApproveEntryRequest {
  remark?: string;
}

export interface RejectEntryRequest {
  remark: string;
}

export interface DisableEntryRequest {
  remark?: string;
}

export interface RollbackEntryRequest {
  version_no: number;
}

export interface ImportKnowledgeRequest {
  csvContent: string;
}

export interface QueryHitRecordsParams {
  entry_id?: number;
  order_id?: number;
  operator_id?: number;
  used?: 0 | 1;
  effectiveness?: KnowledgeEffectiveness;
  limit?: number;
  offset?: number;
}

export interface MarkHitUsedRequest {
  used: boolean | 0 | 1;
}

export interface SubmitHitFeedbackRequest {
  effectiveness: KnowledgeEffectiveness;
  feedback?: string;
}

export interface QueryLogsParams {
  operation_type?: KnowledgeOperationType;
  related_type?: string;
  related_id?: number;
  limit?: number;
  offset?: number;
}

// ---------- 响应 DTO 类型 ----------

export interface EntryStats {
  total: number;
  draft: number;
  pending_review: number;
  published: number;
  disabled: number;
}

// ---------- 权限定义 ----------

export type KnowledgePermissionKey =
  | 'category:view'
  | 'category:create'
  | 'category:update'
  | 'category:delete'
  | 'config:view'
  | 'config:update'
  | 'entry:view_all'
  | 'entry:view_own'
  | 'entry:create'
  | 'entry:edit_own'
  | 'entry:edit_any'
  | 'entry:submit_own'
  | 'entry:approve'
  | 'entry:reject'
  | 'entry:disable'
  | 'entry:rollback'
  | 'entry:delete'
  | 'entry:export'
  | 'entry:import'
  | 'hit:view_all'
  | 'hit:view_own'
  | 'hit:export'
  | 'log:view';

export const KNOWLEDGE_PERMISSIONS: Record<string, KnowledgePermissionKey[]> = {
  admin: [
    'category:view', 'category:create', 'category:update', 'category:delete',
    'config:view', 'config:update',
    'entry:view_all', 'entry:create', 'entry:edit_any', 'entry:submit_own',
    'entry:approve', 'entry:reject', 'entry:disable', 'entry:rollback', 'entry:delete',
    'entry:export', 'entry:import',
    'hit:view_all', 'hit:export',
    'log:view',
  ],
  supervisor: [
    'category:view',
    'config:view',
    'entry:view_all', 'entry:create', 'entry:edit_any', 'entry:submit_own',
    'entry:approve', 'entry:reject', 'entry:disable', 'entry:rollback',
    'entry:export',
    'hit:view_all', 'hit:export',
    'log:view',
  ],
  customer_service: [
    'category:view',
    'config:view',
    'entry:view_own', 'entry:create', 'entry:edit_own', 'entry:submit_own',
    'hit:view_own',
    'log:view',
  ],
  dispatcher: [
    'category:view',
    'config:view',
    'log:view',
  ],
} as const;

export function hasKnowledgePermission(
  role: string,
  permission: KnowledgePermissionKey
): boolean {
  const perms = KNOWLEDGE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

// ---------- 错误码（构建校验用） ----------
export const KNOWLEDGE_ERROR_CODES = {
  CATEGORY_NAME_EMPTY: 'KNOWLEDGE_CATEGORY_NAME_EMPTY',
  CATEGORY_NAME_DUPLICATE: 'KNOWLEDGE_CATEGORY_NAME_DUPLICATE',
  CATEGORY_NOT_FOUND: 'KNOWLEDGE_CATEGORY_NOT_FOUND',
  CATEGORY_IN_USE: 'KNOWLEDGE_CATEGORY_IN_USE',
  ENTRY_TITLE_EMPTY: 'KNOWLEDGE_ENTRY_TITLE_EMPTY',
  ENTRY_TITLE_DUPLICATE: 'KNOWLEDGE_ENTRY_TITLE_DUPLICATE',
  ENTRY_CATEGORY_INVALID: 'KNOWLEDGE_ENTRY_CATEGORY_INVALID',
  ENTRY_ANSWER_EMPTY: 'KNOWLEDGE_ENTRY_ANSWER_EMPTY',
  ENTRY_EXPIRES_AT_INVALID: 'KNOWLEDGE_ENTRY_EXPIRES_AT_INVALID',
  ENTRY_NOT_FOUND: 'KNOWLEDGE_ENTRY_NOT_FOUND',
  ENTRY_STATUS_INVALID: 'KNOWLEDGE_ENTRY_STATUS_INVALID',
  ENTRY_OWNER_MISMATCH: 'KNOWLEDGE_ENTRY_OWNER_MISMATCH',
  REJECT_REMARK_EMPTY: 'KNOWLEDGE_REJECT_REMARK_EMPTY',
  IMPORT_HEADER_MISSING: 'KNOWLEDGE_IMPORT_HEADER_MISSING',
  IMPORT_ROW_VALIDATION: 'KNOWLEDGE_IMPORT_ROW_VALIDATION',
  IMPORT_ATOMIC_ROLLBACK: 'KNOWLEDGE_IMPORT_ATOMIC_ROLLBACK',
  PERMISSION_DENIED: 'KNOWLEDGE_PERMISSION_DENIED',
} as const;

export type KnowledgeErrorCode = typeof KNOWLEDGE_ERROR_CODES[keyof typeof KNOWLEDGE_ERROR_CODES];

export interface KnowledgeImportError {
  row: number;
  code: KnowledgeErrorCode;
  reason: string;
  data: string;
}

export interface KnowledgeImportResult extends ImportResult {
  rolled_back: boolean;
  errors: KnowledgeImportError[];
}
