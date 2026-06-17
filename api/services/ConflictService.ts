import { query, run, runAndGetId } from '../db/index.js';
import {
  Conflict,
  ConflictType,
  ConflictStatus,
  TechnicianScheduleItem,
  ConflictDetail,
  AssignCheckResult,
  Approval,
} from '../../shared/types.js';
import { OrderService } from './OrderService.js';

const CONFLICT_STATUS_LABELS: Record<ConflictStatus, string> = {
  assigned: '已分配',
  confirmed: '已确认',
  approval_pending: '待审批',
  approval_rejected: '已驳回',
  resolved: '已解决',
};

export class ConflictService {
  static enrichConflict(row: any): Conflict {
    const conflict: Conflict = {
      ...row,
      conflict_status: this.computeConflictStatus(row),
    };
    conflict.conflict_status_label = CONFLICT_STATUS_LABELS[conflict.conflict_status!];
    conflict.conflict_source = this.computeConflictSource(conflict);
    return conflict;
  }

  static computeConflictStatus(row: any): ConflictStatus {
    if (row.resolved === 1) {
      return 'resolved';
    }
    if (row.approval_status === 'pending') {
      return 'approval_pending';
    }
    if (row.approval_status === 'rejected') {
      return 'approval_rejected';
    }
    if (row.order_status === 'confirmed') {
      return 'confirmed';
    }
    if (row.order_status === 'assigned') {
      return 'assigned';
    }
    return 'assigned';
  }

  static computeConflictSource(conflict: Conflict): string {
    if (conflict.type === 'time_overlap') {
      return '时段重叠';
    }
    if (conflict.type === 'overtime') {
      return '加班冲突';
    }
    return conflict.type;
  }

  static getAll(params?: {
    resolved?: boolean;
    technicianId?: number;
    dateFrom?: string;
    dateTo?: string;
    type?: ConflictType;
    conflictStatus?: ConflictStatus;
  }): Conflict[] {
    let sql = `
      SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             wo.status as order_status, t.name as technician_name,
             a.id as approval_id, a.status as approval_status, a.reason as approval_reason,
             a.applicant_name, a.approver_name, a.approval_remark
      FROM conflicts c
      LEFT JOIN work_orders wo ON c.order_id = wo.id
      LEFT JOIN technicians t ON c.technician_id = t.id
      LEFT JOIN approvals a ON c.approval_id = a.id
      WHERE 1=1
    `;
    const paramsList: any[] = [];

    if (params?.resolved !== undefined) {
      sql += ' AND c.resolved = ?';
      paramsList.push(params.resolved ? 1 : 0);
    }

    if (params?.technicianId) {
      sql += ' AND c.technician_id = ?';
      paramsList.push(params.technicianId);
    }

    if (params?.dateFrom) {
      sql += ' AND wo.scheduled_start_time >= ?';
      paramsList.push(params.dateFrom);
    }

    if (params?.dateTo) {
      sql += ' AND wo.scheduled_start_time <= ?';
      paramsList.push(params.dateTo);
    }

    if (params?.type) {
      sql += ' AND c.type = ?';
      paramsList.push(params.type);
    }

    sql += ' ORDER BY c.created_at DESC';
    const rows = query<any>(sql, paramsList);
    let results = rows.map(r => this.enrichConflict(r));

    if (params?.conflictStatus) {
      results = results.filter(c => c.conflict_status === params.conflictStatus);
    }

    return results;
  }

  static getById(id: number): Conflict | null {
    const rows = query<any>(`
      SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             wo.status as order_status, t.name as technician_name,
             a.id as approval_id, a.status as approval_status, a.reason as approval_reason,
             a.applicant_name, a.approver_name, a.approval_remark
      FROM conflicts c
      LEFT JOIN work_orders wo ON c.order_id = wo.id
      LEFT JOIN technicians t ON c.technician_id = t.id
      LEFT JOIN approvals a ON c.approval_id = a.id
      WHERE c.id = ?
    `, [id]);
    return rows.length > 0 ? this.enrichConflict(rows[0]) : null;
  }

  static getByOrderId(orderId: number): Conflict[] {
    const rows = query<any>(`
      SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             wo.status as order_status, t.name as technician_name,
             a.id as approval_id, a.status as approval_status, a.reason as approval_reason,
             a.applicant_name, a.approver_name, a.approval_remark
      FROM conflicts c
      LEFT JOIN work_orders wo ON c.order_id = wo.id
      LEFT JOIN technicians t ON c.technician_id = t.id
      LEFT JOIN approvals a ON c.approval_id = a.id
      WHERE c.order_id = ? ORDER BY c.created_at DESC`,
      [orderId]
    );
    return rows.map(r => this.enrichConflict(r));
  }

