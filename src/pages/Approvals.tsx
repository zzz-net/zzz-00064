import { useState, useEffect } from 'react';
import { Check, X, Clock, User, FileText } from 'lucide-react';
import Layout from '@/components/Layout/Layout';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { Approval } from '../../shared/types.js';

const typeLabels: Record<string, { label: string; color: string }> = {
  reassign: { label: '改派申请', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  force_assign: { label: '强制派单', color: 'bg-red-100 text-red-700 border-red-200' },
  overtime: { label: '加班申请', color: 'bg-purple-100 text-purple-700 border-purple-200' },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待审批', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-700' },
  rejected: { label: '已驳回', color: 'bg-red-100 text-red-700' },
};

export default function Approvals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadApprovals();
  }, [activeTab]);

  const loadApprovals = async () => {
    try {
      const res = await api.get(`/approvals?status=${activeTab}`);
      setApprovals(res.data || []);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    }
  };

  const handleApprove = async (id: number) => {
    const remark = prompt('请输入审批意见（可选）：');
    try {
      await api.put(`/approvals/${id}/approve`, { remark });
      loadApprovals();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const handleReject = async (id: number) => {
    const remark = prompt('请输入驳回理由：');
    if (!remark) return;
    try {
      await api.put(`/approvals/${id}/reject`, { remark });
      loadApprovals();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  const tabs = [
    { key: 'pending', label: '待审批' },
    { key: 'approved', label: '已通过' },
    { key: 'rejected', label: '已驳回' },
  ];

  return (
    <Layout requireAdmin={false}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">审批中心</h1>
          <p className="text-slate-500 mt-1">处理工单审批申请</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex border-b border-slate-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-blue-600'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            ))}
          </div>

          <div className="p-5">
            {approvals.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>暂无{tabs.find((t) => t.key === activeTab)?.label}的审批</p>
              </div>
            ) : (
              <div className="space-y-4">
                {approvals.map((approval) => (
                  <div
                    key={approval.id}
                    className="border border-slate-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6 text-slate-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-800 text-lg">
                              {approval.order_no}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${typeLabels[approval.type]?.color}`}
                            >
                              {typeLabels[approval.type]?.label}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusLabels[approval.status]?.color}`}
                            >
                              {statusLabels[approval.status]?.label}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-600">
                            申请人：
                            <span className="font-medium">{approval.applicant_name}</span>
                            <span className="mx-2 text-slate-300">|</span>
                            申请时间：
                            <span>{formatDateTime(approval.created_at)}</span>
                          </div>
                          <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                            <div className="text-sm text-slate-500 mb-1">申请理由</div>
                            <div className="text-slate-700">{approval.reason}</div>
                          </div>
                          {approval.approval_remark && (
                            <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                              <div className="text-sm text-blue-500 mb-1">审批意见</div>
                              <div className="text-blue-700">{approval.approval_remark}</div>
                              {approval.approver_name && (
                                <div className="text-xs text-blue-400 mt-1">
                                  审批人：{approval.approver_name}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {approval.status === 'pending' && isAdmin && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleApprove(approval.id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            通过
                          </button>
                          <button
                            onClick={() => handleReject(approval.id)}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                          >
                            <X className="w-4 h-4" />
                            驳回
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
