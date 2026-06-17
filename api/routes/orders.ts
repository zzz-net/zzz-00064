import { Router } from 'express';
import { OrderService } from '../services/OrderService.js';
import { ApprovalService } from '../services/ApprovalService.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { OrderStatus } from '../../shared/types.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const { status, technicianId, dateFrom, dateTo, search, limit, offset } = req.query;

    const { orders, total } = OrderService.getAll({
      status: status as OrderStatus,
      technicianId: technicianId ? parseInt(technicianId as string) : undefined,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ success: true, data: orders, total });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, (req: AuthRequest, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerAddress,
      serviceType,
      description,
      scheduledStartTime,
      scheduledEndTime,
    } = req.body;

    if (!customerName || !serviceType || !scheduledStartTime || !scheduledEndTime) {
      res.status(400).json({ success: false, error: '请填写必填字段' });
      return;
    }

    const order = OrderService.create({
      customerName,
      customerPhone: customerPhone || '',
      customerAddress: customerAddress || '',
      serviceType,
      description: description || '',
      scheduledStartTime,
      scheduledEndTime,
      createdBy: req.user!.id,
      createdByName: req.user!.name,
    });

    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = OrderService.getById(id);

    if (!order) {
      res.status(404).json({ success: false, error: '工单不存在' });
      return;
    }

    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/assign', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { technicianId } = req.body;

    if (!technicianId) {
      res.status(400).json({ success: false, error: '请选择技师' });
      return;
    }

    const order = OrderService.assign(id, technicianId, req.user!.id, req.user!.name);
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/confirm', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = OrderService.confirm(id, req.user!.id, req.user!.name);
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/start', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = OrderService.startProgress(id, req.user!.id, req.user!.name);
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/complete', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;
    const order = OrderService.complete(id, req.user!.id, req.user!.name, remark);
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/cancel', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json({ success: false, error: '请填写取消原因' });
      return;
    }

    const order = OrderService.cancel(id, req.user!.id, req.user!.name, reason);
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/reassign', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { technicianId, reason } = req.body;

    if (!reason) {
      res.status(400).json({ success: false, error: '请填写改派原因' });
      return;
    }

    if (technicianId) {
      const order = OrderService.reassign(id, technicianId, req.user!.id, req.user!.name, reason);
      res.json({ success: true, data: order });
    } else {
      OrderService.applyReassign(id, req.user!.id, req.user!.name, reason);
      ApprovalService.create('reassign', id, req.user!.id, req.user!.name, reason);
      const order = OrderService.getById(id);
      res.json({ success: true, data: order, message: '改派申请已提交，等待审批' });
    }
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/force-assign', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { technicianId, reason } = req.body;

    if (!technicianId || !reason) {
      res.status(400).json({ success: false, error: '请选择技师并填写理由' });
      return;
    }

    const order = OrderService.forceAssign(id, technicianId, req.user!.id, req.user!.name, reason);
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/:id/force-assign-request', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { technicianId, reason } = req.body;

    if (!technicianId || !reason) {
      res.status(400).json({ success: false, error: '请选择技师并填写理由' });
      return;
    }

    ApprovalService.create('force_assign', id, req.user!.id, req.user!.name, reason);
    OrderService.addHistory(id, 'apply_force_assign', req.user!.id, req.user!.name, `申请强制派单: ${reason}`);

    const order = OrderService.getById(id);
    res.json({ success: true, data: order, message: '强制派单申请已提交，等待管理员审批' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/:id/history', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const history = OrderService.getHistory(id);
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
