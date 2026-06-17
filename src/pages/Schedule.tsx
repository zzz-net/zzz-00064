import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, Save } from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

interface Technician {
  id: number;
  name: string;
  phone: string;
  skill: string;
  status: string;
}

interface ScheduleSlot {
  id: number;
  technician_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function Schedule() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [schedules, setSchedules] = useState<Record<number, ScheduleSlot[]>>({});
  const [selectedTechnician, setSelectedTechnician] = useState<number | null>(null);
  const [editingSlots, setEditingSlots] = useState<ScheduleSlot[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadTechnicians();
  }, []);

  useEffect(() => {
    if (technicians.length > 0 && !selectedTechnician) {
      setSelectedTechnician(technicians[0].id);
    }
  }, [technicians]);

  useEffect(() => {
    if (selectedTechnician) {
      loadSchedule(selectedTechnician);
    }
  }, [selectedTechnician]);

  const loadTechnicians = async () => {
    try {
      const res = await api.get('/technicians?status=active');
      setTechnicians(res.data || []);
    } catch (err) {
      console.error('Failed to load technicians:', err);
    }
  };

  const loadSchedule = async (techId: number) => {
    try {
      const res = await api.get(`/technicians/${techId}/schedule`);
      const slots = res.data || [];
      setSchedules((prev) => ({ ...prev, [techId]: slots }));
      setEditingSlots(slots.map((s: ScheduleSlot) => ({ ...s })));
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    }
  };

  const handleAddSlot = (dayOfWeek: number) => {
    const newSlot: ScheduleSlot = {
      id: Date.now(),
      technician_id: selectedTechnician!,
      day_of_week: dayOfWeek,
      start_time: '09:00',
      end_time: '18:00',
    };
    setEditingSlots([...editingSlots, newSlot]);
    setIsEditing(true);
  };

  const handleUpdateSlot = (id: number, field: string, value: string) => {
    setEditingSlots(
      editingSlots.map((slot) =>
        slot.id === id ? { ...slot, [field]: value } : slot
      )
    );
    setIsEditing(true);
  };

  const handleRemoveSlot = (id: number) => {
    setEditingSlots(editingSlots.filter((slot) => slot.id !== id));
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedTechnician) return;

    try {
      const slotsToSave = editingSlots.map(({ id, ...rest }) => rest);
      await api.put(`/technicians/${selectedTechnician}/schedule`, {
        slots: slotsToSave,
      });
      setIsEditing(false);
      loadSchedule(selectedTechnician);
      alert('班表保存成功');
    } catch (err: any) {
      alert(err.message || '保存失败');
    }
  };

  const getSlotsForDay = (dayOfWeek: number) => {
    return editingSlots.filter((slot) => slot.day_of_week === dayOfWeek);
  };

  const selectedTech = technicians.find((t) => t.id === selectedTechnician);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">技师班表</h1>
            <p className="text-slate-500 mt-1">设置技师的可服务时段</p>
          </div>
          {isAdmin && isEditing && (
            <button
              onClick={handleSave}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存班表
            </button>
          )}
        </div>

        <div className="flex gap-6">
          <div className="w-60 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">技师列表</h3>
              </div>
              <div className="p-2">
                {technicians.map((tech) => (
                  <button
                    key={tech.id}
                    onClick={() => setSelectedTechnician(tech.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      selectedTechnician === tech.id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {tech.name}
                    <div className="text-xs text-slate-500 mt-0.5">{tech.skill}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1">
            {selectedTech && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">
                      {selectedTech.name} 的班表
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      点击对应日期的添加按钮设置可服务时段
                    </p>
                  </div>
                  {!isAdmin && (
                    <span className="text-sm text-slate-400">仅管理员可编辑</span>
                  )}
                </div>

                <div className="divide-y divide-slate-100">
                  {days.map((day, dayIndex) => (
                    <div key={dayIndex} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-slate-700">{day}</span>
                        {isAdmin && (
                          <button
                            onClick={() => handleAddSlot(dayIndex)}
                            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <Clock className="w-4 h-4" />
                            添加时段
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {getSlotsForDay(dayIndex).length === 0 ? (
                          <div className="text-sm text-slate-400 py-2">休息日</div>
                        ) : (
                          getSlotsForDay(dayIndex).map((slot) => (
                            <div
                              key={slot.id}
                              className="flex items-center gap-3 bg-green-50 rounded-lg px-3 py-2"
                            >
                              {isAdmin ? (
                                <>
                                  <input
                                    type="time"
                                    value={slot.start_time}
                                    onChange={(e) =>
                                      handleUpdateSlot(slot.id, 'start_time', e.target.value)
                                    }
                                    className="px-2 py-1 border border-green-200 rounded text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                  />
                                  <span className="text-green-600">至</span>
                                  <input
                                    type="time"
                                    value={slot.end_time}
                                    onChange={(e) =>
                                      handleUpdateSlot(slot.id, 'end_time', e.target.value)
                                    }
                                    className="px-2 py-1 border border-green-200 rounded text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                  />
                                  <button
                                    onClick={() => handleRemoveSlot(slot.id)}
                                    className="ml-auto text-red-500 hover:text-red-600 text-sm"
                                  >
                                    删除
                                  </button>
                                </>
                              ) : (
                                <span className="text-green-700 text-sm">
                                  {slot.start_time} - {slot.end_time}
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
