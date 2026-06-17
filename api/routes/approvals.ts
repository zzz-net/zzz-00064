import { Router } from 'express';
import { ApprovalService } from '../services/ApprovalService.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const { status, type } = req.query;
    const approvals = ApprovalService.getAll(
      status as any,
      type as any
    );
    res.json({ success: true, data: approvals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export', requireAuth, (req, res) => {
  try {
    const { status, type } = req.query;
    const csv = ApprovalService.exportCsv({
      status: status as any,
      type: type as any,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="approvals-${timestamp}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const approval = ApprovalService.getById(id);

    if (!approval) {
      res.status(404).json({ success: false, error: '审批不存在' });
      return;
    }

    res.json({ success: true, data: approval });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/withdraw', requireAuth, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    const approval = ApprovalService.withdraw(id, req.user!.id, req.user!.name, reason);
    res.json({ success: true, data: approval });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/approve', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;

    const approval = ApprovalService.approve(id, req.user!.id, req.user!.name, remark);
    res.json({ success: true, data: approval });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/reject', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { remark } = req.body;

    const approval = ApprovalService.reject(id, req.user!.id, req.user!.name, remark);
    res.json({ success: true, data: approval });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
