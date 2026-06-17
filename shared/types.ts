export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'dispatcher';
  created_at: string;
}

export interface Technician {
  id: number;
  name: string;
  phone: string;
  skill: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface ScheduleSlot {
  id: number;
  technician_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export type OrderStatus = 'pending' | 'assigned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface WorkOrder {
  id: number;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  service_type: string;
  description: string;
  status: OrderStatus;
  technician_id: number | null;
  technician_name?: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  cancel_reason: string | null;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderHistory {
  id: number;
  order_id: number;
  action: string;
  operator_id: number;
  operator_name: string;
  remark: string | null;
  created_at: string;
}

export type ApprovalType = 'reassign' | 'force_assign' | 'overtime';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface Approval {
  id: number;
  type: ApprovalType;
  order_id: number;
  order_no?: string;
  customer_name?: string;
  applicant_id: number;
  applicant_name: string;
  reason: string;
  target_technician_id?: number | null;
  status: ApprovalStatus;
  approver_id: number | null;
  approver_name: string | null;
  approval_remark: string | null;
  created_at: string;
  approved_at: string | null;
  withdrawn_at: string | null;
  withdraw_reason: string | null;
}

export type ConflictType = 'time_overlap' | 'overtime';

export type ConflictStatus = 'assigned' | 'confirmed' | 'approval_pending' | 'approval_rejected' | 'resolved';

export interface Conflict {
  id: number;
  order_id: number;
  technician_id: number;
  type: ConflictType;
  description: string;
  resolved: number;
  created_at: string;
  order_no?: string;
  customer_name?: string;
  technician_name?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  order_status?: string;
  conflict_status?: ConflictStatus;
  conflict_status_label?: string;
  approval_id?: number | null;
  approval_status?: ApprovalStatus | null;
  approval_reason?: string | null;
  applicant_name?: string | null;
  approver_name?: string | null;
  approval_remark?: string | null;
  conflict_source?: string;
}

export type ScheduleItemType = 'order_assigned' | 'order_confirmed' | 'order_in_progress' | 'approval_pending' | 'approval_rejected';

export interface TechnicianScheduleItem {
  id: string;
  type: ScheduleItemType;
  source_id: number;
  order_id: number;
  order_no: string;
  customer_name: string;
  technician_id: number;
  technician_name: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: string;
  status_label: string;
  description?: string;
  applicant_name?: string;
  approval_remark?: string;
  created_at: string;
}

export interface ConflictDetail {
  conflict: Conflict;
  overlapping_items: TechnicianScheduleItem[];
  related_order?: WorkOrder;
  related_approval?: Approval;
  available_actions: {
    can_reassign: boolean;
    can_apply_force_assign: boolean;
    can_force_assign: boolean;
    can_approve: boolean;
    can_reject: boolean;
    can_withdraw: boolean;
    requires_approval: boolean;
    approval_reason?: string;
  };
}

export interface AssignCheckResult {
  can_assign: boolean;
  conflicts: ConflictDetail[];
  schedule_items: TechnicianScheduleItem[];
}

export interface DailyReport {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  inProgressOrders: number;
  technicianStats: {
    technicianId: number;
    technicianName: string;
    completedCount: number;
    totalWorkHours: number;
  }[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
