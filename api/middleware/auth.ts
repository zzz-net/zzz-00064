import { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';
import { User, UserRole } from '../../shared/types.js';

declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

export interface AuthRequest extends Request {
  user?: User;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ success: false, error: '未登录' });
    return;
  }

  const users = query<User>('SELECT id, username, name, role, created_at FROM users WHERE id = ?', [
    req.session.userId,
  ]);

  if (users.length === 0) {
    res.status(401).json({ success: false, error: '用户不存在' });
    return;
  }

  req.user = users[0];
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: '未登录' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: '权限不足，需要管理员角色' });
    return;
  }

  next();
}

export function requireSupervisor(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: '未登录' });
    return;
  }

  if (req.user.role !== 'supervisor' && req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: '权限不足，需要主管或管理员角色' });
    return;
  }

  next();
}

export function requireCustomerService(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: '未登录' });
    return;
  }

  if (req.user.role !== 'customer_service' && req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    res.status(403).json({ success: false, error: '权限不足，需要客服、主管或管理员角色' });
    return;
  }

  next();
}

export function requireRoles(roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: `权限不足，需要以下角色之一: ${roles.join(', ')}` });
      return;
    }

    next();
  };
}
