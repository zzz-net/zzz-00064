import { Router } from 'express';
import { ConflictService } from '../services/ConflictService.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const { resolved, technicianId, dateFrom, dateTo, type } = req.query;

    const conflicts = ConflictService.getAll({
      resolved: resolved !== undefined ? resolved === 'true' : undefined,
      technicianId: technicianId ? parseInt(technicianId as string) : undefined,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      type: type as any,
    });

    res.json({ success: true, data: conflicts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const conflict = ConflictService.getById(id);

    if (!conflict) {
      res.status(404).json({ success: false, error: '冲突记录不存在' });
      return;
    }

    res.json({ success: true, data: conflict });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/technician/:technicianId/schedule', requireAuth, (req, res) => {
  try {
    const technicianId = parseInt(req.params.technicianId);
    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      res.status(400).json({ success: false, error: '请提供 startTime 和 endTime 参数' });
      return;
    }

    const schedule = ConflictService.getTechnicianSchedule(
      technicianId,
      new Date(startTime as string),
      new Date(endTime as string)
    );

    res.json({ success: true, data: schedule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/check-assign/:orderId/:technicianId', requireAuth, (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const technicianId = parseInt(req.params.technicianId);
    const isAdmin = req.user?.role === 'admin';

    const result = ConflictService.checkAssignConflicts(orderId, technicianId, isAdmin);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/resolve', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = ConflictService.resolve(id);

    if (!success) {
      res.status(404).json({ success: false, error: '冲突记录不存在' });
      return;
    }

    res.json({ success: true, message: '冲突已标记为已解决' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
