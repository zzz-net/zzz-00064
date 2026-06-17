import { Router } from 'express';
import { TechnicianService, ScheduleService } from '../services/TechnicianService.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const { status } = req.query;
    const technicians = TechnicianService.getAll(status as string);
    res.json({ success: true, data: technicians });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const { name, phone, skill, status } = req.body;

    if (!name) {
      res.status(400).json({ success: false, error: '技师姓名不能为空' });
      return;
    }

    const technician = TechnicianService.create({
      name,
      phone: phone || '',
      skill: skill || '',
      status: status || 'active',
    });

    res.json({ success: true, data: technician });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const technician = TechnicianService.getById(id);

    if (!technician) {
      res.status(404).json({ success: false, error: '技师不存在' });
      return;
    }

    res.json({ success: true, data: technician });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, phone, skill, status } = req.body;

    const technician = TechnicianService.update(id, { name, phone, skill, status });

    if (!technician) {
      res.status(404).json({ success: false, error: '技师不存在' });
      return;
    }

    res.json({ success: true, data: technician });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = TechnicianService.delete(id);

    if (!success) {
      res.status(404).json({ success: false, error: '技师不存在' });
      return;
    }

    res.json({ success: true, message: '删除成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/schedule', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const schedule = ScheduleService.getByTechnicianId(id);
    res.json({ success: true, data: schedule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/schedule', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { slots } = req.body;

    if (!Array.isArray(slots)) {
      res.status(400).json({ success: false, error: '班表数据格式错误' });
      return;
    }

    ScheduleService.updateSchedule(id, slots);
    const schedule = ScheduleService.getByTechnicianId(id);

    res.json({ success: true, data: schedule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