  static getByTechnicianId(technicianId: number, resolved?: boolean, conflictStatus?: ConflictStatus): Conflict[] {
    let sql = `
      SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             wo.status as order_status, t.name as technician_name,
             a.id as approval_id, a.status as approval_status, a.reason as approval_reason,
             a.applicant_name, a.approver_name, a.approval_remark
      FROM conflicts c
      LEFT JOIN work_orders wo ON c.order_id = wo.id
      LEFT JOIN technicians t ON c.technician_id = t.id
      LEFT JOIN approvals a ON c.approval_id = a.id
      WHERE c.technician_id = ?
    `;
    const params: any[] = [technicianId];

    if (resolved !== undefined) {
      sql += ' AND c.resolved = ?';
      params.push(resolved ? 1 : 0);
    }

    sql += ' ORDER BY c.created_at DESC';
    const rows = query<any>(sql, params);
    let results = rows.map(r => this.enrichConflict(r));

    if (conflictStatus) {
      results = results.filter(c => c.conflict_status === conflictStatus);
    }

    return results;
  }

  static create(orderId: number, technicianId: number, type: ConflictType, description: string, approvalId?: number): Conflict {
    const id = runAndGetId(
      'INSERT INTO conflicts (order_id, technician_id, type, description, resolved, approval_id) VALUES (?, ?, ?, ?, 0, ?)',
      [orderId, technicianId, type, description, approvalId || null]
    );
    return this.getById(id)!;
  }

  static linkApproval(conflictId: number, approvalId: number): boolean {
    const result = run('UPDATE conflicts SET approval_id = ? WHERE id = ?', [approvalId, conflictId]);
    return result > 0;
  }

  static unlinkApproval(conflictId: number): boolean {
    const result = run('UPDATE conflicts SET approval_id = NULL WHERE id = ?', [conflictId]);
    return result > 0;
  }

  static resolve(id: number): boolean {
    const result = run('UPDATE conflicts SET resolved = 1 WHERE id = ?', [id]);
    return result > 0;
  }

  static resolveByOrderId(orderId: number): void {
    run('UPDATE conflicts SET resolved = 1 WHERE order_id = ?', [orderId]);
  }

  static delete(id: number): boolean {
    const result = run('DELETE FROM conflicts WHERE id = ?', [id]);
    return result > 0;
  }

  static getTechnicianSchedule(
    technicianId: number,
    startTime: Date,
    endTime: Date
  ): TechnicianScheduleItem[] {
    const items: TechnicianScheduleItem[] = [];

    const orders = query<any>(`
      SELECT wo.*, t.name as technician_name
      FROM work_orders wo
      LEFT JOIN technicians t ON wo.technician_id = t.id
      WHERE wo.technician_id = ?
      AND wo.status IN ('assigned', 'confirmed', 'in_progress')
      AND (
        (wo.scheduled_start_time < ? AND wo.scheduled_end_time > ?)
        OR (wo.scheduled_start_time >= ? AND wo.scheduled_start_time < ?)
      )
      ORDER BY wo.scheduled_start_time ASC
    `, [
      technicianId,
      endTime.toISOString(),
      startTime.toISOString(),
      startTime.toISOString(),
      endTime.toISOString(),
    ]);

    const statusLabels: Record<string, string> = {
      assigned: '已分配',
      confirmed: '已确认',
      in_progress: '服务中',
    };

    orders.forEach((order) => {
      let type: any = 'order_assigned';
      if (order.status === 'confirmed') type = 'order_confirmed';
      if (order.status === 'in_progress') type = 'order_in_progress';

      items.push({
        id: `order-${order.id}`,
        type,
        source_id: order.id,
        order_id: order.id,
        order_no: order.order_no,
        customer_name: order.customer_name,
        technician_id: order.technician_id,
        technician_name: order.technician_name,
        scheduled_start_time: order.scheduled_start_time,
        scheduled_end_time: order.scheduled_end_time,
        status: order.status,
        status_label: statusLabels[order.status] || order.status,
        created_at: order.created_at,
      });
    });

    const approvals = query<any>(`
      SELECT a.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             t.name as technician_name
      FROM approvals a
      LEFT JOIN work_orders wo ON a.order_id = wo.id
      LEFT JOIN technicians t ON a.target_technician_id = t.id
      WHERE a.type = 'force_assign'
      AND a.target_technician_id = ?
      AND a.status IN ('pending', 'rejected')
      AND (
        (wo.scheduled_start_time < ? AND wo.scheduled_end_time > ?)
        OR (wo.scheduled_start_time >= ? AND wo.scheduled_start_time < ?)
      )
      ORDER BY a.created_at DESC
    `, [
      technicianId,
      endTime.toISOString(),
      startTime.toISOString(),
      startTime.toISOString(),
      endTime.toISOString(),
    ]);

    const approvalStatusLabels: Record<string, string> = {
      pending: '待审批',
      rejected: '已驳回',
    };

    approvals.forEach((approval) => {
      const type: any = approval.status === 'pending' ? 'approval_pending' : 'approval_rejected';
      items.push({
        id: `approval-${approval.id}`,
        type,
        source_id: approval.id,
        order_id: approval.order_id,
        order_no: approval.order_no,
        customer_name: approval.customer_name,
        technician_id: technicianId,
        technician_name: approval.technician_name,
        scheduled_start_time: approval.scheduled_start_time,
        scheduled_end_time: approval.scheduled_end_time,
        status: approval.status,
        status_label: approvalStatusLabels[approval.status] || approval.status,
        description: approval.reason,
        applicant_name: approval.applicant_name,
        approval_remark: approval.approval_remark,
        created_at: approval.created_at,
      });
    });

    items.sort((a, b) =>
      new Date(a.scheduled_start_time).getTime() - new Date(b.scheduled_start_time).getTime()
    );

    return items;
  }

