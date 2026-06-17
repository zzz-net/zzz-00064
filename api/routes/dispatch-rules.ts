import { Router } from 'express';
import { DispatchRuleService } from '../services/DispatchRuleService.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { DispatchRuleType, RuleOperationType } from '../../shared/types.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const { enabled, type } = req.query;
    const rules = DispatchRuleService.getAll(
      enabled !== undefined ? parseInt(enabled as string) : undefined,
      type as DispatchRuleType | undefined
    );
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export', requireAuth, (req, res) => {
  try {
    const csv = DispatchRuleService.exportCsv();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dispatch-rules-${timestamp}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/logs', requireAuth, (req, res) => {
  try {
    const { operationType, ruleId, limit, offset } = req.query;
    const logs = DispatchRuleService.getOperationLogs(
      operationType as RuleOperationType | undefined,
      ruleId ? parseInt(ruleId as string) : undefined,
      limit ? parseInt(limit as string) : undefined,
      offset ? parseInt(offset as string) : undefined
    );
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { name, type, severity, value, description } = req.body;

    if (!name || !type || !severity || !value) {
      res.status(400).json({ success: false, error: '请填写必填字段（名称、类型、严重级别、参数值）' });
      return;
    }

    const rule = DispatchRuleService.create(
      name, type, severity, value, description || '',
      req.user!.id, req.user!.name
    );
    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, type, severity, value, description } = req.body;

    if (!name || !type || !severity || !value) {
      res.status(400).json({ success: false, error: '请填写必填字段（名称、类型、严重级别、参数值）' });
      return;
    }

    const rule = DispatchRuleService.update(
      id, name, type, severity, value, description || '',
      req.user!.id, req.user!.name
    );
    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/enabled', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { enabled } = req.body;

    if (enabled === undefined || enabled === null) {
      res.status(400).json({ success: false, error: '请提供 enabled 参数' });
      return;
    }

    const rule = DispatchRuleService.setEnabled(id, enabled, req.user!.id, req.user!.name);
    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = DispatchRuleService.delete(id, req.user!.id, req.user!.name);
    if (!success) {
      res.status(404).json({ success: false, error: '规则不存在' });
      return;
    }
    res.json({ success: true, message: '规则已删除' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/import', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ success: false, error: '请提供 CSV 文本内容 (csvContent 字段)' });
      return;
    }

    const result = DispatchRuleService.importCsv(csvContent, req.user!.id, req.user!.name);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/precheck', requireAuth, (req: AuthRequest, res) => {
  try {
    const { orderId, technicianId, serviceType, scheduledStartTime, scheduledEndTime, isForceAssign } = req.body;

    if (!orderId || !technicianId || !serviceType || !scheduledStartTime || !scheduledEndTime) {
      res.status(400).json({ success: false, error: '请提供完整的预检参数' });
      return;
    }

    const result = DispatchRuleService.precheck(
      orderId, technicianId, serviceType,
      scheduledStartTime, scheduledEndTime,
      req.user!.id, req.user!.name,
      isForceAssign === true
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
