import { useNavigate } from 'react-router-dom';
import { LogOut, Bell, User } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div className="text-lg font-semibold text-slate-800">
        上门工单调度管理平台
      </div>

      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-600 hover:text-blue-600 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-600 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
              <User className="w-4 h-4 text-slate-600" />
            </div>
            <span>{user?.name}</span>
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
              <div className="px-4 py-2 text-sm text-slate-600 border-b border-slate-100">
                {user?.name}
                <div className="text-xs text-slate-400">
                  {user?.role === 'admin' ? '管理员' : '调度员'}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
