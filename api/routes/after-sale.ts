import { Router } from 'express';
import { AfterSaleService } from '../services/AfterSaleService.js';
import { requireAuth, requireAdmin, requireSupervisor, requireCustomerService, AuthRequest } from '../middleware/auth.js';
import {
  ReturnVisitStatus,
  ReturnVisitResult,
  AppealStatus,
  AfterSaleOperationType,
} from '../../shared/types.js';

const router = Router();

// ========== 回访模板 ==========
router.get('/templates', requireAuth, (req, res) => {
  try {
    const { enabled } = req.query;
    const templates = AfterSaleService.getTemplates(
      enabled !== undefined ? parseInt(enabled as string) : undefined
    );
    res.json({ success: true, data: templates });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/templates', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, content } = req.body;
    if (!name || !content) {
      res.status(400).json({ success: false, error: '请填写模板名称和内容' });
      return;
    }
    const tpl = AfterSaleService.createTemplate(name, content, req.user!.id, req.user!.name);
    res.json({ success: true, data: tpl });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/templates/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, content } = req.body;
    if (!name || !content) {
      res.status(400).json({ success: false, error: '请填写模板名称和内容' });
      return;
    }
    const tpl = AfterSaleService.updateTemplate(id, name, content, req.user!.id, req.user!.name);
    res.json({ success: true, data: tpl });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/templates/:id/enabled', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { enabled } = req.body;
    if (enabled === undefined || enabled === null) {
      res.status(400).json({ success: false, error: '请提供 enabled 参数' });
      return;
    }
    const tpl = AfterSaleService.setTemplateEnabled(id, enabled, req.user!.id, req.user!.name);
    res.json({ success: true, data: tpl });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/templates/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = AfterSaleService.deleteTemplate(id, req.user!.id, req.user!.name);
    if (!success) {
      res.status(404).json({ success: false, error: '模板不存在' });
      return;
    }
    res.json({ success: true, message: '模板已删除' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ========== 申诉分类 ==========
router.get('/categories', requireAuth, (req, res) => {
  try {
    const { enabled } = req.query;
    const categories = AfterSaleService.getCategories(
      enabled !== undefined ? parseInt(enabled as string) : undefined
    );
    res.json({ success: true, data: categories });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/categories', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: '请填写分类名称' });
      return;
    }
    const cat = AfterSaleService.createCategory(name, description || '', req.user!.id, req.user!.name);
    res.json({ success: true, data: cat });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/categories/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: '请填写分类名称' });
      return;
    }
    const cat = AfterSaleService.updateCategory(id, name, description || '', req.user!.id, req.user!.name);
    res.json({ success: true, data: cat });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/categories/:id/enabled', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { enabled } = req.body;
    if (enabled === undefined || enabled === null) {
      res.status(400).json({ success: false, error: '请提供 enabled 参数' });
      return;
    }
    const cat = AfterSaleService.setCategoryEnabled(id, enabled, req.user!.id, req.user!.name);
    res.json({ success: true, data: cat });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/categories/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = AfterSaleService.deleteCategory(id, req.user!.id, req.user!.name);
    if (!success) {
      res.status(404).json({ success: false, error: '分类不存在' });
      return;
    }
    res.json({ success: true, message: '分类已删除' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ========== 配置 ==========
router.get('/configs', requireAuth, (req, res) => {
  try {
    const configs = AfterSaleService.getConfigs();
    res.json({ success: true, data: configs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/configs', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { config_key, config_value, description } = req.body;
    if (!config_key) {
      res.status(400).json({ success: false, error: '请提供 config_key' });
      return;
    }
    const cfg = AfterSaleService.updateConfig(config_key, config_value, description || '', req.user!.id, req.user!.name);
    res.json({ success: true, data: cfg });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ========== 回访（具体路径放在参数路由之前，避免冲突）==========
router.get('/visits', requireAuth, requireCustomerService, (req: AuthRequest, res) => {
  try {
    const { status, orderId, keyword, limit, offset } = req.query;
    const initiatorId = req.user!.role === 'customer_service' ? req.user!.id : undefined;

    const visits = AfterSaleService.getVisits({
      status: status as ReturnVisitStatus | undefined,
      initiatorId,
      orderId: orderId ? parseInt(orderId as string) : undefined,
      keyword: keyword as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data: visits });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 导入导出必须放在 /visits/:id 之前，否则 "export" 会被当作 id 参数
router.post('/visits/import', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ success: false, error: '请提供 CSV 文本内容 (csvContent 字段)' });
      return;
    }
    const result = AfterSaleService.importVisitsCsv(csvContent, req.user!.id, req.user!.name);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/visits/export', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    const csv = AfterSaleService.exportVisitsCsv({
      status: status as ReturnVisitStatus | undefined,
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="return-visits-${timestamp}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/visits', requireAuth, requireCustomerService, (req: AuthRequest, res) => {
  try {
    const { order_id, template_id } = req.body;
    if (!order_id) {
      res.status(400).json({ success: false, error: '请提供 order_id' });
      return;
    }
    const visit = AfterSaleService.createVisit(
      parseInt(order_id),
      template_id ? parseInt(template_id) : null,
      req.user!.id,
      req.user!.name
    );
    res.json({ success: true, data: visit });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/visits/:id/complete', requireAuth, requireCustomerService, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { result, remark, image_url } = req.body;
    if (!result) {
      res.status(400).json({ success: false, error: '请提供回访结果 result' });
      return;
    }
    const visit = AfterSaleService.completeVisit(
      id, result as ReturnVisitResult, remark || null, image_url || null,
      req.user!.id, req.user!.name
    );
    res.json({ success: true, data: visit });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/visits/:id/cancel', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    const visit = AfterSaleService.cancelVisit(id, remark || '', req.user!.id, req.user!.name);
    res.json({ success: true, data: visit });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/visits/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const detail = AfterSaleService.getVisitDetail(id, req.user!.id, req.user!.role);
    if (!detail) {
      res.status(404).json({ success: false, error: '回访记录不存在' });
      return;
    }
    if (req.user!.role === 'customer_service' && detail.visit.initiator_id !== req.user!.id) {
      res.status(403).json({ success: false, error: '只能查看自己发起的回访记录' });
      return;
    }
    res.json({ success: true, data: detail });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 申诉（具体路径放在参数路由之前，避免冲突）==========
router.get('/appeals', requireAuth, (req: AuthRequest, res) => {
  try {
    const { status, orderId, visitId, keyword, limit, offset } = req.query;
    const submitterId = req.user!.role === 'customer_service' ? req.user!.id : undefined;

    const appeals = AfterSaleService.getAppeals({
      status: status as AppealStatus | undefined,
      submitterId,
      orderId: orderId ? parseInt(orderId as string) : undefined,
      visitId: visitId ? parseInt(visitId as string) : undefined,
      keyword: keyword as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data: appeals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/appeals/export', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    const csv = AfterSaleService.exportAppealsCsv({
      status: status as AppealStatus | undefined,
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="appeals-${timestamp}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/appeals', requireAuth, requireCustomerService, (req: AuthRequest, res) => {
  try {
    const { visit_id, category_id, reason, image_url } = req.body;
    if (!visit_id || !category_id || !reason) {
      res.status(400).json({ success: false, error: '请提供 visit_id, category_id, reason' });
      return;
    }
    const appeal = AfterSaleService.createAppeal(
      parseInt(visit_id), parseInt(category_id), reason,
      image_url || null, req.user!.id, req.user!.name
    );
    res.json({ success: true, data: appeal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/appeals/:id/accept', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    const appeal = AfterSaleService.acceptAppeal(id, remark || '', req.user!.id, req.user!.name);
    res.json({ success: true, data: appeal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/appeals/:id/reject', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    if (!remark) {
      res.status(400).json({ success: false, error: '请提供驳回理由 remark' });
      return;
    }
    const appeal = AfterSaleService.rejectAppeal(id, remark, req.user!.id, req.user!.name);
    res.json({ success: true, data: appeal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/appeals/:id/reassign', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { target_handler_id, target_handler_name, remark } = req.body;
    if (!target_handler_id) {
      res.status(400).json({ success: false, error: '请提供 target_handler_id' });
      return;
    }
    const appeal = AfterSaleService.reassignAppeal(
      id, parseInt(target_handler_id), target_handler_name || '',
      remark || '', req.user!.id, req.user!.name
    );
    res.json({ success: true, data: appeal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/appeals/:id/resolve', requireAuth, requireSupervisor, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    if (!remark) {
      res.status(400).json({ success: false, error: '请提供处理结果 remark' });
      return;
    }
    const appeal = AfterSaleService.resolveAppeal(id, remark, req.user!.id, req.user!.name);
    res.json({ success: true, data: appeal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/appeals/:id/withdraw', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    const appeal = AfterSaleService.withdrawAppeal(id, remark || '', req.user!.id, req.user!.name);
    res.json({ success: true, data: appeal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/appeals/:id', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const detail = AfterSaleService.getAppealDetail(id, req.user!.id, req.user!.role);
    if (!detail) {
      res.status(404).json({ success: false, error: '申诉不存在' });
      return;
    }
    if (req.user!.role === 'customer_service' && detail.appeal.submitter_id !== req.user!.id) {
      res.status(403).json({ success: false, error: '只能查看自己提交的申诉' });
      return;
    }
    res.json({ success: true, data: detail });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 操作日志 ==========
router.get('/logs', requireAuth, (req, res) => {
  try {
    const { operationType, relatedType, relatedId, limit, offset } = req.query;
    const logs = AfterSaleService.getOperationLogs({
      operationType: operationType as AfterSaleOperationType | undefined,
      relatedType: relatedType as string | undefined,
      relatedId: relatedId ? parseInt(relatedId as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
