import { Router } from 'express';
import { KnowledgeBaseService } from '../services/KnowledgeBaseService.js';
import { requireAuth, requireAdmin, requireSupervisor, requireCustomerService, AuthRequest } from '../middleware/auth.js';
import {
  KnowledgeStatus,
  KnowledgeEffectiveness,
  KnowledgeOperationType,
} from '../../shared/types.js';

const router = Router();

// ========== 分类 ==========
router.get('/categories', requireAuth, (req, res) => {
  try {
    const { enabled } = req.query;
    const data = KnowledgeBaseService.getCategories(
      enabled !== undefined ? parseInt(enabled as string) : undefined
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/categories', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, description, sort_order } = req.body;
    if (!name?.trim()) { res.status(400).json({ success: false, error: '分类名称不能为空' }); return; }
    const data = KnowledgeBaseService.createCategory(
      name, description || '', sort_order ? parseInt(sort_order) : 0,
      req.user!.id, req.user!.name
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.put('/categories/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, sort_order } = req.body;
    if (!name?.trim()) { res.status(400).json({ success: false, error: '分类名称不能为空' }); return; }
    const data = KnowledgeBaseService.updateCategory(
      id, name, description || '', sort_order ? parseInt(sort_order) : 0,
      req.user!.id, req.user!.name
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.put('/categories/:id/enabled', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { enabled } = req.body;
    if (enabled !== 0 && enabled !== 1 && enabled !== '0' && enabled !== '1') {
      res.status(400).json({ success: false, error: 'enabled 必须是 0 或 1' }); return;
    }
    const data = KnowledgeBaseService.setCategoryEnabled(
      id, parseInt(enabled as any), req.user!.id, req.user!.name
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.delete('/categories/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const ok = KnowledgeBaseService.deleteCategory(id, req.user!.id, req.user!.name);
    res.json({ success: true, message: ok ? '删除成功' : '删除失败' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ========== 配置 ==========
router.get('/configs', requireAuth, (req, res) => {
  try {
    res.json({ success: true, data: KnowledgeBaseService.getConfigs() });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/configs', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { config_key, config_value, description } = req.body;
    if (!config_key?.trim()) { res.status(400).json({ success: false, error: '缺少 config_key' }); return; }
    const data = KnowledgeBaseService.updateConfig(
      config_key, String(config_value ?? ''), description || '',
      req.user!.id, req.user!.name
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ========== 知识条目（具体路径必须在 :id 之前！）==========
router.get('/entries', requireAuth, (req: AuthRequest, res) => {
  try {
    const { status, category_id, keyword, limit, offset } = req.query;
    let created_by = req.user!.role === 'customer_service' ? req.user!.id : undefined;
    if (req.query.created_by && created_by === undefined) created_by = parseInt(req.query.created_by as string);
    const data = KnowledgeBaseService.getEntries({
      status: status as KnowledgeStatus | undefined,
      category_id: category_id ? parseInt(category_id as string) : undefined,
      created_by,
      keyword: keyword as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 导入/导出 - 具体路径
router.post('/entries/import', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ success: false, error: '缺少 csvContent 字段' }); return;
    }
    const result = KnowledgeBaseService.importKnowledgeCsv(csvContent, req.user!.id, req.user!.name);
    res.json({ success: true, data: result });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/entries/export', requireAuth, (req, res) => {
  try {
    const csv = KnowledgeBaseService.exportKnowledgeCsv();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="knowledge-entries-${timestamp}.csv"`);
    res.send(csv);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 创建
router.post('/entries', requireAuth, requireCustomerService, (req: AuthRequest, res) => {
  try {
    const { title, question, answer, applicable_products, escalation_condition,
            escalation_threshold, category_id, tags, expires_at } = req.body;
    if (!title?.trim()) { res.status(400).json({ success: false, error: '标题不能为空' }); return; }
    if (!category_id) { res.status(400).json({ success: false, error: '必须选择分类' }); return; }
    const data = KnowledgeBaseService.createEntry({
      title, question: question || '', answer: answer || '',
      applicable_products: applicable_products || '', escalation_condition: escalation_condition || '',
      escalation_threshold: escalation_threshold ? parseInt(escalation_threshold) : 3,
      category_id: parseInt(category_id), tags: tags || '', expires_at,
    }, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 更新/审核/停用/回滚 动作
router.post('/entries/:id/submit', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = KnowledgeBaseService.getEntryById(id);
    if (!entry) { res.status(404).json({ success: false, error: '条目不存在' }); return; }
    if (req.user!.role === 'customer_service' && entry.created_by !== req.user!.id) {
      res.status(403).json({ success: false, error: '只能提交自己创建的条目' }); return;
    }
    const data = KnowledgeBaseService.submitForReview(id, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/entries/:id/approve', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    const data = KnowledgeBaseService.approveAndPublish(id, remark || '', req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/entries/:id/reject', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    if (!remark?.trim()) { res.status(400).json({ success: false, error: '驳回必须填写理由' }); return; }
    const data = KnowledgeBaseService.rejectEntry(id, remark, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/entries/:id/disable', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    const data = KnowledgeBaseService.disableEntry(id, remark || '', req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/entries/:id/rollback', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { version_no } = req.body;
    if (version_no === undefined || version_no === null) {
      res.status(400).json({ success: false, error: '缺少 version_no 参数' }); return;
    }
    const data = KnowledgeBaseService.rollbackToVersion(id, parseInt(version_no as any), req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 更新（PUT）
router.put('/entries/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = KnowledgeBaseService.getEntryById(id);
    if (!entry) { res.status(404).json({ success: false, error: '条目不存在' }); return; }
    if (req.user!.role === 'customer_service' && entry.created_by !== req.user!.id) {
      res.status(403).json({ success: false, error: '只能编辑自己创建的条目' }); return;
    }
    const { title, question, answer, applicable_products, escalation_condition,
            escalation_threshold, category_id, tags, expires_at, change_log } = req.body;
    const data = KnowledgeBaseService.updateEntry(id, {
      title, question, answer, applicable_products, escalation_condition,
      escalation_threshold: escalation_threshold !== undefined ? parseInt(escalation_threshold) : undefined,
      category_id: category_id !== undefined ? parseInt(category_id) : undefined,
      tags, expires_at, change_log,
    }, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 删除
router.delete('/entries/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const ok = KnowledgeBaseService.deleteEntry(id, req.user!.id, req.user!.name);
    res.json({ success: true, message: ok ? '删除成功' : '删除失败' });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// 详情（含版本、命中、动作权限）
router.get('/entries/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = KnowledgeBaseService.getEntryDetail(id, req.user!.id, req.user!.role);
    if (!data) { res.status(404).json({ success: false, error: '条目不存在' }); return; }
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// 版本列表
router.get('/entries/:id/versions', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    res.json({ success: true, data: KnowledgeBaseService.getVersions(id) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ========== 匹配（工单按分类命中）==========
router.post('/match/:orderId', requireAuth, requireCustomerService, (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const data = KnowledgeBaseService.matchKnowledgeForOrder(orderId, req.user!.id, req.user!.name);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ========== 命中记录 ==========
router.get('/hit-records', requireAuth, (req: AuthRequest, res) => {
  try {
    const { entry_id, order_id, used, effectiveness, limit, offset } = req.query;
    let operator_id = req.user!.role === 'customer_service' ? req.user!.id : undefined;
    if (req.query.operator_id && operator_id === undefined) operator_id = parseInt(req.query.operator_id as string);
    const data = KnowledgeBaseService.getHitRecords({
      entry_id: entry_id ? parseInt(entry_id as string) : undefined,
      order_id: order_id ? parseInt(order_id as string) : undefined,
      operator_id,
      used: used !== undefined ? parseInt(used as string) : undefined,
      effectiveness: effectiveness as KnowledgeEffectiveness | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/hit-records/export', requireAuth, (req, res) => {
  try {
    const csv = KnowledgeBaseService.exportHitRecordsCsv();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="knowledge-hit-records-${timestamp}.csv"`);
    res.send(csv);
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/hit-records/:id/used', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { used } = req.body;
    const data = KnowledgeBaseService.markHitUsed(
      id, used === true || used === 1 || used === '1', req.user!.id, req.user!.name
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/hit-records/:id/feedback', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { effectiveness, feedback } = req.body;
    if (!effectiveness) { res.status(400).json({ success: false, error: '缺少 effectiveness 参数' }); return; }
    const data = KnowledgeBaseService.submitHitFeedback(
      id, effectiveness as KnowledgeEffectiveness, feedback || '', req.user!.id, req.user!.name
    );
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
});

// ========== 操作日志 ==========
router.get('/logs', requireAuth, (req, res) => {
  try {
    const { operation_type, related_type, related_id, limit, offset } = req.query;
    const data = KnowledgeBaseService.getOperationLogs({
      operation_type: operation_type as KnowledgeOperationType | undefined,
      related_type: related_type as string | undefined,
      related_id: related_id !== undefined && related_id !== null ? parseInt(related_id as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
