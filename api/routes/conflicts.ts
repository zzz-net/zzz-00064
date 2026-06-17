import { Router } from 'express';
import { ConflictService } from '../services/ConflictService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const { resolved } = req.query;
    const resolvedBool = resolved !== undefined ? resolved === 'true' : undefined;
    const conflicts = ConflictService.getAll(resolvedBool);
    res.json({ success: true, data: conflicts });
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
