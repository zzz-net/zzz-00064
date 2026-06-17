import { query, run, runAndGetId, getDb } from '../db/index.js';
import { WorkOrder, OrderHistory, OrderStatus } from '../../shared/types.js';
import { ScheduleService } from './TechnicianService.js';
import { ConflictService } from './ConflictService.js';

export class OrderService {
  static generateOrderNo(): string {
    const date = new Date();
    const dateStr = date.getFullYear().toString() +
      (date.getMonth() + 1).toString().padStart(2, '0') +
      date.getDate().toString().padStart(2, '0');
    
    const result = query<{ count: number }>(
      "SELECT COUNT(*) as count FROM work_orders WHERE order_no LIKE ?",
      [`WO${dateStr}%`]
    );
    
    const seq = (result[0].count + 1).toString().padStart(4, '0');
    return `WO${dateStr}${seq}`;
  }

  static getAll(params?: {
    status?: OrderStatus;
    technicianId?: number;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { orders: WorkOrder[]; total: number } {
    let sql = `
      SELECT wo.*, t.name as technician_name, u.name as created_by_name
      FROM work_orders wo
      LEFT JOIN technicians t ON wo.technician_id = t.id
      LEFT JOIN users u ON wo.created_by = u.id
      WHERE 1=1
    `;
    let countSql = 'SELECT COUNT(*) as total FROM work_orders wo WHERE 1=1';
    const queryParams: any[] = [];
    const countParams: any[] = [];

    if (params?.status) {
      sql += ' AND wo.status = ?';
      countSql += ' AND wo.status = ?';
      queryParams.push(params.status);
      countParams.push(params.status);
    }

    if (params?.technicianId) {
      sql += ' AND wo.technician_id = ?';
      countSql += ' AND wo.technician_id = ?';
      queryParams.push(params.technicianId);
      countParams.push(params.technicianId);
    }

    if (params?.dateFrom) {
      sql += ' AND wo.scheduled_start_time >= ?';
      countSql += ' AND wo.scheduled_start_time >= ?';
      queryParams.push(params.dateFrom);
      countParams.push(params.dateFrom);
    }

    if (params?.dateTo) {
      sql += ' AND wo.scheduled_start_time <= ?';
      countSql += ' AND wo.scheduled_start_time <= ?';
      queryParams.push(params.dateTo);
      countParams.push(params.dateTo);
    }

    if (params?.search) {
      const search = `%${params.search}%`;
      sql += ' AND (wo.order_no LIKE ? OR wo.customer_name LIKE ? OR wo.service_type LIKE ?)';
      countSql += ' AND (wo.order_no LIKE ? OR wo.customer_name LIKE ? OR wo.service_type LIKE ?)';
      queryParams.push(search, search, search);
      countParams.push(search, search, search);
    }

    sql += ' ORDER BY wo.created_at DESC';

    if (params?.limit) {
      sql += ' LIMIT ?';
      queryParams.push(params.limit);
    }
    if (params?.offset) {
      sql += ' OFFSET ?';
      queryParams.push(params.offset);
    }

    const orders = query<WorkOrder>(sql, queryParams);
    const countResult = query<{ total: number }>(countSql, countParams);

    return { orders, total: countResult[0].total };
  }

  static getById(id: number): WorkOrder | null {
    const orders = query<WorkOrder>(`
      SELECT wo.*, t.name as technician_name, u.name as created_by_name
      FROM work_orders wo
      LEFT JOIN technicians t ON wo.technician_id = t.id
      LEFT JOIN users u ON wo.created_by = u.id
      WHERE wo.id = ?
    `, [id]);
    return orders.length > 0 ? orders[0] : null;
  }

  static create(data: {
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    serviceType: string;
    description: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    createdBy: number;
    createdByName: string;
  }): WorkOrder {
    const start = new Date(data.scheduledStartTime);
    const end = new Date(data.scheduledEndTime);

    if (end <= start) {
      throw new Error('结束时间必须晚于开始时间');
    }

    const orderNo = this.generateOrderNo();

    const id = runAndGetId(`
      INSERT INTO work_orders (
        order_no, customer_name, customer_phone, customer_address,
        service_type, description, status, scheduled_start_time,
        scheduled_end_time, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `, [
      orderNo,
      data.customerName,
      data.customerPhone,
      data.customerAddress,
      data.serviceType,
      data.description,
      data.scheduledStartTime,
      data.scheduledEndTime,
      data.createdBy,
    ]);

    this.addHistory(id, 'create', data.createdBy, data.createdByName, '创建工单');

    return this.getById(id)!;
  }

  static assign(orderId: number, technicianId: number, operatorId: number, operatorName: string): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    if (order.status !== 'pending') {
      throw new Error('只有待分配状态的工单可以分配');
    }

    const start = new Date(order.scheduled_start_time);
    const end = new Date(order.scheduled_end_time);

    const hasConflict = this.hasTimeOverlap(technicianId, start, end, orderId);
    if (hasConflict) {
      throw new Error('该技师在此时段已有工单，请改派或申请强制派单');
    }

    const isOvertime = !ScheduleService.isWithinSchedule(technicianId, start, end);
    if (isOvertime) {
      ConflictService.create(orderId, technicianId, 'overtime', '该时段不在技师班表内，属于加班');
    }

    run(`
      UPDATE work_orders
      SET status = 'assigned', technician_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [technicianId, orderId]);

    this.addHistory(orderId, 'assign', operatorId, operatorName, `分配给技师`);

    return this.getById(orderId)!;
  }

  static confirm(orderId: number, operatorId: number, operatorName: string): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    if (order.status !== 'assigned') {
      throw new Error('只有已分配状态的工单可以确认');
    }

    if (!order.technician_id) {
      throw new Error('工单未分配技师');
    }

    const start = new Date(order.scheduled_start_time);
    const end = new Date(order.scheduled_end_time);

    const hasConflict = this.hasTimeOverlap(
      order.technician_id,
      start,
      end,
      orderId,
      ['confirmed', 'in_progress']
    );
    if (hasConflict) {
      throw new Error('该技师在此时段已有其他确认工单，无法确认');
    }

    run(`
      UPDATE work_orders
      SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [orderId]);

    this.addHistory(orderId, 'confirm', operatorId, operatorName, '确认工单');

    const unresolvedConflicts = ConflictService.getByOrderId(orderId).filter(c => !c.resolved);
    if (unresolvedConflicts.length > 0) {
      unresolvedConflicts.forEach(c => {
        ConflictService.resolve(c.id);
        this.addHistory(orderId, 'conflict_resolved', operatorId, operatorName, `冲突已处理: ${c.description}`);
      });
    }

    return this.getById(orderId)!;
  }

  static startProgress(orderId: number, operatorId: number, operatorName: string): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    if (order.status !== 'confirmed') {
      throw new Error('只有已确认状态的工单可以开始服务');
    }

    run(`
      UPDATE work_orders
      SET status = 'in_progress', actual_start_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [orderId]);

    this.addHistory(orderId, 'start_progress', operatorId, operatorName, '开始上门服务');

    return this.getById(orderId)!;
  }

  static complete(orderId: number, operatorId: number, operatorName: string, remark?: string): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    if (order.status !== 'in_progress' && order.status !== 'confirmed') {
      throw new Error('只有已确认或服务中的工单可以完成');
    }

    run(`
      UPDATE work_orders
      SET status = 'completed', actual_end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [orderId]);

    this.addHistory(orderId, 'complete', operatorId, operatorName, remark || '完成工单');

    return this.getById(orderId)!;
  }

