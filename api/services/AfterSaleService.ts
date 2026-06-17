import { query, run, runAndGetId } from '../db/index.js';
import {
  ReturnVisitTemplate,
  AppealCategory,
  AfterSaleConfig,
  ReturnVisit,
  ReturnVisitStatus,
  ReturnVisitResult,
  Appeal,
  AppealStatus,
  AfterSaleOperationType,
  AfterSaleOperationLog,
  ReturnVisitHistory,
  AppealHistory,
  ReturnVisitDetail,
  AppealDetail,
  ImportResult,
  WorkOrder,
} from '../../shared/types.js';

const VALID_VISIT_STATUSES: ReturnVisitStatus[] = ['pending', 'in_progress', 'completed', 'timeout', 'cancelled'];
const VALID_VISIT_RESULTS: ReturnVisitResult[] = ['satisfied', 'dissatisfied', 'no_answer', 'invalid_number', 'refused'];
const VALID_APPEAL_STATUSES: AppealStatus[] = ['pending', 'accepted', 'rejected', 'reassigned', 'resolved', 'withdrawn'];

function getConfigInt(key: string, defaultValue: number): number {
  const rows = query<AfterSaleConfig>('SELECT config_value FROM after_sale_configs WHERE config_key = ?', [key]);
  if (rows.length === 0) return defaultValue;
  const val = parseInt(rows[0].config_value);
  return isNaN(val) ? defaultValue : val;
}