  static getDetail(conflictId: number, isAdmin: boolean, currentUserId?: number): ConflictDetail | null {
    const conflict = this.getById(conflictId);
    if (!conflict) return null;

    const order = OrderService.getById(conflict.order_id);

    let relatedApproval: Approval | undefined;
    if (conflict.approval_id) {
      const approvals = query<Approval>(`
        SELECT a.*, wo.order_no, wo.customer_name
        FROM approvals a
        LEFT JOIN work_orders wo ON a.order_id = wo.id
        WHERE a.id = ?
      `, [conflict.approval_id]);
      relatedApproval = approvals[0];
    }

    let overlappingItems: TechnicianScheduleItem[] = [];
    if (conflict.scheduled_start_time && conflict.scheduled_end_time) {
      overlappingItems = this.getTechnicianSchedule(
        conflict.technician_id,
        new Date(conflict.scheduled_start_time),
        new Date(conflict.scheduled_end_time)
      ).filter(item => item.order_id !== conflict.order_id);
    }

    const hasRejectedApproval = conflict.approval_status === 'rejected';
    const isPendingApproval = conflict.approval_status === 'pending';
    const canWithdraw = !!(
      !conflict.resolved &&
      isPendingApproval &&
      relatedApproval &&
      currentUserId !== undefined &&
      relatedApproval.applicant_id === currentUserId
    );

    return {
      conflict,
      overlapping_items: overlappingItems,
      related_order: order || undefined,
      related_approval: relatedApproval,
      available_actions: {
        can_reassign: !conflict.resolved && order?.status !== 'completed' && order?.status !== 'cancelled',
        can_apply_force_assign: !conflict.resolved && !hasRejectedApproval && !isPendingApproval && order?.status === 'pending',
        can_force_assign: isAdmin && !conflict.resolved && !hasRejectedApproval && order?.status === 'pending',
        can_approve: isAdmin && isPendingApproval,
        can_reject: isAdmin && isPendingApproval,
        can_withdraw: canWithdraw,
        requires_approval: !hasRejectedApproval && !isPendingApproval && conflict.type === 'time_overlap' && !conflict.resolved,
        approval_reason: hasRejectedApproval
          ? '该技师的强制派单申请已被驳回，不可再次申请，请更换技师'
          : isPendingApproval
          ? '申请正在等待主管审批'
          : conflict.type === 'time_overlap'
          ? '时段重叠，需要主管审批后方可强制派单'
          : undefined,
      },
    };
  }

