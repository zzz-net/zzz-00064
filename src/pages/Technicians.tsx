import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Phone, Wrench, User } from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { Technician } from '../../shared/types.js';

export default function Technicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    skill: '',
    status: 'active',
  });
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    try {
      const res = await api.get('/technicians');
      setTechnicians(res.data || []);
    } catch (err) {
      console.error('Failed to load technicians:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTech) {
        await api.put(`/technicians/${editingTech.id}`, formData);
      } else {
        await api.post('/technicians', formData);
      }
      setShowModal(false);
      setEditingTech(null);
      resetForm();
      loadTechnicians();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleEdit = (tech: Technician) => {
    setEditingTech(tech);
    setFormData({
      name: tech.name,
      phone: tech.phone,
      skill: tech.skill,
      status: tech.status,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该技师吗？')) return;
    try {
      await api.delete(`/technicians/${id}`);
      loadTechnicians();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', skill: '', status: 'active' });
  };

  const openCreateModal = () => {
    setEditingTech(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">技师管理</h1>
            <p className="text-slate-500 mt-1">管理所有技师信息</p>
          </div>
          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加技师
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-5 text-sm font-medium text-slate-600">ID</th>
                <th className="text-left py-3 px-5 text-sm font-medium text-slate-600">姓名</th>
                <th className="text-left py-3 px-5 text-sm font-medium text-slate-600">电话</th>
                <th className="text-left py-3 px-5 text-sm font-medium text-slate-600">技能</th>
                <th className="text-left py-3 px-5 text-sm font-medium text-slate-600">状态</th>
                {isAdmin && (
                  <th className="text-right py-3 px-5 text-sm font-medium text-slate-600">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {technicians.length === 0 ? (
                <tr>
                <td colSpan={isAdmin ? 6 : 5} className="text-center py-12 text-slate-400">
                  暂无技师数据
                </td>
              </tr>
              ) : (
                technicians.map((tech) => (
                  <tr key={tech.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-4 px-5 text-sm text-slate-600">{tech.id}</td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="font-medium text-slate-800">{tech.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-sm text-slate-600 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {tech.phone || '-'}
                    </td>
                    <td className="py-4 px-5 text-sm text-slate-600 flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      {tech.skill || '-'}
                    </td>
                    <td className="py-4 px-5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      tech.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {tech.status === 'active' ? '在职' : '离职'}
                    </span>
                    </td>
                    {isAdmin && (
                      <td className="py-4 px-5 text-right">
                        <button
                          onClick={() => handleEdit(tech)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(tech.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-5">
              {editingTech ? '编辑技师' : '添加技师'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">姓名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="请输入技师姓名"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">电话</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="请联系电话"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">技能</label>
                <input
                  type="text"
                  value={formData.skill}
                  onChange={(e) => setFormData({ ...formData, skill: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="如：空调维修、水电维修等"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="active">在职</option>
                  <option value="inactive">离职</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  {editingTech ? '保存' : '添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
      </div>
    </Layout>
  );
}