function logOperation(
  operationType: AfterSaleOperationType,
  relatedId: number | null,
  relatedType: string | null,
  operatorId: number,
  operatorName: string,
  detail: string
): void {
  run(
    `INSERT INTO after_sale_operation_logs (operation_type, related_id, related_type, operator_id, operator_name, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [operationType, relatedId, relatedType, operatorId, operatorName, detail]
  );
}

export class AfterSaleService {
  static getTemplates(enabled?: number): ReturnVisitTemplate[] {
    let sql = 'SELECT * FROM return_visit_templates WHERE 1=1';
    const params: any[] = [];
    if (enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(enabled);
    }
    sql += ' ORDER BY id ASC';
    return query<ReturnVisitTemplate>(sql, params);
  }

  static getTemplateById(id: number): ReturnVisitTemplate | null {
    const rows = query<ReturnVisitTemplate>('SELECT * FROM return_visit_templates WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static createTemplate(name: string, content: string, operatorId: number, operatorName: string): ReturnVisitTemplate {
    if (!name?.trim()) throw new Error('模板名称不能为空');
    if (!content?.trim()) throw new Error('模板内容不能为空');
    const id = runAndGetId(
      'INSERT INTO return_visit_templates (name, content, enabled) VALUES (?, ?, 1)',
      [name.trim(), content.trim()]
    );
    logOperation('template_created', id, 'template', operatorId, operatorName, `创建回访模板: ${name}`);
    return this.getTemplateById(id)!;
  }

  static updateTemplate(id: number, name: string, content: string, operatorId: number, operatorName: string): ReturnVisitTemplate {
    const existing = this.getTemplateById(id);
    if (!existing) throw new Error('模板不存在');
    if (!name?.trim()) throw new Error('模板名称不能为空');
    if (!content?.trim()) throw new Error('模板内容不能为空');
    run(
      'UPDATE return_visit_templates SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), content.trim(), id]
    );
    logOperation('template_updated', id, 'template', operatorId, operatorName, `更新回访模板: ${name}`);
    return this.getTemplateById(id)!;
  }

  static setTemplateEnabled(id: number, enabled: number, operatorId: number, operatorName: string): ReturnVisitTemplate {
    const existing = this.getTemplateById(id);
    if (!existing) throw new Error('模板不存在');
    if (enabled !== 0 && enabled !== 1) throw new Error('enabled 必须为 0 或 1');
    run('UPDATE return_visit_templates SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [enabled, id]);
    logOperation(enabled === 1 ? 'template_updated' : 'template_updated', id, 'template', operatorId, operatorName,
      `${enabled === 1 ? '启用' : '停用'}回访模板: ${existing.name}`);
    return this.getTemplateById(id)!;
  }

  static deleteTemplate(id: number, operatorId: number, operatorName: string): boolean {
    const existing = this.getTemplateById(id);
    if (!existing) throw new Error('模板不存在');
    logOperation('template_deleted', id, 'template', operatorId, operatorName, `删除回访模板: ${existing.name}`);
    const result = run('DELETE FROM return_visit_templates WHERE id = ?', [id]);
    return result > 0;
  }

  static getCategories(enabled?: number): AppealCategory[] {
    let sql = 'SELECT * FROM appeal_categories WHERE 1=1';
    const params: any[] = [];
    if (enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(enabled);
    }
    sql += ' ORDER BY id ASC';
    return query<AppealCategory>(sql, params);
  }

  static getCategoryById(id: number): AppealCategory | null {
    const rows = query<AppealCategory>('SELECT * FROM appeal_categories WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static createCategory(name: string, description: string, operatorId: number, operatorName: string): AppealCategory {
    if (!name?.trim()) throw new Error('分类名称不能为空');
    const id = runAndGetId(
      'INSERT INTO appeal_categories (name, description, enabled) VALUES (?, ?, 1)',
      [name.trim(), (description || '').trim()]
    );
    logOperation('category_created', id, 'category', operatorId, operatorName, `创建申诉分类: ${name}`);
    return this.getCategoryById(id)!;
  }

  static updateCategory(id: number, name: string, description: string, operatorId: number, operatorName: string): AppealCategory {
    const existing = this.getCategoryById(id);
    if (!existing) throw new Error('分类不存在');
    if (!name?.trim()) throw new Error('分类名称不能为空');
    run(
      'UPDATE appeal_categories SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), (description || '').trim(), id]
    );
    logOperation('category_updated', id, 'category', operatorId, operatorName, `更新申诉分类: ${name}`);
    return this.getCategoryById(id)!;
  }

  static setCategoryEnabled(id: number, enabled: number, operatorId: number, operatorName: string): AppealCategory {
    const existing = this.getCategoryById(id);
    if (!existing) throw new Error('分类不存在');
    if (enabled !== 0 && enabled !== 1) throw new Error('enabled 必须为 0 或 1');
    run('UPDATE appeal_categories SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [enabled, id]);
    logOperation('category_updated', id, 'category', operatorId, operatorName,
      `${enabled === 1 ? '启用' : '停用'}申诉分类: ${existing.name}`);
    return this.getCategoryById(id)!;
  }

  static deleteCategory(id: number, operatorId: number, operatorName: string): boolean {
    const existing = this.getCategoryById(id);
    if (!existing) throw new Error('分类不存在');
    logOperation('category_deleted', id, 'category', operatorId, operatorName, `删除申诉分类: ${existing.name}`);
    const result = run('DELETE FROM appeal_categories WHERE id = ?', [id]);
    return result > 0;
  }

  static getConfigs(): AfterSaleConfig[] {
    return query<AfterSaleConfig>('SELECT * FROM after_sale_configs ORDER BY id ASC');
  }

  static updateConfig(configKey: string, configValue: string, description: string, operatorId: number, operatorName: string): AfterSaleConfig {
    if (!configKey?.trim()) throw new Error('配置键不能为空');
    if (configValue === undefined || configValue === null) throw new Error('配置值不能为空');

    const existing = query<AfterSaleConfig>('SELECT * FROM after_sale_configs WHERE config_key = ?', [configKey.trim()]);
    if (existing.length === 0) {
      const id = runAndGetId(
        'INSERT INTO after_sale_configs (config_key, config_value, description) VALUES (?, ?, ?)',
        [configKey.trim(), String(configValue), (description || '').trim()]
      );
      logOperation('config_created', id, 'config', operatorId, operatorName,
        `创建售后配置: ${configKey}=${configValue}`);
      return query<AfterSaleConfig>('SELECT * FROM after_sale_configs WHERE id = ?', [id])[0];
    } else {
      run(
        'UPDATE after_sale_configs SET config_value = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?',
        [String(configValue), (description || existing[0].description || '').trim(), configKey.trim()]
      );
      logOperation('config_updated', existing[0].id, 'config', operatorId, operatorName,
        `更新售后配置: ${configKey}=${configValue}`);
      return query<AfterSaleConfig>('SELECT * FROM after_sale_configs WHERE id = ?', [existing[0].id])[0];
    }
  }

  static getVisits(filters?: {
    status?: ReturnVisitStatus;
    initiatorId?: number;
    orderId?: number;
    keyword?: string;
    limit?: number;
    offset?: number;
  }): ReturnVisit[] {
    let sql = `
      SELECT rv.*, wo.order_no, wo.customer_name, wo.customer_phone, wo.customer_address, wo.service_type,
             rvt.name as template_name
      FROM return_visits rv
      LEFT JOIN work_orders wo ON rv.order_id = wo.id
      LEFT JOIN return_visit_templates rvt ON rv.template_id = rvt.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.status) {
      sql += ' AND rv.status = ?';
      params.push(filters.status);
    }
    if (filters?.initiatorId) {
      sql += ' AND rv.initiator_id = ?';
      params.push(filters.initiatorId);
    }
    if (filters?.orderId) {
      sql += ' AND rv.order_id = ?';
      params.push(filters.orderId);
    }
    if (filters?.keyword) {
      sql += ' AND (wo.order_no LIKE ? OR wo.customer_name LIKE ? OR wo.customer_phone LIKE ?)';
      const kw = `%${filters.keyword}%`;
      params.push(kw, kw, kw);
    }

    sql += ' ORDER BY rv.id DESC';
    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters?.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    return query<ReturnVisit>(sql, params);
  }

  static getVisitById(id: number): ReturnVisit | null {
    const rows = query<ReturnVisit>(`
      SELECT rv.*, wo.order_no, wo.customer_name, wo.customer_phone, wo.customer_address, wo.service_type,
             rvt.name as template_name
      FROM return_visits rv
      LEFT JOIN work_orders wo ON rv.order_id = wo.id
      LEFT JOIN return_visit_templates rvt ON rv.template_id = rvt.id
      WHERE rv.id = ?
    `, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static createVisit(
    orderId: number,
    templateId: number | null,
    operatorId: number,
    operatorName: string
  ): ReturnVisit {
    const order = query<WorkOrder>('SELECT * FROM work_orders WHERE id = ?', [orderId]);
    if (order.length === 0) throw new Error('工单不存在');

    if (order[0].status !== 'completed') {
      throw new Error('只有已完成的工单才能发起回访');
    }

    const existing = query<ReturnVisit>(
      `SELECT id, status FROM return_visits WHERE order_id = ? AND status IN ('pending', 'in_progress')`,
      [orderId]
    );
    if (existing.length > 0) {
      throw new Error(`该工单已有未完成的回访任务 (ID: ${existing[0].id})`);
    }

    const timeoutHours = getConfigInt('visit_timeout_hours', 24);
    const imageRequired = getConfigInt('appeal_image_required', 0);
    const dueAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

    const id = runAndGetId(
      `INSERT INTO return_visits
       (order_id, template_id, status, image_required, timeout_hours, initiator_id, initiator_name, handler_id, handler_name, due_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, templateId, imageRequired, timeoutHours, operatorId, operatorName, operatorId, operatorName, dueAt]
    );

    run(
      `INSERT INTO return_visit_histories (visit_id, action, operator_id, operator_name, remark)
       VALUES (?, 'created', ?, ?, '发起回访任务')`,
      [id, operatorId, operatorName]
    );

    logOperation('visit_created', id, 'visit', operatorId, operatorName,
      `针对工单 ${order[0].order_no} 发起回访`);

    return this.getVisitById(id)!;
  }

  static completeVisit(
    id: number,
    result: ReturnVisitResult,
    remark: string | null,
    imageUrl: string | null,
    operatorId: number,
    operatorName: string
  ): ReturnVisit {
    const visit = this.getVisitById(id);
    if (!visit) throw new Error('回访记录不存在');

    if (visit.status === 'completed' || visit.status === 'cancelled') {
      throw new Error('该回访已完成或已取消，不能再次处理');
    }

    if (!VALID_VISIT_RESULTS.includes(result)) {
      throw new Error(`无效的回访结果: ${result}`);
    }

    run(
      `UPDATE return_visits SET status = 'completed', result = ?, remark = ?, image_url = ?,
       handler_id = ?, handler_name = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result, remark, imageUrl, operatorId, operatorName, id]
    );

    run(
      `INSERT INTO return_visit_histories (visit_id, action, operator_id, operator_name, remark)
       VALUES (?, 'completed', ?, ?, ?)`,
      [id, operatorId, operatorName, `完成回访，结果: ${result}${remark ? '，备注: ' + remark : ''}`]
    );

    logOperation('visit_completed', id, 'visit', operatorId, operatorName,
      `完成回访，结果: ${result}`);

    return this.getVisitById(id)!;
  }

  static cancelVisit(id: number, remark: string, operatorId: number, operatorName: string): ReturnVisit {
    const visit = this.getVisitById(id);
    if (!visit) throw new Error('回访记录不存在');

    if (visit.status === 'completed' || visit.status === 'cancelled') {
      throw new Error('该回访已完成或已取消');
    }

    run(
      `UPDATE return_visits SET status = 'cancelled', remark = ?,
       handler_id = ?, handler_name = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [remark || '', operatorId, operatorName, id]
    );

    run(
      `INSERT INTO return_visit_histories (visit_id, action, operator_id, operator_name, remark)
       VALUES (?, 'cancelled', ?, ?, ?)`,
      [id, operatorId, operatorName, `取消回访: ${remark || '无'}`]
    );

    logOperation('visit_cancelled', id, 'visit', operatorId, operatorName,
      `取消回访: ${remark || '无'}`);

    return this.getVisitById(id)!;
  }

  static getVisitDetail(id: number, userId: number, userRole: string): ReturnVisitDetail | null {
    const visit = this.getVisitById(id);
    if (!visit) return null;

    const histories = query<ReturnVisitHistory>(
      'SELECT * FROM return_visit_histories WHERE visit_id = ? ORDER BY id ASC',
      [id]
    );

    const appeals = this.getAppeals({ visitId: id });

    const isOwner = visit.initiator_id === userId;
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isCS = userRole === 'customer_service';

    const canEdit = (isOwner || isAdmin || isSupervisor) && (visit.status === 'pending' || visit.status === 'in_progress');
    const canComplete = (isOwner || isAdmin || isSupervisor || isCS) && (visit.status === 'pending' || visit.status === 'in_progress');
    const canCancel = (isOwner || isAdmin || isSupervisor) && (visit.status === 'pending' || visit.status === 'in_progress');
    const canSubmitAppeal = (isOwner || isAdmin || isSupervisor || isCS) && visit.status === 'completed';

    return {
      visit,
      histories,
      appeals,
      available_actions: { can_edit: canEdit, can_complete: canComplete, can_cancel: canCancel, can_submit_appeal: canSubmitAppeal },
    };
  }

  static getAppeals(filters?: {
    status?: AppealStatus;
    submitterId?: number;
    orderId?: number;
    visitId?: number;
    keyword?: string;
    limit?: number;
    offset?: number;
  }): Appeal[] {
    let sql = `
      SELECT a.*, wo.order_no, wo.customer_name, ac.name as category_name
      FROM appeals a
      LEFT JOIN work_orders wo ON a.order_id = wo.id
      LEFT JOIN appeal_categories ac ON a.category_id = ac.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.status) {
      sql += ' AND a.status = ?';
      params.push(filters.status);
    }
    if (filters?.submitterId) {
      sql += ' AND a.submitter_id = ?';
      params.push(filters.submitterId);
    }
    if (filters?.orderId) {
      sql += ' AND a.order_id = ?';
      params.push(filters.orderId);
    }
    if (filters?.visitId) {
      sql += ' AND a.visit_id = ?';
      params.push(filters.visitId);
    }
    if (filters?.keyword) {
      sql += ' AND (wo.order_no LIKE ? OR wo.customer_name LIKE ? OR a.reason LIKE ?)';
      const kw = `%${filters.keyword}%`;
      params.push(kw, kw, kw);
    }

    sql += ' ORDER BY a.id DESC';
    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters?.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    return query<Appeal>(sql, params);
  }

  static getAppealById(id: number): Appeal | null {
    const rows = query<Appeal>(`
      SELECT a.*, wo.order_no, wo.customer_name, ac.name as category_name
      FROM appeals a
      LEFT JOIN work_orders wo ON a.order_id = wo.id
      LEFT JOIN appeal_categories ac ON a.category_id = ac.id
      WHERE a.id = ?
    `, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static createAppeal(
    visitId: number,
    categoryId: number,
    reason: string,
    imageUrl: string | null,
    operatorId: number,
    operatorName: string
  ): Appeal {
    const visit = this.getVisitById(visitId);
    if (!visit) throw new Error('回访记录不存在');
    if (visit.status !== 'completed') {
      throw new Error('只有已完成的回访才能提交申诉');
    }

    const category = this.getCategoryById(categoryId);
    if (!category) throw new Error('申诉分类不存在');
    if (category.enabled !== 1) throw new Error('该申诉分类已被禁用');

    if (!reason?.trim()) throw new Error('申诉理由不能为空');

    const imageRequired = getConfigInt('appeal_image_required', 0);
    if (imageRequired === 1 && !imageUrl) {
      throw new Error('根据配置，申诉必须上传图片凭证');
    }

    const existingOpen = query<Appeal>(
      `SELECT id, status FROM appeals WHERE visit_id = ? AND status IN ('pending', 'accepted', 'reassigned')`,
      [visitId]
    );
    if (existingOpen.length > 0) {
      throw new Error(`该回访已有处理中的申诉 (ID: ${existingOpen[0].id})，请先处理完成后再提交`);
    }

    const existingResolved = query<Appeal>(
      `SELECT id FROM appeals WHERE visit_id = ? AND status = 'resolved'`,
      [visitId]
    );
    if (existingResolved.length > 0) {
      throw new Error('该回访的申诉已解决，如仍有问题请联系主管');
    }

    const timeoutHours = getConfigInt('appeal_timeout_hours', 48);
    const dueAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

    const id = runAndGetId(
      `INSERT INTO appeals
       (visit_id, order_id, category_id, status, reason, image_url, image_required,
        submitter_id, submitter_name, timeout_hours, due_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      [visitId, visit.order_id, categoryId, reason.trim(), imageUrl, imageRequired,
        operatorId, operatorName, timeoutHours, dueAt]
    );

    run(
      `INSERT INTO appeal_histories (appeal_id, action, operator_id, operator_name, remark)
       VALUES (?, 'created', ?, ?, ?)`,
      [id, operatorId, operatorName, `提交申诉: ${reason.trim().substring(0, 100)}`]
    );

    logOperation('appeal_created', id, 'appeal', operatorId, operatorName,
      `提交申诉，工单: ${visit.order_no}，分类: ${category.name}`);

    return this.getAppealById(id)!;
  }

  static acceptAppeal(id: number, remark: string, operatorId: number, operatorName: string): Appeal {
    const appeal = this.getAppealById(id);
    if (!appeal) throw new Error('申诉不存在');
    if (appeal.status !== 'pending') {
      throw new Error('只有待受理的申诉才能被受理');
    }

    run(
      `UPDATE appeals SET status = 'accepted', handler_id = ?, handler_name = ?, handle_remark = ?,
       handled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [operatorId, operatorName, remark || '', id]
    );

    run(
      `INSERT INTO appeal_histories (appeal_id, action, operator_id, operator_name, remark)
       VALUES (?, 'accepted', ?, ?, ?)`,
      [id, operatorId, operatorName, `受理申诉${remark ? ': ' + remark : ''}`]
    );

    logOperation('appeal_accepted', id, 'appeal', operatorId, operatorName,
      `受理申诉，工单: ${appeal.order_no}`);

    return this.getAppealById(id)!;
  }

  static rejectAppeal(id: number, remark: string, operatorId: number, operatorName: string): Appeal {
    const appeal = this.getAppealById(id);
    if (!appeal) throw new Error('申诉不存在');
    if (appeal.status !== 'pending' && appeal.status !== 'accepted' && appeal.status !== 'reassigned') {
      throw new Error('该申诉状态下无法驳回');
    }
    if (!remark?.trim()) throw new Error('驳回理由不能为空');

    run(
      `UPDATE appeals SET status = 'rejected', handler_id = ?, handler_name = ?, handle_remark = ?,
       handled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [operatorId, operatorName, remark.trim(), id]
    );

    run(
      `INSERT INTO appeal_histories (appeal_id, action, operator_id, operator_name, remark)
       VALUES (?, 'rejected', ?, ?, ?)`,
      [id, operatorId, operatorName, `驳回申诉: ${remark.trim()}`]
    );

    logOperation('appeal_rejected', id, 'appeal', operatorId, operatorName,
      `驳回申诉，工单: ${appeal.order_no}，理由: ${remark.trim()}`);

    return this.getAppealById(id)!;
  }

  static reassignAppeal(id: number, targetHandlerId: number, targetHandlerName: string, remark: string, operatorId: number, operatorName: string): Appeal {
    const appeal = this.getAppealById(id);
    if (!appeal) throw new Error('申诉不存在');
    if (appeal.status !== 'pending' && appeal.status !== 'accepted') {
      throw new Error('该申诉状态下无法转派');
    }

    const targetUser = query('SELECT id, name FROM users WHERE id = ?', [targetHandlerId]);
    if (targetUser.length === 0) throw new Error('目标处理人不存在');

    const actualName = (targetUser[0] as any).name || targetHandlerName;

    run(
      `UPDATE appeals SET status = 'reassigned', handler_id = ?, handler_name = ?, handle_remark = ?,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [targetHandlerId, actualName, remark || '', id]
    );

    run(
      `INSERT INTO appeal_histories (appeal_id, action, operator_id, operator_name, remark)
       VALUES (?, 'reassigned', ?, ?, ?)`,
      [id, operatorId, operatorName, `转派给 ${actualName}${remark ? ': ' + remark : ''}`]
    );

    logOperation('appeal_reassigned', id, 'appeal', operatorId, operatorName,
      `转派申诉给 ${actualName}，工单: ${appeal.order_no}`);

    return this.getAppealById(id)!;
  }

  static resolveAppeal(id: number, remark: string, operatorId: number, operatorName: string): Appeal {
    const appeal = this.getAppealById(id);
    if (!appeal) throw new Error('申诉不存在');
    if (appeal.status !== 'accepted' && appeal.status !== 'reassigned') {
      throw new Error('该申诉状态下无法标记解决');
    }
    if (!remark?.trim()) throw new Error('处理结果说明不能为空');

    run(
      `UPDATE appeals SET status = 'resolved', handler_id = ?, handler_name = ?, handle_remark = ?,
       handled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [operatorId, operatorName, remark.trim(), id]
    );

    run(
      `INSERT INTO appeal_histories (appeal_id, action, operator_id, operator_name, remark)
       VALUES (?, 'resolved', ?, ?, ?)`,
      [id, operatorId, operatorName, `申诉解决: ${remark.trim()}`]
    );

    logOperation('appeal_resolved', id, 'appeal', operatorId, operatorName,
      `申诉解决，工单: ${appeal.order_no}`);

    return this.getAppealById(id)!;
  }

  static withdrawAppeal(id: number, remark: string, operatorId: number, operatorName: string): Appeal {
    const appeal = this.getAppealById(id);
    if (!appeal) throw new Error('申诉不存在');

    if (appeal.submitter_id !== operatorId) {
      throw new Error('只有申诉提交人才能撤回');
    }

    if (appeal.status === 'resolved' || appeal.status === 'withdrawn') {
      throw new Error('该申诉状态下无法撤回');
    }

    if (appeal.status === 'rejected') {
      throw new Error('已驳回的申诉无法撤回，可重新提交');
    }

    run(
      `UPDATE appeals SET status = 'withdrawn', handle_remark = ?,
       handled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [remark || '', id]
    );

    run(
      `INSERT INTO appeal_histories (appeal_id, action, operator_id, operator_name, remark)
       VALUES (?, 'withdrawn', ?, ?, ?)`,
      [id, operatorId, operatorName, `撤回申诉${remark ? ': ' + remark : ''}`]
    );

    logOperation('appeal_withdrawn', id, 'appeal', operatorId, operatorName,
      `撤回申诉，工单: ${appeal.order_no}${remark ? '，理由: ' + remark : ''}`);

    return this.getAppealById(id)!;
  }

  static getAppealDetail(id: number, userId: number, userRole: string): AppealDetail | null {
    const appeal = this.getAppealById(id);
    if (!appeal) return null;

    const histories = query<AppealHistory>(
      'SELECT * FROM appeal_histories WHERE appeal_id = ? ORDER BY id ASC',
      [id]
    );

    const visit = this.getVisitById(appeal.visit_id);

    const isOwner = appeal.submitter_id === userId;
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';

    const canAccept = (isAdmin || isSupervisor) && appeal.status === 'pending';
    const canReject = (isAdmin || isSupervisor) &&
      (appeal.status === 'pending' || appeal.status === 'accepted' || appeal.status === 'reassigned');
    const canReassign = (isAdmin || isSupervisor) &&
      (appeal.status === 'pending' || appeal.status === 'accepted');
    const canResolve = (isAdmin || isSupervisor) &&
      (appeal.status === 'accepted' || appeal.status === 'reassigned');
    const canWithdraw = isOwner &&
      (appeal.status === 'pending' || appeal.status === 'accepted' || appeal.status === 'reassigned');

    return {
      appeal,
      histories,
      visit,
      available_actions: { can_accept: canAccept, can_reject: canReject, can_reassign: canReassign, can_resolve: canResolve, can_withdraw: canWithdraw },
    };
  }

  static getOperationLogs(filters?: {
    operationType?: AfterSaleOperationType;
    relatedType?: string;
    relatedId?: number;
    limit?: number;
    offset?: number;
  }): AfterSaleOperationLog[] {
    let sql = 'SELECT * FROM after_sale_operation_logs WHERE 1=1';
    const params: any[] = [];

    if (filters?.operationType) {
      sql += ' AND operation_type = ?';
      params.push(filters.operationType);
    }
    if (filters?.relatedType) {
      sql += ' AND related_type = ?';
      params.push(filters.relatedType);
    }
    if (filters?.relatedId) {
      sql += ' AND related_id = ?';
      params.push(filters.relatedId);
    }

    sql += ' ORDER BY created_at DESC, id DESC';
    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters?.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }

    return query<AfterSaleOperationLog>(sql, params);
  }

  private static parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  }

  private static escapeCsv(val: any): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private static isValidDateTime(str: string): boolean {
    if (!str) return true;
    const d = new Date(str);
    return !isNaN(d.getTime());
  }

  static importVisitsCsv(
    csvContent: string,
    operatorId: number,
    operatorName: string
  ): ImportResult {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      return { total: 0, success: 0, failed: 0, errors: [{ row: 0, reason: 'CSV 文件为空或缺少表头', data: '' }] };
    }

    const headerLine = lines[0];
    const headers = this.parseCsvLine(headerLine);
    const expectedHeaders = ['工单号', '回访模板ID', '预约回访时间'];
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => { headerMap[h.trim()] = i; });

    for (const eh of expectedHeaders) {
      if (!(eh in headerMap)) {
        const errs = [{ row: 1, reason: `缺少必需列: ${eh}`, data: headerLine }];
        logOperation('import_failure', null, 'visit_import', operatorId, operatorName,
          `导入回访名单失败: 缺少必需列 ${eh}`);
        return { total: 0, success: 0, failed: errs.length, errors: errs };
      }
    }

    const result: ImportResult = { total: lines.length - 1, success: 0, failed: 0, errors: [] };
    const validRows: { orderId: number; templateId: number | null; dueAt: string; orderNo: string }[] = [];
    const processedOrderNos = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const fields = this.parseCsvLine(line);
      const orderNo = (fields[headerMap['工单号']] || '').trim();
      const templateIdStr = (fields[headerMap['回访模板ID']] || '').trim();
      const dueAtStr = (fields[headerMap['预约回访时间']] || '').trim();

      const row = i + 1;
      const rowErrors: string[] = [];

      if (!orderNo) rowErrors.push('工单号不能为空');

      let templateId: number | null = null;
      if (templateIdStr) {
        const tid = parseInt(templateIdStr);
        if (isNaN(tid)) {
          rowErrors.push('回访模板ID必须为数字');
        } else {
          templateId = tid;
          if (templateId !== null) {
            const tpl = this.getTemplateById(templateId);
            if (!tpl) rowErrors.push(`回访模板不存在 (ID: ${templateId})`);
          }
        }
      }

      if (!dueAtStr) {
        rowErrors.push('预约回访时间不能为空');
      } else if (!this.isValidDateTime(dueAtStr)) {
        rowErrors.push(`预约回访时间格式无效: ${dueAtStr}`);
      }

      if (processedOrderNos.has(orderNo)) {
        rowErrors.push(`CSV 内存在重复工单号: ${orderNo}`);
      }
      if (orderNo) processedOrderNos.add(orderNo);

      let orderId: number = 0;
      if (orderNo && rowErrors.length === 0) {
        const order = query<{ id: number; status: string }>(
          'SELECT id, status FROM work_orders WHERE order_no = ?',
          [orderNo]
        );
        if (order.length === 0) {
          rowErrors.push(`工单不存在: ${orderNo}`);
        } else {
          orderId = order[0].id;
          if (order[0].status !== 'completed') {
            rowErrors.push(`工单 ${orderNo} 状态为 ${order[0].status}，只有已完成工单才能回访`);
          }

          const existingVisit = query<{ id: number }>(
            `SELECT id FROM return_visits WHERE order_id = ? AND status IN ('pending', 'in_progress')`,
            [orderId]
          );
          if (existingVisit.length > 0) {
            rowErrors.push(`工单 ${orderNo} 已有未完成的回访任务 (ID: ${existingVisit[0].id})`);
          }
        }
      }

      if (rowErrors.length > 0) {
        result.failed++;
        result.errors.push({ row, reason: rowErrors.join('; '), data: line });
        continue;
      }

      validRows.push({
        orderId,
        templateId,
        dueAt: new Date(dueAtStr).toISOString(),
        orderNo,
      });
    }

    const insertedIds: number[] = [];

    try {
      const timeoutHours = getConfigInt('visit_timeout_hours', 24);
      const imageRequired = getConfigInt('appeal_image_required', 0);

      for (const v of validRows) {
        const existingVisit = query<{ id: number }>(
          `SELECT id FROM return_visits WHERE order_id = ? AND status IN ('pending', 'in_progress')`,
          [v.orderId]
        );
        if (existingVisit.length > 0) {
          result.failed++;
          result.errors.push({ row: 0, reason: `导入时检测到工单 ${v.orderNo} 已有未完成回访`, data: '' });
          continue;
        }

        const dueAt = v.dueAt || new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

        const id = runAndGetId(
          `INSERT INTO return_visits
           (order_id, template_id, status, image_required, timeout_hours, initiator_id, initiator_name, handler_id, handler_name, due_at)
           VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
          [v.orderId, v.templateId, imageRequired, timeoutHours, operatorId, operatorName, operatorId, operatorName, dueAt]
        );
        if (id > 0) {
          insertedIds.push(id);
          result.success++;

          run(
            `INSERT INTO return_visit_histories (visit_id, action, operator_id, operator_name, remark)
             VALUES (?, 'created', ?, ?, '批量导入创建回访任务')`,
            [id, operatorId, operatorName]
          );
        }
      }
    } catch (e: any) {
      for (const rid of insertedIds) {
        run('DELETE FROM return_visits WHERE id = ?', [rid]);
        run('DELETE FROM return_visit_histories WHERE visit_id = ?', [rid]);
      }
      result.failed += validRows.length - result.success;
      result.success = 0;
      result.errors.push({ row: 0, reason: `导入失败，已回滚: ${e.message}`, data: '' });
    }

    if (result.success > 0) {
      logOperation('import_success', null, 'visit_import', operatorId, operatorName,
        `导入回访名单成功 ${result.success} 条`);
    }
    if (result.failed > 0) {
      logOperation('import_failure', null, 'visit_import', operatorId, operatorName,
        `导入回访名单失败 ${result.failed} 条: ${result.errors.map(e => `行${e.row}:${e.reason}`).slice(0, 5).join('; ')}`);
    }

    return result;
  }

  static exportVisitsCsv(filters?: { status?: ReturnVisitStatus }): string {
    const visits = this.getVisits(filters);

    const statusLabels: Record<string, string> = {
      pending: '待处理',
      in_progress: '处理中',
      completed: '已完成',
      timeout: '已超时',
      cancelled: '已取消',
    };
    const resultLabels: Record<string, string> = {
      satisfied: '满意',
      dissatisfied: '不满意',
      no_answer: '无人接听',
      invalid_number: '号码无效',
      refused: '拒绝回访',
    };

    const headers = ['回访ID', '工单号', '客户姓名', '客户电话', '客户地址', '服务类型',
      '回访模板', '状态', '回访结果', '备注', '是否需要图片', '图片链接',
      '发起人', '处理人', '发起时间', '截止时间', '完成时间'];

    const rows = visits.map(v => [
      v.id,
      v.order_no || '',
      v.customer_name || '',
      v.customer_phone || '',
      v.customer_address || '',
      v.service_type || '',
      v.template_name || '',
      statusLabels[v.status] || v.status,
      v.result ? (resultLabels[v.result] || v.result) : '',
      v.remark || '',
      v.image_required === 1 ? '是' : '否',
      v.image_url || '',
      v.initiator_name,
      v.handler_name || '',
      v.initiated_at,
      v.due_at,
      v.completed_at || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(this.escapeCsv).join(','))
      .join('\n');

    logOperation('export_result', null, 'visit_export', 0, 'system', `导出回访记录 ${visits.length} 条`);

    return '\ufeff' + csv;
  }

  static exportAppealsCsv(filters?: { status?: AppealStatus }): string {
    const appeals = this.getAppeals(filters);

    const statusLabels: Record<string, string> = {
      pending: '待受理',
      accepted: '已受理',
      rejected: '已驳回',
      reassigned: '已转派',
      resolved: '已解决',
      withdrawn: '已撤回',
    };

    const headers = ['申诉ID', '回访ID', '工单号', '客户姓名', '申诉分类', '状态',
      '申诉理由', '是否需要图片', '图片链接', '提交人', '处理人', '处理备注',
      '提交时间', '截止时间', '处理时间'];

    const rows = appeals.map(a => [
      a.id,
      a.visit_id,
      a.order_no || '',
      a.customer_name || '',
      a.category_name || '',
      statusLabels[a.status] || a.status,
      a.reason,
      a.image_required === 1 ? '是' : '否',
      a.image_url || '',
      a.submitter_name,
      a.handler_name || '',
      a.handle_remark || '',
      a.submitted_at,
      a.due_at,
      a.handled_at || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(this.escapeCsv).join(','))
      .join('\n');

    logOperation('export_result', null, 'appeal_export', 0, 'system', `导出申诉记录 ${appeals.length} 条`);

    return '\ufeff' + csv;
  }
}
