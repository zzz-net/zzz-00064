import { query, run, runAndGetId } from '../db/index.js';
import {
  Conflict,
  ConflictType,
  TechnicianScheduleItem,
  ConflictDetail,
  AssignCheckResult,
} from '../../shared/types.js';
import { OrderService } from './OrderService.js';

export class ConflictService {
  static getAll(params?: {
    resolved?: boolean;
    technicianId?: number;
    dateFrom?: string;
    dateTo?: string;
    type?: ConflictType;
  }): Conflict[] {
    let sql = `
      SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             wo.status as order_status, t.name as technician_name
      FROM conflicts c
      LEFT JOIN work_orders wo ON c.order_id = wo.id
      LEFT JOIN technicians t ON c.technician_id = t.id
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
    return query<Conflict>(sql, paramsList);
  }

  static getById(id: number): Conflict | null {
    const conflicts = query<Conflict>(`
      SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             wo.status as order_status, t.name as technician_name
      FROM conflicts c
      LEFT JOIN work_orders wo ON c.order_id = wo.id
      LEFT JOIN technicians t ON c.technician_id = t.id
      WHERE c.id = ?
    `, [id]);
    return conflicts.length > 0 ? conflicts[0] : null;
  }

  static getByOrderId(orderId: number): Conflict[] {
    return query<Conflict>(
      `SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
              wo.status as order_status, t.name as technician_name
       FROM conflicts c
       LEFT JOIN work_orders wo ON c.order_id = wo.id
       LEFT JOIN technicians t ON c.technician_id = t.id
       WHERE c.order_id = ? ORDER BY c.created_at DESC`,
      [orderId]
    );
  }

  static getByTechnicianId(technicianId: number, resolved?: boolean): Conflict[] {
    let sql = `
      SELECT c.*, wo.order_no, wo.customer_name, wo.scheduled_start_time, wo.scheduled_end_time,
             wo.status as order_status, t.name as technician_name
      FROM conflicts c
      LEFT JOIN work_orders wo ON c.order_id = wo.id
      LEFT JOIN technicians t ON c.technician_id = t.id
      WHERE c.technician_id = ?
    `;
    const params: any[] = [technicianId];

    if (resolved !== undefined) {
      sql += ' AND c.resolved = ?';
      params.push(resolved ? 1 : 0);
    }

    sql += ' ORDER BY c.created_at DESC';
    return query<Conflict>(sql, params);
  }

  static create(orderId: number, technicianId: number, type: ConflictType, description: string): Conflict {
    const id = runAndGetId(
      'INSERT INTO conflicts (order_id, technician_id, type, description, resolved) VALUES (?, ?, ?, ?, 0)',
      [orderId, technicianId, type, description]
    );
    return this.getById(id)!;
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

      conflicts.push({
        conflict: conflictRecord,
        overlapping_items: overlappingOrders,
        available_actions: {
          can_reassign: true,
          can_apply_force_assign: !hasRejectedApproval,
          can_force_assign: isAdmin && !hasRejectedApproval,
          requires_approval: true,
          approval_reason: hasRejectedApproval
            ? '该技师的强制派单申请已被驳回，不可再次申请，请更换技师'
            : '时段重叠，需要主管审批后方可强制派单',
        },
      });
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
        },
        overlapping_items: rejectedApprovals,
        available_actions: {
          can_reassign: true,
          can_apply_force_assign: false,
          can_force_assign: false,
          requires_approval: false,
          approval_reason: '该技师的强制派单申请已被驳回，不可再次申请强制派单，请更换技师',
        },
      });
    }

    return {
      can_assign: !hasTimeOverlap && !hasRejectedApproval,
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
}
