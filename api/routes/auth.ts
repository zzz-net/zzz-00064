import { Router } from 'express';
import { AuthService } from '../services/AuthService.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ success: false, error: '用户名和密码不能为空' });
      return;
    }

    const user = await AuthService.login(username, password);

    if (!user) {
      res.status(401).json({ success: false, error: '用户名或密码错误' });
      return;
    }

    req.session.userId = user.id;

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: '登录失败' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: '已登出' });
  });
});

router.get('/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