  static cancel(orderId: number, operatorId: number, operatorName: string, reason: string): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new Error('已完成或已取消的工单不能取消');
    }

    run(`
      UPDATE work_orders
      SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [reason, orderId]);

    this.addHistory(orderId, 'cancel', operatorId, operatorName, `取消原因: ${reason}`);

    return this.getById(orderId)!;
  }

  static applyReassign(
    orderId: number,
    operatorId: number,
    operatorName: string,
    reason: string
  ): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    if (order.status !== 'confirmed' && order.status !== 'assigned') {
      throw new Error('只有已分配或已确认状态的工单可以申请改派');
    }

    this.addHistory(orderId, 'apply_reassign', operatorId, operatorName, `改派原因: ${reason}`);

    return this.getById(orderId)!;
  }

  static reassign(
    orderId: number,
    newTechnicianId: number,
    operatorId: number,
    operatorName: string,
    reason: string
  ): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    const start = new Date(order.scheduled_start_time);
    const end = new Date(order.scheduled_end_time);

    const hasConflict = this.hasTimeOverlap(newTechnicianId, start, end, orderId);
    if (hasConflict) {
      throw new Error('新技师在此时段已有工单，请申请强制派单');
    }

    run(`
      UPDATE work_orders
      SET status = 'assigned', technician_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newTechnicianId, orderId]);

    this.addHistory(orderId, 'reassign', operatorId, operatorName, `改派给新技师，原因: ${reason}`);

    return this.getById(orderId)!;
  }

  static forceAssign(
    orderId: number,
    technicianId: number,
    operatorId: number,
    operatorName: string,
    reason: string
  ): WorkOrder {
    const order = this.getById(orderId);
    if (!order) throw new Error('工单不存在');

    if (order.status !== 'pending') {
      throw new Error('只有待分配状态的工单可以强制派单');
    }

    const start = new Date(order.scheduled_start_time);
    const end = new Date(order.scheduled_end_time);

    run(`
      UPDATE work_orders
      SET status = 'assigned', technician_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [technicianId, orderId]);

    ConflictService.create(orderId, technicianId, 'time_overlap', '强制派单: 时段重叠');

    this.addHistory(orderId, 'force_assign', operatorId, operatorName, `强制派单，原因: ${reason}`);

    return this.getById(orderId)!;
  }

  static hasTimeOverlap(
    technicianId: number,
    startTime: Date,
    endTime: Date,
    excludeOrderId?: number,
    statuses: string[] = ['assigned', 'confirmed', 'in_progress']
  ): boolean {
    const placeholders = statuses.map(() => '?').join(', ');
    let sql = `
      SELECT COUNT(*) as count FROM work_orders
      WHERE technician_id = ?
      AND status IN (${placeholders})
      AND (
        (scheduled_start_time < ? AND scheduled_end_time > ?)
        OR (scheduled_start_time >= ? AND scheduled_start_time < ?)
      )
    `;
    const params: any[] = [
      technicianId,
      ...statuses,
      endTime.toISOString(),
      startTime.toISOString(),
      startTime.toISOString(),
      endTime.toISOString(),
    ];

    if (excludeOrderId) {
      sql += ' AND id != ?';
      params.push(excludeOrderId);
    }

    const result = query<{ count: number }>(sql, params);
    return result[0].count > 0;
  }

  static getHistory(orderId: number): OrderHistory[] {
    return query<OrderHistory>(
      'SELECT * FROM order_histories WHERE order_id = ? ORDER BY created_at ASC, id ASC',
      [orderId]
    );
  }

  static addHistory(
    orderId: number,
    action: string,
    operatorId: number,
    operatorName: string,
    remark?: string
  ): void {
    run(
      'INSERT INTO order_histories (order_id, action, operator_id, operator_name, remark) VALUES (?, ?, ?, ?, ?)',
      [orderId, action, operatorId, operatorName, remark || null]
    );
  }
}
