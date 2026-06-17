import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  CheckSquare,
  FileBarChart,
  Wrench,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const menuItems = [
  { path: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { path: '/technicians', label: '技师管理', icon: Users },
  { path: '/schedule', label: '技师班表', icon: Calendar },
  { path: '/orders', label: '工单列表', icon: ClipboardList },
  { path: '/conflicts', label: '冲突处理中心', icon: AlertTriangle },
  { path: '/dispatch-rules', label: '调度规则', icon: Shield },
  { path: '/approvals', label: '审批中心', icon: CheckSquare },
  { path: '/reports', label: '日报导出', icon: FileBarChart },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const location = useLocation();

  return (
    <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
      <div className="h-16 flex items-center px-5 border-b border-slate-700">
        <Wrench className="w-6 h-6 mr-2 text-blue-400" />
        <span className="font-bold text-lg">工单调度系统</span>
      </div>

      <nav className="flex-1 py-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center px-5 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white border-l-4 border-blue-400'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white border-l-4 border-transparent'
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="text-sm text-slate-400">当前用户</div>
        <div className="font-medium mt-1">{user?.name}</div>
        <div className="text-xs text-slate-400 mt-1">
          {user?.role === 'admin' ? '管理员' : '调度员'}
        </div>
      </div>
    </aside>
  );
}
