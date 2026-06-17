import { query, run, runAndGetId } from '../db/index.js';
import { Approval, ApprovalType, ApprovalStatus } from '../../shared/types.js';
import { OrderService } from './OrderService.js';
import { ConflictService } from './ConflictService.js';

export class ApprovalService {
  static getAll(status?: ApprovalStatus, type?: ApprovalType): Approval[] {
    let sql = `
      SELECT a.*, wo.order_no, wo.customer_name
      FROM approvals a
      LEFT JOIN work_orders wo ON a.order_id = wo.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    if (type) {
      sql += ' AND a.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY a.created_at DESC';
    return query<Approval>(sql, params);
  }

  static getById(id: number): Approval | null {
    const approvals = query<Approval>(`
      SELECT a.*, wo.order_no, wo.customer_name
      FROM approvals a
      LEFT JOIN work_orders wo ON a.order_id = wo.id
      WHERE a.id = ?
    `, [id]);
    return approvals.length > 0 ? approvals[0] : null;
  }

  static create(
    type: ApprovalType,
    orderId: number,
    applicantId: number,
    applicantName: string,
    reason: string,
    targetTechnicianId?: number
  ): Approval {
    const id = runAndGetId(
      `INSERT INTO approvals (type, order_id, applicant_id, applicant_name, reason, target_technician_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [type, orderId, applicantId, applicantName, reason, targetTechnicianId || null]
    );
    return this.getById(id)!;
  }

  static withdraw(
    id: number,
    operatorId: number,
    operatorName: string,
    reason?: string
  ): Approval {
    const approval = this.getById(id);
    if (!approval) throw new Error('审批不存在');

    if (approval.status !== 'pending') {
      throw new Error('只有待审批的申请可以撤回');
    }

    if (approval.applicant_id !== operatorId) {
      throw new Error('只有申请人可以撤回申请');
    }

    run(
      `UPDATE approvals
       SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP, withdraw_reason = ?
       WHERE id = ?`,
      [reason || null, id]
    );

    const conflicts = ConflictService.getByOrderId(approval.order_id).filter(
      c => c.approval_id === id
    );
    conflicts.forEach(c => ConflictService.unlinkApproval(c.id));

    OrderService.addHistory(
      approval.order_id,
      `approval_withdrawn_${approval.type}`,
      operatorId,
      operatorName,
      `撤回申请: ${reason || '无理由'}`
    );

    return this.getById(id)!;
  }

  static approve(
    id: number,
    approverId: number,
    approverName: string,
    remark?: string
  ): Approval {
    const approval = this.getById(id);
    if (!approval) throw new Error('审批不存在');

    if (approval.status !== 'pending') {
      throw new Error('该审批已处理');
    }

    run(
      `UPDATE approvals
       SET status = 'approved', approver_id = ?, approver_name = ?, approval_remark = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [approverId, approverName, remark || null, id]
    );

    if (approval.type === 'force_assign') {
      const targetTechId = approval.target_technician_id;
      if (targetTechId) {
        OrderService.forceAssign(
          approval.order_id,
          targetTechId,
          approverId,
          approverName,
          `审批通过: ${remark || '强制派单'}`
        );
        const conflicts = ConflictService.getByOrderId(approval.order_id).filter(
          c => c.technician_id === targetTechId && !c.resolved
        );
        conflicts.forEach(c => ConflictService.resolve(c.id));
        OrderService.addHistory(
          approval.order_id,
          'force_assign_approved',
          approverId,
          approverName,
          `主管审批通过强制派单，审批意见: ${remark || '无'}`
        );
      }
    } else if (approval.type === 'reassign') {
      OrderService.addHistory(
        approval.order_id,
        'reassign_approved',
        approverId,
        approverName,
        `改派审批通过: ${remark || ''}`
      );
    }

    return this.getById(id)!;
  }

  static reject(
    id: number,
    approverId: number,
    approverName: string,
    remark?: string
  ): Approval {
    const approval = this.getById(id);
    if (!approval) throw new Error('审批不存在');

    if (approval.status !== 'pending') {
      throw new Error('该审批已处理');
    }

    run(
      `UPDATE approvals
       SET status = 'rejected', approver_id = ?, approver_name = ?, approval_remark = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [approverId, approverName, remark || null, id]
    );

    OrderService.addHistory(
      approval.order_id,
      `approval_rejected_${approval.type}`,
      approverId,
      approverName,
      `审批驳回: ${remark || ''}`
    );

    return this.getById(id)!;
  }

  static exportCsv(params?: {
    status?: ApprovalStatus;
    type?: ApprovalType;
  }): string {
    const approvals = this.getAll(params?.status, params?.type);

    const headers = [
      'ID',
      '类型',
      '工单编号',
      '客户姓名',
      '申请人',
      '申请理由',
      '目标技师ID',
      '状态',
      '审批人',
      '审批意见',
      '申请时间',
      '审批时间',
      '撤回时间',
      '撤回原因',
    ];

    const typeLabels: Record<string, string> = {
      reassign: '改派申请',
      force_assign: '强制派单',
      overtime: '加班申请',
    };

    const statusLabels: Record<string, string> = {
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

    const rows = approvals.map(a => [
      a.id,
      typeLabels[a.type] || a.type,
      a.order_no || '',
      a.customer_name || '',
      a.applicant_name,
      a.reason,
      a.target_technician_id || '',
      statusLabels[a.status] || a.status,
      a.approver_name || '',
      a.approval_remark || '',
      a.created_at,
      a.approved_at || '',
      a.withdrawn_at || '',
      a.withdraw_reason || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(escapeCsv).join(','))
      .join('\n');

    return '\ufeff' + csv;
  }
}
