import { Router } from 'express';
import { KnowledgeBaseService } from '../services/KnowledgeBaseService.js';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.js';
import {
  KNOWLEDGE_ROUTES,
  KNOWLEDGE_ERROR_CODES,
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
  KnowledgeStatus,
  KnowledgeEffectiveness,
  KnowledgeOperationType,
} from '../../shared/types.js';

const router = Router();

function requirePermission(permission: KnowledgePermissionKey) {
  return (req: AuthRequest, res: any, next: any) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }
    if (!hasKnowledgePermission(req.user.role, permission)) {
      res.status(403).json({
        success: false,
        error: `权限不足，缺少: ${permission}`,
        code: KNOWLEDGE_ERROR_CODES.PERMISSION_DENIED,
      });
      return;
    }
    next();
  };
}

// ========== 分类 ==========
router.get(KNOWLEDGE_ROUTES.CATEGORIES, requireAuth, requirePermission('category:view'), (req, res) => {
  try {
    const { enabled } = req.query;
    const data = KnowledgeBaseService.getCategories(
      enabled !== undefined ? parseInt(enabled as string) : undefined
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post(KNOWLEDGE_ROUTES.CATEGORIES, requireAuth, requirePermission('category:create'), (req: AuthRequest, res) => {
  try {
    const body = req.body as CreateCategoryRequest;
    const name = body.name?.trim();
    const description = body.description?.trim() || '';
    const sort_order = body.sort_order !== undefined ? parseInt(body.sort_order as any) : 0;
    if (!name) {
      res.status(400).json({ success: false, error: '分类名称不能为空', code: KNOWLEDGE_ERROR_CODES.CATEGORY_NAME_EMPTY });
      return;
    }
    const data = KnowledgeBaseService.createCategory(name, description, sort_order, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) {
    const code = e.message === '分类名称已存在' ? KNOWLEDGE_ERROR_CODES.CATEGORY_NAME_DUPLICATE : undefined;
    res.status(400).json({ success: false, error: e.message, ...(code && { code }) });
  }
});

router.put(KNOWLEDGE_ROUTES.CATEGORY_BY_ID(':id'), requireAuth, requirePermission('category:update'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as UpdateCategoryRequest;
    const name = body.name?.trim();
    const description = body.description?.trim() || '';
    const sort_order = body.sort_order !== undefined ? parseInt(body.sort_order as any) : 0;
    if (!name) {
      res.status(400).json({ success: false, error: '分类名称不能为空', code: KNOWLEDGE_ERROR_CODES.CATEGORY_NAME_EMPTY });
      return;
    }
    const data = KnowledgeBaseService.updateCategory(id, name, description, sort_order, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) {
    let code: string | undefined;
    if (e.message === '分类名称已存在') code = KNOWLEDGE_ERROR_CODES.CATEGORY_NAME_DUPLICATE;
    if (e.message === '分类不存在') code = KNOWLEDGE_ERROR_CODES.CATEGORY_NOT_FOUND;
    res.status(400).json({ success: false, error: e.message, ...(code && { code }) });
  }
});

router.put(KNOWLEDGE_ROUTES.CATEGORY_ENABLED(':id'), requireAuth, requirePermission('category:update'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as SetCategoryEnabledRequest;
    const enabled = body.enabled;
    if (enabled !== 0 && enabled !== 1 && enabled !== '0' && enabled !== '1') {
      res.status(400).json({ success: false, error: 'enabled 必须是 0 或 1' });
      return;
    }
    const data = KnowledgeBaseService.setCategoryEnabled(id, parseInt(enabled as any), req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) {
    const code = e.message === '分类不存在' ? KNOWLEDGE_ERROR_CODES.CATEGORY_NOT_FOUND : undefined;
    res.status(400).json({ success: false, error: e.message, ...(code && { code }) });
  }
});

router.delete(KNOWLEDGE_ROUTES.CATEGORY_BY_ID(':id'), requireAuth, requirePermission('category:delete'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const ok = KnowledgeBaseService.deleteCategory(id, req.user!.id, req.user!.name);
    res.json({ success: true, message: ok ? '删除成功' : '删除失败' });
  } catch (e: any) {
    let code: string | undefined;
    if (e.message === '分类不存在') code = KNOWLEDGE_ERROR_CODES.CATEGORY_NOT_FOUND;
    if (e.message.includes('存在知识条目')) code = KNOWLEDGE_ERROR_CODES.CATEGORY_IN_USE;
    res.status(400).json({ success: false, error: e.message, ...(code && { code }) });
  }
});

// ========== 配置 ==========
router.get(KNOWLEDGE_ROUTES.CONFIGS, requireAuth, requirePermission('config:view'), (req, res) => {
  try {
    res.json({ success: true, data: KnowledgeBaseService.getConfigs() });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put(KNOWLEDGE_ROUTES.CONFIGS, requireAuth, requirePermission('config:update'), (req: AuthRequest, res) => {
  try {
    const body = req.body as UpdateConfigRequest;
    const config_key = body.config_key?.trim();
    const config_value = String(body.config_value ?? '');
    const description = body.description?.trim() || '';
    if (!config_key) {
      res.status(400).json({ success: false, error: '缺少 config_key' });
      return;
    }
    const data = KnowledgeBaseService.updateConfig(config_key, config_value, description, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ========== 统计接口（必需） ==========
router.get(KNOWLEDGE_ROUTES.ENTRIES_STATS, requireAuth, (req: AuthRequest, res) => {
  try {
    let created_by = hasKnowledgePermission(req.user!.role, 'entry:view_all')
      ? undefined
      : req.user!.id;
    const stats: EntryStats = KnowledgeBaseService.getEntriesStats({ created_by });
    res.json({ success: true, data: stats });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ========== 知识条目 ==========
router.get(KNOWLEDGE_ROUTES.ENTRIES, requireAuth, (req: AuthRequest, res) => {
  try {
    const { status, category_id, keyword, limit, offset } = req.query;
    let created_by: number | undefined;
    if (!hasKnowledgePermission(req.user!.role, 'entry:view_all')) {
      created_by = req.user!.id;
    }
    if (req.query.created_by !== undefined && created_by === undefined) {
      created_by = parseInt(req.query.created_by as string);
    }
    const params: QueryEntriesParams = {
      status: status as KnowledgeStatus | undefined,
      category_id: category_id ? parseInt(category_id as string) : undefined,
      created_by,
      keyword: keyword as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    };
    const data = KnowledgeBaseService.getEntries(params);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 导入 - 仅管理员
router.post(KNOWLEDGE_ROUTES.ENTRIES_IMPORT, requireAuth, requirePermission('entry:import'), (req: AuthRequest, res) => {
  try {
    const body = req.body as ImportKnowledgeRequest;
    const csvContent = body.csvContent;
    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({
        success: false,
        error: '缺少 csvContent 字段（注意字段名是 csvContent 不是 csv_text）',
      });
      return;
    }
    const result = KnowledgeBaseService.importKnowledgeCsvAtomic(csvContent, req.user!.id, req.user!.name) as KnowledgeImportResult;
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(400).json({
      success: false,
      error: e.message,
      code: KNOWLEDGE_ERROR_CODES.IMPORT_ATOMIC_ROLLBACK,
    });
  }
});

// 导出 - 主管及以上
router.get(KNOWLEDGE_ROUTES.ENTRIES_EXPORT, requireAuth, requirePermission('entry:export'), (req, res) => {
  try {
    const csv = KnowledgeBaseService.exportKnowledgeCsv();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="knowledge-entries-${timestamp}.csv"`);
    res.send(csv);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 创建
router.post(KNOWLEDGE_ROUTES.ENTRIES, requireAuth, requirePermission('entry:create'), (req: AuthRequest, res) => {
  try {
    const body = req.body as CreateEntryRequest;
    const title = body.title?.trim();
    const category_id = body.category_id;
    if (!title) {
      res.status(400).json({ success: false, error: '标题不能为空', code: KNOWLEDGE_ERROR_CODES.ENTRY_TITLE_EMPTY });
      return;
    }
    if (!category_id) {
      res.status(400).json({ success: false, error: '必须选择分类', code: KNOWLEDGE_ERROR_CODES.ENTRY_CATEGORY_INVALID });
      return;
    }
    const data = KnowledgeBaseService.createEntry({
      title,
      question: body.question || '',
      answer: body.answer || '',
      applicable_products: body.applicable_products || '',
      escalation_condition: body.escalation_condition || '',
      escalation_threshold: body.escalation_threshold !== undefined
        ? parseInt(body.escalation_threshold as any)
        : 3,
      category_id: parseInt(category_id as any),
      tags: body.tags || '',
      expires_at: body.expires_at || undefined,
    }, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) {
    let code: string | undefined;
    if (e.message === '标题已存在，请勿重复录入') code = KNOWLEDGE_ERROR_CODES.ENTRY_TITLE_DUPLICATE;
    if (e.message === '分类不存在') code = KNOWLEDGE_ERROR_CODES.ENTRY_CATEGORY_INVALID;
    if (e.message === '失效时间格式无效') code = KNOWLEDGE_ERROR_CODES.ENTRY_EXPIRES_AT_INVALID;
    res.status(400).json({ success: false, error: e.message, ...(code && { code }) });
  }
});

// 提交审核（POST，前端别用 PUT）
router.post(KNOWLEDGE_ROUTES.ENTRY_SUBMIT(':id'), requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = KnowledgeBaseService.getEntryById(id);
    if (!entry) {
      res.status(404).json({ success: false, error: '条目不存在', code: KNOWLEDGE_ERROR_CODES.ENTRY_NOT_FOUND });
      return;
    }
    if (hasKnowledgePermission(req.user!.role, 'entry:submit_own')
        && req.user!.role === 'customer_service'
        && entry.created_by !== req.user!.id) {
      res.status(403).json({
        success: false,
        error: '只能提交自己创建的条目',
        code: KNOWLEDGE_ERROR_CODES.ENTRY_OWNER_MISMATCH,
      });
      return;
    }
    const data = KnowledgeBaseService.submitForReview(id, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) {
    const code = e.message.startsWith('当前状态为') ? KNOWLEDGE_ERROR_CODES.ENTRY_STATUS_INVALID : undefined;
    res.status(400).json({ success: false, error: e.message, ...(code && { code }) });
  }
});

// 审核通过
router.post(KNOWLEDGE_ROUTES.ENTRY_APPROVE(':id'), requireAuth, requirePermission('entry:approve'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as ApproveEntryRequest;
    const data = KnowledgeBaseService.approveAndPublish(id, (body.remark || '').trim(), req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 驳回
router.post(KNOWLEDGE_ROUTES.ENTRY_REJECT(':id'), requireAuth, requirePermission('entry:reject'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as RejectEntryRequest;
    const remark = body.remark?.trim();
    if (!remark) {
      res.status(400).json({
        success: false,
        error: '驳回必须填写理由',
        code: KNOWLEDGE_ERROR_CODES.REJECT_REMARK_EMPTY,
      });
      return;
    }
    const data = KnowledgeBaseService.rejectEntry(id, remark, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 停用
router.post(KNOWLEDGE_ROUTES.ENTRY_DISABLE(':id'), requireAuth, requirePermission('entry:disable'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as DisableEntryRequest;
    const remark = (body.remark || '').trim();
    const data = KnowledgeBaseService.disableEntry(id, remark, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 回滚
router.post(KNOWLEDGE_ROUTES.ENTRY_ROLLBACK(':id'), requireAuth, requirePermission('entry:rollback'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as RollbackEntryRequest;
    const version_no = body.version_no;
    if (version_no === undefined || version_no === null || isNaN(parseInt(version_no as any))) {
      res.status(400).json({
        success: false,
        error: '缺少或无效 version_no 参数（注意字段名是 version_no 不是 version_id）',
      });
      return;
    }
    const data = KnowledgeBaseService.rollbackToVersion(id, parseInt(version_no as any), req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 更新（PUT）
router.put(KNOWLEDGE_ROUTES.ENTRY_BY_ID(':id'), requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = KnowledgeBaseService.getEntryById(id);
    if (!entry) {
      res.status(404).json({ success: false, error: '条目不存在', code: KNOWLEDGE_ERROR_CODES.ENTRY_NOT_FOUND });
      return;
    }
    const canEditAny = hasKnowledgePermission(req.user!.role, 'entry:edit_any');
    const canEditOwn = hasKnowledgePermission(req.user!.role, 'entry:edit_own');
    if (!canEditAny && (!canEditOwn || entry.created_by !== req.user!.id)) {
      res.status(403).json({
        success: false,
        error: canEditOwn ? '只能编辑自己创建的条目' : '权限不足：无法编辑条目',
        code: KNOWLEDGE_ERROR_CODES.ENTRY_OWNER_MISMATCH,
      });
      return;
    }
    const body = req.body as UpdateEntryRequest;
    const data = KnowledgeBaseService.updateEntry(id, {
      title: body.title,
      question: body.question,
      answer: body.answer,
      applicable_products: body.applicable_products,
      escalation_condition: body.escalation_condition,
      escalation_threshold: body.escalation_threshold !== undefined
        ? parseInt(body.escalation_threshold as any)
        : undefined,
      category_id: body.category_id !== undefined
        ? parseInt(body.category_id as any)
        : undefined,
      tags: body.tags,
      expires_at: body.expires_at,
      change_log: body.change_log,
    }, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 删除
router.delete(KNOWLEDGE_ROUTES.ENTRY_BY_ID(':id'), requireAuth, requirePermission('entry:delete'), (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const ok = KnowledgeBaseService.deleteEntry(id, req.user!.id, req.user!.name);
    res.json({ success: true, message: ok ? '删除成功' : '删除失败' });
  } catch (e: any) {
    const code = e.message === '知识条目不存在' ? KNOWLEDGE_ERROR_CODES.ENTRY_NOT_FOUND : undefined;
    res.status(400).json({ success: false, error: e.message, ...(code && { code }) });
  }
});

// 详情（含版本、命中、动作权限）
router.get(KNOWLEDGE_ROUTES.ENTRY_BY_ID(':id'), requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = KnowledgeBaseService.getEntryDetail(id, req.user!.id, req.user!.role);
    if (!data) {
      res.status(404).json({ success: false, error: '条目不存在', code: KNOWLEDGE_ERROR_CODES.ENTRY_NOT_FOUND });
      return;
    }
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 版本列表
router.get(KNOWLEDGE_ROUTES.ENTRY_VERSIONS(':id'), requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    res.json({ success: true, data: KnowledgeBaseService.getVersions(id) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ========== 匹配（工单按分类命中）==========
router.post(KNOWLEDGE_ROUTES.MATCH_ORDER(':orderId'), requireAuth, requireRoles(['customer_service', 'supervisor', 'admin']), (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const data = KnowledgeBaseService.matchKnowledgeForOrder(orderId, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ========== 命中记录 ==========
router.get(KNOWLEDGE_ROUTES.HIT_RECORDS, requireAuth, (req: AuthRequest, res) => {
  try {
    const { entry_id, order_id, used, effectiveness, limit, offset } = req.query;
    let operator_id: number | undefined;
    if (!hasKnowledgePermission(req.user!.role, 'hit:view_all')) {
      operator_id = req.user!.id;
    }
    if (req.query.operator_id !== undefined && operator_id === undefined) {
      operator_id = parseInt(req.query.operator_id as string);
    }
    const params: QueryHitRecordsParams = {
      entry_id: entry_id ? parseInt(entry_id as string) : undefined,
      order_id: order_id ? parseInt(order_id as string) : undefined,
      operator_id,
      used: used !== undefined ? parseInt(used as string) as 0 | 1 : undefined,
      effectiveness: effectiveness as KnowledgeEffectiveness | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    };
    const data = KnowledgeBaseService.getHitRecords(params);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 命中记录导出 - 主管及以上
router.get(KNOWLEDGE_ROUTES.HIT_RECORDS_EXPORT, requireAuth, requirePermission('hit:export'), (req, res) => {
  try {
    const csv = KnowledgeBaseService.exportHitRecordsCsv();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="knowledge-hit-records-${timestamp}.csv"`);
    res.send(csv);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post(KNOWLEDGE_ROUTES.HIT_RECORD_USED(':id'), requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as MarkHitUsedRequest;
    const usedRaw = body.used as any;
    const used = usedRaw === true || usedRaw === 1 || usedRaw === '1';
    const data = KnowledgeBaseService.markHitUsed(id, used, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post(KNOWLEDGE_ROUTES.HIT_RECORD_FEEDBACK(':id'), requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body as SubmitHitFeedbackRequest;
    if (!body.effectiveness) {
      res.status(400).json({ success: false, error: '缺少 effectiveness 参数' });
      return;
    }
    const data = KnowledgeBaseService.submitHitFeedback(
      id,
      body.effectiveness as KnowledgeEffectiveness,
      (body.feedback || '').trim(),
      req.user!.id,
      req.user!.name,
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ========== 操作日志 ==========
router.get(KNOWLEDGE_ROUTES.LOGS, requireAuth, requirePermission('log:view'), (req, res) => {
  try {
    const { operation_type, related_type, related_id, limit, offset } = req.query;
    const params: QueryLogsParams = {
      operation_type: operation_type as KnowledgeOperationType | undefined,
      related_type: related_type as string | undefined,
      related_id: related_id !== undefined && related_id !== null ? parseInt(related_id as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    };
    const data = KnowledgeBaseService.getOperationLogs(params);
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
