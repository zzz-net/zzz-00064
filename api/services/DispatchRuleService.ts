import { query, run, runAndGetId } from '../db/index.js';
import {
  DispatchRule,
  DispatchRuleType,
  DispatchRuleSeverity,
  RulePrecheckResult,
  RulePrecheckItem,
  RuleOperationLog,
  RuleOperationType,
  ImportResult,
} from '../../shared/types.js';

const VALID_RULE_TYPES: DispatchRuleType[] = ['max_daily_orders', 'min_service_interval', 'required_skill_match'];
const VALID_SEVERITIES: DispatchRuleSeverity[] = ['block', 'warn'];
const VALID_ENABLED = [0, 1];

export class DispatchRuleService {
  static getAll(enabled?: number, type?: DispatchRuleType): DispatchRule[] {
    let sql = 'SELECT * FROM dispatch_rules WHERE 1=1';
    const params: any[] = [];

    if (enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(enabled);
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY id ASC';
    return query<DispatchRule>(sql, params);
  }

  static getById(id: number): DispatchRule | null {
    const rules = query<DispatchRule>('SELECT * FROM dispatch_rules WHERE id = ?', [id]);
    return rules.length > 0 ? rules[0] : null;
  }

  static create(
    name: string,
    type: DispatchRuleType,
    severity: DispatchRuleSeverity,
    value: string,
    description: string,
    operatorId: number,
    operatorName: string
  ): DispatchRule {
    this.validateRule(name, type, severity, value);

    const duplicate = query<DispatchRule>(
      'SELECT id FROM dispatch_rules WHERE type = ? AND value = ?',
      [type, value]
    );
    if (duplicate.length > 0) {
      throw new Error(`同类型同参数的规则已存在 (ID: ${duplicate[0].id})`);
    }

    const id = runAndGetId(
      `INSERT INTO dispatch_rules (name, type, severity, value, enabled, description) VALUES (?, ?, ?, ?, 1, ?)`,
      [name, type, severity, value, description || '']
    );

    this.logOperation('rule_created', id, operatorId, operatorName, `创建规则: ${name} (${type}/${severity}/${value})`);

    return this.getById(id)!;
  }

  static update(
    id: number,
    name: string,
    type: DispatchRuleType,
    severity: DispatchRuleSeverity,
    value: string,
    description: string,
    operatorId: number,
    operatorName: string
  ): DispatchRule {
    const existing = this.getById(id);
    if (!existing) throw new Error('规则不存在');

    this.validateRule(name, type, severity, value);

    const duplicate = query<DispatchRule>(
      'SELECT id FROM dispatch_rules WHERE type = ? AND value = ? AND id != ?',
      [type, value, id]
    );
    if (duplicate.length > 0) {
      throw new Error(`同类型同参数的规则已存在 (ID: ${duplicate[0].id})`);
    }

    run(
      `UPDATE dispatch_rules SET name = ?, type = ?, severity = ?, value = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, type, severity, value, description || '', id]
    );

    this.logOperation('rule_updated', id, operatorId, operatorName, `更新规则: ${name} (${type}/${severity}/${value})`);

    return this.getById(id)!;
  }

  static setEnabled(
    id: number,
    enabled: number,
    operatorId: number,
    operatorName: string
  ): DispatchRule {
    const existing = this.getById(id);
    if (!existing) throw new Error('规则不存在');

    if (enabled !== 0 && enabled !== 1) {
      throw new Error('enabled 必须为 0 或 1');
    }

    run(
      'UPDATE dispatch_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [enabled, id]
    );

    const opType: RuleOperationType = enabled === 1 ? 'rule_enabled' : 'rule_disabled';
    this.logOperation(opType, id, operatorId, operatorName, `${enabled === 1 ? '启用' : '停用'}规则: ${existing.name}`);

    return this.getById(id)!;
  }

  static delete(id: number, operatorId: number, operatorName: string): boolean {
    const existing = this.getById(id);
    if (!existing) throw new Error('规则不存在');

    this.logOperation('rule_deleted', id, operatorId, operatorName, `删除规则: ${existing.name}`);

    const result = run('DELETE FROM dispatch_rules WHERE id = ?', [id]);
    return result > 0;
  }

  static precheck(
    orderId: number,
    technicianId: number,
    serviceType: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
    operatorId: number,
    operatorName: string,
    isForceAssign: boolean = false
  ): RulePrecheckResult {
    const rules = this.getAll(1);
    const items: RulePrecheckItem[] = [];

    for (const rule of rules) {
      const item = this.evaluateRule(rule, orderId, technicianId, serviceType, scheduledStartTime, scheduledEndTime);
      items.push(item);

      if (!item.passed) {
        if (isForceAssign && rule.severity === 'warn') {
          this.logOperation('rule_overridden', rule.id, operatorId, operatorName,
            `规则被覆盖(强制派单): ${rule.name} - ${item.message}`);
        } else if (rule.severity === 'block') {
          this.logOperation('rule_hit', rule.id, operatorId, operatorName,
            `规则拦截: ${rule.name} - ${item.message}`);
        } else {
          this.logOperation('rule_hit', rule.id, operatorId, operatorName,
            `规则提醒: ${rule.name} - ${item.message}`);
        }
      }
    }

    const hasBlock = items.some(i => !i.passed && i.severity === 'block');
    const hasWarnings = items.some(i => !i.passed && i.severity === 'warn');

    let canProceed = !hasBlock;
    if (isForceAssign) {
      canProceed = !hasBlock;
    }

    return {
      can_proceed: canProceed,
      has_warnings: hasWarnings,
      items,
    };
  }

  private static evaluateRule(
    rule: DispatchRule,
    orderId: number,
    technicianId: number,
    serviceType: string,
    scheduledStartTime: string,
    scheduledEndTime: string
  ): RulePrecheckItem {
    const base: RulePrecheckItem = {
      rule_id: rule.id,
      rule_name: rule.name,
      rule_type: rule.type,
      severity: rule.severity,
      passed: true,
      message: '',
    };

    switch (rule.type) {
      case 'max_daily_orders': {
        const maxOrders = parseInt(rule.value);
        if (isNaN(maxOrders) || maxOrders < 1) {
          base.passed = true;
          base.message = '规则参数无效，跳过检查';
          return base;
        }

        const startDate = new Date(scheduledStartTime);
        const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const result = query<{ count: number }>(
          `SELECT COUNT(*) as count FROM work_orders
           WHERE technician_id = ?
           AND status IN ('assigned', 'confirmed', 'in_progress')
           AND scheduled_start_time >= ?
           AND scheduled_start_time < ?`,
          [technicianId, dayStart.toISOString(), dayEnd.toISOString()]
        );

        const currentCount = result[0].count;
        if (currentCount >= maxOrders) {
          base.passed = false;
          base.message = `技师当日工单数已达 ${currentCount}，超过上限 ${maxOrders}`;
        } else {
          base.message = `技师当日工单数 ${currentCount}/${maxOrders}，符合要求`;
        }
        break;
      }

      case 'min_service_interval': {
        const minIntervalMin = parseInt(rule.value);
        if (isNaN(minIntervalMin) || minIntervalMin < 0) {
          base.passed = true;
          base.message = '规则参数无效，跳过检查';
          return base;
        }

        const startTime = new Date(scheduledStartTime);
        const endTime = new Date(scheduledEndTime);
        const bufferMs = minIntervalMin * 60 * 1000;

        const beforeResult = query<{ max_end: string | null }>(
          `SELECT MAX(scheduled_end_time) as max_end FROM work_orders
           WHERE technician_id = ?
           AND status IN ('assigned', 'confirmed', 'in_progress')
           AND scheduled_end_time <= ?
           AND id != ?`,
          [technicianId, startTime.toISOString(), orderId]
        );

        if (beforeResult[0]?.max_end) {
          const lastEnd = new Date(beforeResult[0].max_end);
          const gap = startTime.getTime() - lastEnd.getTime();
          if (gap < bufferMs) {
            base.passed = false;
            base.message = `与前一个工单间隔 ${Math.round(gap / 60000)} 分钟，小于最小间隔 ${minIntervalMin} 分钟`;
            break;
          }
        }

        const afterResult = query<{ min_start: string | null }>(
          `SELECT MIN(scheduled_start_time) as min_start FROM work_orders
           WHERE technician_id = ?
           AND status IN ('assigned', 'confirmed', 'in_progress')
           AND scheduled_start_time >= ?
           AND id != ?`,
          [technicianId, endTime.toISOString(), orderId]
        );

        if (afterResult[0]?.min_start) {
          const nextStart = new Date(afterResult[0].min_start);
          const gap = nextStart.getTime() - endTime.getTime();
          if (gap < bufferMs) {
            base.passed = false;
            base.message = `与后一个工单间隔 ${Math.round(gap / 60000)} 分钟，小于最小间隔 ${minIntervalMin} 分钟`;
            break;
          }
        }

        base.message = `与相邻工单间隔满足最小 ${minIntervalMin} 分钟要求`;
        break;
      }

      case 'required_skill_match': {
        const requiredSkill = rule.value.trim();
        if (!requiredSkill) {
          base.passed = true;
          base.message = '规则参数无效，跳过检查';
          return base;
        }

        const techResult = query<{ skill: string }>(
          'SELECT skill FROM technicians WHERE id = ?',
          [technicianId]
        );

        if (techResult.length === 0) {
          base.passed = false;
          base.message = `技师不存在 (ID: ${technicianId})`;
          break;
        }

        const techSkill = techResult[0].skill || '';
        const techSkills = techSkill.split(/[,，、]/).map(s => s.trim()).filter(Boolean);

        if (!techSkills.includes(requiredSkill)) {
          base.passed = false;
          base.message = `技师技能 [${techSkill}] 不包含必需技能 "${requiredSkill}"`;
        } else {
          base.message = `技师技能包含必需技能 "${requiredSkill}"`;
        }
        break;
      }

      default:
        base.message = '未知规则类型';
    }

    return base;
  }

  static importCsv(
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
    const expectedHeaders = ['规则名称', '规则类型', '严重级别', '参数值', '是否启用', '描述'];
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => { headerMap[h.trim()] = i; });

    for (const eh of expectedHeaders) {
      if (!(eh in headerMap)) {
        return { total: 0, success: 0, failed: 0, errors: [{ row: 1, reason: `缺少必需列: ${eh}`, data: headerLine }] };
      }
    }

    const result: ImportResult = { total: lines.length - 1, success: 0, failed: 0, errors: [] };

    const validRows: { name: string; type: DispatchRuleType; severity: DispatchRuleSeverity; value: string; enabled: number; description: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const fields = this.parseCsvLine(line);
      const name = (fields[headerMap['规则名称']] || '').trim();
      const type = (fields[headerMap['规则类型']] || '').trim();
      const severity = (fields[headerMap['严重级别']] || '').trim();
      const value = (fields[headerMap['参数值']] || '').trim();
      const enabledStr = (fields[headerMap['是否启用']] || '').trim();
      const description = (fields[headerMap['描述']] || '').trim();

      const row = i + 1;
      const errors: string[] = [];

      if (!name) errors.push('规则名称不能为空');

      const typeMap: Record<string, DispatchRuleType> = {
        '技师每日最大工单数': 'max_daily_orders',
        '同服务最小间隔': 'min_service_interval',
        '技能必需匹配': 'required_skill_match',
      };
      const resolvedType = typeMap[type] as DispatchRuleType | undefined;
      if (!resolvedType) {
        if (VALID_RULE_TYPES.includes(type as DispatchRuleType)) {
          errors.push('请使用中文规则类型名称');
        } else {
          errors.push(`无效的规则类型: ${type}`);
        }
      }

      const severityMap: Record<string, DispatchRuleSeverity> = {
        '拦截': 'block',
        '提醒': 'warn',
      };
      const resolvedSeverity = severityMap[severity] as DispatchRuleSeverity | undefined;
      if (!resolvedSeverity) {
        if (VALID_SEVERITIES.includes(severity as DispatchRuleSeverity)) {
          errors.push('请使用中文严重级别名称');
        } else {
          errors.push(`无效的严重级别: ${severity}`);
        }
      }

      if (!value) {
        errors.push('参数值不能为空');
      } else if (resolvedType === 'max_daily_orders') {
        const numVal = parseInt(value);
        if (isNaN(numVal) || numVal < 1) errors.push('技师每日最大工单数必须为正整数');
      } else if (resolvedType === 'min_service_interval') {
        const numVal = parseInt(value);
        if (isNaN(numVal) || numVal < 0) errors.push('最小间隔必须为非负整数(分钟)');
      }

      let enabled: number = 1;
      if (enabledStr === '是' || enabledStr === '1' || enabledStr === 'true') {
        enabled = 1;
      } else if (enabledStr === '否' || enabledStr === '0' || enabledStr === 'false') {
        enabled = 0;
      } else {
        errors.push(`无效的启用状态: ${enabledStr}，应为 是/否`);
      }

      if (errors.length > 0) {
        result.failed++;
        result.errors.push({ row, reason: errors.join('; '), data: line });
        continue;
      }

      const duplicate = query<DispatchRule>(
        'SELECT id FROM dispatch_rules WHERE type = ? AND value = ?',
        [resolvedType!, value]
      );
      if (duplicate.length > 0) {
        result.failed++;
        result.errors.push({ row, reason: `同类型同参数的规则已存在 (ID: ${duplicate[0].id})`, data: line });
        continue;
      }

      validRows.push({
        name,
        type: resolvedType!,
        severity: resolvedSeverity!,
        value,
        enabled,
        description,
      });
    }

    const insertedIds: number[] = [];

    try {
      for (const row of validRows) {
        const existingDuplicate = query<DispatchRule>(
          'SELECT id FROM dispatch_rules WHERE type = ? AND value = ?',
          [row.type, row.value]
        );
        if (existingDuplicate.length > 0) {
          result.failed++;
          result.errors.push({ row: 0, reason: `导入中检测到重复规则: ${row.type}/${row.value}`, data: `${row.name}` });
          continue;
        }

        const id = runAndGetId(
          `INSERT INTO dispatch_rules (name, type, severity, value, enabled, description) VALUES (?, ?, ?, ?, ?, ?)`,
          [row.name, row.type, row.severity, row.value, row.enabled, row.description]
        );
        if (id > 0) {
          insertedIds.push(id);
          result.success++;
        }
      }
    } catch (e: any) {
      for (const rid of insertedIds) {
        run('DELETE FROM dispatch_rules WHERE id = ?', [rid]);
      }
      result.failed += validRows.length - result.success;
      result.success = 0;
      result.errors.push({ row: 0, reason: `导入失败，已回滚: ${e.message}`, data: '' });
    }

    if (result.success > 0) {
      this.logOperation('import_success', null, operatorId, operatorName,
        `导入成功 ${result.success} 条规则`);
    }
    if (result.failed > 0) {
      this.logOperation('import_failure', null, operatorId, operatorName,
        `导入失败 ${result.failed} 条规则: ${result.errors.map(e => `行${e.row}:${e.reason}`).join('; ')}`);
    }

    return result;
  }

  static exportCsv(): string {
    const rules = this.getAll();

    const headers = ['规则名称', '规则类型', '严重级别', '参数值', '是否启用', '描述', '创建时间', '更新时间'];

    const typeLabels: Record<string, string> = {
      max_daily_orders: '技师每日最大工单数',
      min_service_interval: '同服务最小间隔',
      required_skill_match: '技能必需匹配',
    };

    const severityLabels: Record<string, string> = {
      block: '拦截',
      warn: '提醒',
    };

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = rules.map(r => [
      r.name,
      typeLabels[r.type] || r.type,
      severityLabels[r.severity] || r.severity,
      r.value,
      r.enabled === 1 ? '是' : '否',
      r.description,
      r.created_at,
      r.updated_at,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(escapeCsv).join(','))
      .join('\n');

    return '\ufeff' + csv;
  }

  static getOperationLogs(
    operationType?: RuleOperationType,
    ruleId?: number,
    limit?: number,
    offset?: number
  ): RuleOperationLog[] {
    let sql = 'SELECT * FROM rule_operation_logs WHERE 1=1';
    const params: any[] = [];

    if (operationType) {
      sql += ' AND operation_type = ?';
      params.push(operationType);
    }

    if (ruleId) {
      sql += ' AND rule_id = ?';
      params.push(ruleId);
    }

    sql += ' ORDER BY created_at DESC, id DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    if (offset) {
      sql += ' OFFSET ?';
      params.push(offset);
    }

    return query<RuleOperationLog>(sql, params);
  }

  static logOperation(
    operationType: RuleOperationType,
    ruleId: number | null,
    operatorId: number,
    operatorName: string,
    detail: string
  ): void {
    run(
      `INSERT INTO rule_operation_logs (operation_type, rule_id, operator_id, operator_name, detail) VALUES (?, ?, ?, ?, ?)`,
      [operationType, ruleId, operatorId, operatorName, detail]
    );
  }

  private static validateRule(name: string, type: DispatchRuleType, severity: DispatchRuleSeverity, value: string): void {
    if (!name || !name.trim()) throw new Error('规则名称不能为空');
    if (!VALID_RULE_TYPES.includes(type)) throw new Error(`无效的规则类型: ${type}`);
    if (!VALID_SEVERITIES.includes(severity)) throw new Error(`无效的严重级别: ${severity}`);
    if (!value || !value.trim()) throw new Error('参数值不能为空');

    if (type === 'max_daily_orders') {
      const numVal = parseInt(value);
      if (isNaN(numVal) || numVal < 1) throw new Error('技师每日最大工单数必须为正整数');
    }

    if (type === 'min_service_interval') {
      const numVal = parseInt(value);
      if (isNaN(numVal) || numVal < 0) throw new Error('最小间隔必须为非负整数(分钟)');
    }
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
}