  static checkAssignConflicts(
    orderId: number,
    technicianId: number,
    isAdmin: boolean
  ): AssignCheckResult {
    const order = OrderService.getById(orderId);
    if (!order) {
      return { can_assign: false, conflicts: [], schedule_items: [] };
    }

    const start = new Date(order.scheduled_start_time);
    const end = new Date(order.scheduled_end_time);

    const scheduleItems = this.getTechnicianSchedule(technicianId, start, end);

    const hasTimeOverlap = scheduleItems.some(
      (item) => item.type.startsWith('order_')
    );

    const hasRejectedApproval = scheduleItems.some(
      (item) => item.type === 'approval_rejected'
    );

    const hasPendingApproval = scheduleItems.some(
      (item) => item.type === 'approval_pending'
    );

    const conflicts: ConflictDetail[] = [];

    if (hasTimeOverlap) {
      const overlappingOrders = scheduleItems.filter((item) => item.type.startsWith('order_'));

      let conflictRecord = this.getByOrderId(orderId).find(
        (c) => c.technician_id === technicianId && c.type === 'time_overlap' && !c.resolved
      );

      if (!conflictRecord) {
        conflictRecord = this.create(
          orderId,
          technicianId,
          'time_overlap',
          `与 ${overlappingOrders.length} 个工单时段重叠`
        );
      }

      const detail = this.getDetail(conflictRecord.id, isAdmin);
      if (detail) {
        conflicts.push(detail);
      }
    }

    if (hasRejectedApproval) {
      const rejectedApprovals = scheduleItems.filter(
        (item) => item.type === 'approval_rejected'
      );

      conflicts.push({
        conflict: {
          id: 0,
          order_id: orderId,
          technician_id: technicianId,
          type: 'time_overlap',
          description: '存在已驳回的强制派单申请',
          resolved: 0,
          created_at: new Date().toISOString(),
          conflict_status: 'approval_rejected',
          conflict_status_label: '已驳回',
        },
        overlapping_items: rejectedApprovals,
        available_actions: {
          can_reassign: true,
          can_apply_force_assign: false,
          can_force_assign: false,
          can_approve: false,
          can_reject: false,
          can_withdraw: false,
          requires_approval: false,
          approval_reason: '该技师的强制派单申请已被驳回，不可再次申请强制派单，请更换技师',
        },
      });
    }

    if (!hasTimeOverlap && !hasRejectedApproval && hasPendingApproval) {
      const pendingApprovals = scheduleItems.filter(
        (item) => item.type === 'approval_pending'
      );
      conflicts.push({
        conflict: {
          id: 0,
          order_id: orderId,
          technician_id: technicianId,
          type: 'time_overlap',
          description: '存在待审批的强制派单申请',
          resolved: 0,
          created_at: new Date().toISOString(),
          conflict_status: 'approval_pending',
          conflict_status_label: '待审批',
        },
        overlapping_items: pendingApprovals,
        available_actions: {
          can_reassign: true,
          can_apply_force_assign: false,
          can_force_assign: false,
          can_approve: isAdmin,
          can_reject: isAdmin,
          can_withdraw: false,
          requires_approval: false,
          approval_reason: '已有待审批申请，等待主管处理',
        },
      });
    }

    return {
      can_assign: !hasTimeOverlap && !hasRejectedApproval && !hasPendingApproval,
      conflicts,
      schedule_items: scheduleItems,
    };
  }

  static hasRejectedForceAssignApproval(
    orderId: number,
    technicianId: number
  ): boolean {
    const result = query<any>(`
      SELECT COUNT(*) as count
      FROM approvals
      WHERE order_id = ?
      AND target_technician_id = ?
      AND type = 'force_assign'
      AND status = 'rejected'
    `, [orderId, technicianId]);
    return result[0].count > 0;
  }

  static exportCsv(params?: {
    resolved?: boolean;
    technicianId?: number;
    dateFrom?: string;
    dateTo?: string;
    type?: ConflictType;
    conflictStatus?: ConflictStatus;
  }): string {
    const conflicts = this.getAll(params);

    const headers = [
      'ID',
      '工单编号',
      '客户姓名',
      '技师',
      '冲突类型',
      '冲突来源',
      '冲突状态',
      '冲突描述',
      '预约开始时间',
      '预约结束时间',
      '关联审批ID',
      '审批状态',
      '申请理由',
      '申请人',
      '审批人',
      '审批意见',
      '创建时间',
      '是否已解决',
    ];

    const typeLabels: Record<string, string> = {
      time_overlap: '时段重叠',
      overtime: '加班冲突',
    };

    const conflictStatusLabels: Record<string, string> = {
      assigned: '已分配',
      confirmed: '已确认',
      approval_pending: '待审批',
      approval_rejected: '已驳回',
      resolved: '已解决',
    };

    const approvalStatusLabels: Record<string, string> = {
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回',
      withdrawn: '已撤回',
    };

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = conflicts.map(c => [
      c.id,
      c.order_no || '',
      c.customer_name || '',
      c.technician_name || '',
      typeLabels[c.type] || c.type,
      c.conflict_source || '',
      conflictStatusLabels[c.conflict_status || ''] || c.conflict_status || '',
      c.description,
      c.scheduled_start_time || '',
      c.scheduled_end_time || '',
      c.approval_id || '',
      c.approval_status ? (approvalStatusLabels[c.approval_status] || c.approval_status) : '',
      c.approval_reason || '',
      c.applicant_name || '',
      c.approver_name || '',
      c.approval_remark || '',
      c.created_at,
      c.resolved === 1 ? '是' : '否',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(escapeCsv).join(','))
      .join('\n');

    return '\ufeff' + csv;
  }
}
