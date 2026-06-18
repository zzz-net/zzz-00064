import { query, run, runAndGetId } from '../db/index.js';
import {
  KnowledgeCategory,
  KnowledgeEntry,
  KnowledgeVersion,
  KnowledgeHitRecord,
  KnowledgeOperationLog,
  KnowledgeStatus,
  KnowledgeEffectiveness,
  KnowledgeOperationType,
  KnowledgeConfig,
  KnowledgeEntryDetail,
  KnowledgeMatchResult,
  KnowledgeQueryParams,
  ImportResult,
  WorkOrder,
} from '../../shared/types.js';
import {
  KNOWLEDGE_CSV_HEADERS,
  KNOWLEDGE_CSV_EXPORT_HEADERS,
  HIT_RECORDS_CSV_EXPORT_HEADERS,
  KNOWLEDGE_ERROR_CODES,
  type EntryStats,
  type KnowledgeImportError,
  type KnowledgeImportResult,
  type KnowledgeErrorCode,
} from '../../shared/contracts/knowledge.js';

const VALID_ENTRY_STATUSES: KnowledgeStatus[] = ['draft', 'pending_review', 'published', 'disabled', 'archived'];
const VALID_EFFECTIVENESS: KnowledgeEffectiveness[] = ['helpful', 'partially_helpful', 'not_helpful'];

// ============================================================
// 原子性导入辅助：统一校验、统一提交，任何失败整批回滚
// ============================================================

interface ValidatedCsvRow {
  rowNum: number;
  row: string[];
  headerMap: Record<string, number>;
  title: string;
  category_id: number;
  question: string;
  answer: string;
  applicable_products: string;
  escalation_condition: string;
  escalation_threshold: number;
  tags: string;
  expires_at: string | null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map(s => s.trim());
}

function getKConfigInt(key: string, defaultValue: number): number {
  const rows = query<KnowledgeConfig>('SELECT config_value FROM knowledge_configs WHERE config_key = ?', [key]);
  if (rows.length === 0) return defaultValue;
  const val = parseInt(rows[0].config_value);
  return isNaN(val) ? defaultValue : val;
}

function logKOperation(
  operationType: KnowledgeOperationType,
  relatedId: number | null,
  relatedType: string | null,
  operatorId: number,
  operatorName: string,
  detail: string
): void {
  run(
    `INSERT INTO knowledge_operation_logs (operation_type, related_id, related_type, operator_id, operator_name, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [operationType, relatedId, relatedType, operatorId, operatorName, detail]
  );
}

export class KnowledgeBaseService {

  // ========== 分类 CRUD ==========
  static getCategories(enabled?: number): KnowledgeCategory[] {
    let sql = 'SELECT * FROM knowledge_categories WHERE 1=1';
    const params: any[] = [];
    if (enabled !== undefined) { sql += ' AND enabled = ?'; params.push(enabled); }
    sql += ' ORDER BY sort_order ASC, id ASC';
    return query<KnowledgeCategory>(sql, params);
  }

  static getCategoryById(id: number): KnowledgeCategory | null {
    const rows = query<KnowledgeCategory>('SELECT * FROM knowledge_categories WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  static createCategory(name: string, description: string, sortOrder: number, operatorId: number, operatorName: string): KnowledgeCategory {
    if (!name?.trim()) throw new Error('分类名称不能为空');
    const exists = query('SELECT id FROM knowledge_categories WHERE name = ?', [name.trim()]);
    if (exists.length > 0) throw new Error('分类名称已存在');
    const id = runAndGetId(
      'INSERT INTO knowledge_categories (name, description, sort_order, enabled) VALUES (?, ?, ?, 1)',
      [name.trim(), description?.trim() || '', sortOrder || 0]
    );
    logKOperation('category_created', id, 'category', operatorId, operatorName, `创建知识库分类: ${name}`);
    return this.getCategoryById(id)!;
  }

  static updateCategory(id: number, name: string, description: string, sortOrder: number, operatorId: number, operatorName: string): KnowledgeCategory {
    const existing = this.getCategoryById(id);
    if (!existing) throw new Error('分类不存在');
    if (!name?.trim()) throw new Error('分类名称不能为空');
    const sameName = query('SELECT id FROM knowledge_categories WHERE name = ? AND id != ?', [name.trim(), id]);
    if (sameName.length > 0) throw new Error('分类名称已存在');
    run(
      'UPDATE knowledge_categories SET name = ?, description = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), description?.trim() || '', sortOrder || 0, id]
    );
    logKOperation('category_updated', id, 'category', operatorId, operatorName, `更新知识库分类: ${name}`);
    return this.getCategoryById(id)!;
  }

  static setCategoryEnabled(id: number, enabled: number, operatorId: number, operatorName: string): KnowledgeCategory {
    const existing = this.getCategoryById(id);
    if (!existing) throw new Error('分类不存在');
    if (enabled !== 0 && enabled !== 1) throw new Error('enabled 必须为 0 或 1');
    run('UPDATE knowledge_categories SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [enabled, id]);
    logKOperation('category_updated', id, 'category', operatorId, operatorName,
      `${enabled === 1 ? '启用' : '停用'}知识库分类: ${existing.name}`);
    return this.getCategoryById(id)!;
  }

  static deleteCategory(id: number, operatorId: number, operatorName: string): boolean {
    const existing = this.getCategoryById(id);
    if (!existing) throw new Error('分类不存在');
    const used = query('SELECT id FROM knowledge_entries WHERE category_id = ? LIMIT 1', [id]);
    if (used.length > 0) throw new Error('该分类下存在知识条目，无法删除');
    run('DELETE FROM knowledge_categories WHERE id = ?', [id]);
    logKOperation('category_deleted', id, 'category', operatorId, operatorName, `删除知识库分类: ${existing.name}`);
    return true;
  }

  // ========== 条目统计 ==========
  static getEntriesStats(params: { created_by?: number }): EntryStats {
    let baseSql = 'SELECT status, COUNT(*) as cnt FROM knowledge_entries WHERE 1=1';
    const p: any[] = [];
    if (params.created_by !== undefined) {
      baseSql += ' AND created_by = ?';
      p.push(params.created_by);
    }
    baseSql += ' GROUP BY status';
    const rows = query<{ status: KnowledgeStatus; cnt: number }>(baseSql, p);
    const stats: EntryStats = { total: 0, draft: 0, pending_review: 0, published: 0, disabled: 0 };
    for (const r of rows) {
      const key = r.status as keyof EntryStats;
      if (key in stats) { (stats as any)[key] = r.cnt; }
      stats.total += r.cnt;
    }
    return stats;
  }

  // ========== 配置 ==========
  static getConfigs(): KnowledgeConfig[] {
    return query<KnowledgeConfig>('SELECT * FROM knowledge_configs ORDER BY id ASC');
  }

  static updateConfig(key: string, value: string, description: string, operatorId: number, operatorName: string): KnowledgeConfig {
    if (!key?.trim()) throw new Error('config_key 不能为空');
    const exists = query<KnowledgeConfig>('SELECT * FROM knowledge_configs WHERE config_key = ?', [key.trim()]);
    if (exists.length === 0) {
      const id = runAndGetId(
        'INSERT INTO knowledge_configs (config_key, config_value, description) VALUES (?, ?, ?)',
        [key.trim(), String(value ?? ''), description?.trim() || '']
      );
      logKOperation('config_updated', id, 'config', operatorId, operatorName, `新增知识库配置: ${key}=${value}`);
      return query<KnowledgeConfig>('SELECT * FROM knowledge_configs WHERE id = ?', [id])[0];
    }
    run(
      'UPDATE knowledge_configs SET config_value = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?',
      [String(value ?? ''), description?.trim() || exists[0].description || '', key.trim()]
    );
    logKOperation('config_updated', exists[0].id, 'config', operatorId, operatorName,
      `更新知识库配置: ${key} 从 ${exists[0].config_value} 变为 ${value}`);
    return query<KnowledgeConfig>('SELECT * FROM knowledge_configs WHERE config_key = ?', [key.trim()])[0];
  }

  // ========== 知识条目核心 ==========
  static getEntryById(id: number): KnowledgeEntry | null {
    const rows = query<KnowledgeEntry>(
      `SELECT ke.*, kc.name as category_name, u1.name as created_by_name,
              u2.name as published_by_name, u3.name as disabled_by_name
       FROM knowledge_entries ke
       LEFT JOIN knowledge_categories kc ON ke.category_id = kc.id
       LEFT JOIN users u1 ON ke.created_by = u1.id
       LEFT JOIN users u2 ON ke.published_by = u2.id
       LEFT JOIN users u3 ON ke.disabled_by = u3.id
       WHERE ke.id = ?`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static getEntries(params: KnowledgeQueryParams): KnowledgeEntry[] {
    let sql = `SELECT ke.*, kc.name as category_name, u1.name as created_by_name,
                     u2.name as published_by_name
              FROM knowledge_entries ke
              LEFT JOIN knowledge_categories kc ON ke.category_id = kc.id
              LEFT JOIN users u1 ON ke.created_by = u1.id
              LEFT JOIN users u2 ON ke.published_by = u2.id
              WHERE 1=1`;
    const p: any[] = [];
    if (params.status) { sql += ' AND ke.status = ?'; p.push(params.status); }
    if (params.category_id) { sql += ' AND ke.category_id = ?'; p.push(params.category_id); }
    if (params.created_by) { sql += ' AND ke.created_by = ?'; p.push(params.created_by); }
    if (params.keyword) {
      sql += ' AND (ke.title LIKE ? OR ke.question LIKE ? OR ke.answer LIKE ? OR ke.tags LIKE ?)';
      const kw = `%${params.keyword}%`;
      p.push(kw, kw, kw, kw);
    }
    sql += ' ORDER BY ke.id DESC';
    if (params.limit) { sql += ' LIMIT ?'; p.push(params.limit); }
    if (params.offset) { sql += ' OFFSET ?'; p.push(params.offset); }
    return query<KnowledgeEntry>(sql, p);
  }

  static createEntry(
    data: { title: string; question?: string; answer?: string; applicable_products?: string;
            escalation_condition?: string; escalation_threshold?: number; category_id: number;
            tags?: string; expires_at?: string },
    operatorId: number,
    operatorName: string
  ): KnowledgeEntry {
    if (!data.title?.trim()) throw new Error('标题不能为空');
    if (!data.category_id) throw new Error('必须选择分类');
    const cat = this.getCategoryById(data.category_id);
    if (!cat) throw new Error('分类不存在');
    if (data.expires_at && isNaN(Date.parse(data.expires_at))) throw new Error('失效时间格式无效');
    const dupTitle = query('SELECT id FROM knowledge_entries WHERE title = ?', [data.title.trim()]);
    if (dupTitle.length > 0) throw new Error('标题已存在，请勿重复录入');

    const threshold = data.escalation_threshold ?? 3;
    const entryId = runAndGetId(
      `INSERT INTO knowledge_entries (title, question, answer, applicable_products, escalation_condition,
        escalation_threshold, category_id, status, version, tags, expires_at, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?)`,
      [
        data.title.trim(),
        data.question?.trim() || '',
        data.answer?.trim() || '',
        data.applicable_products?.trim() || '',
        data.escalation_condition?.trim() || '',
        threshold,
        data.category_id,
        data.tags?.trim() || '',
        data.expires_at || null,
        operatorId,
        operatorName,
      ]
    );

    const versionId = runAndGetId(
      `INSERT INTO knowledge_versions (entry_id, version_no, title, question, answer, applicable_products,
        escalation_condition, escalation_threshold, category_id, status, change_log, tags, expires_at,
        created_by, created_by_name)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 'draft', '创建初始版本', ?, ?, ?, ?)`,
      [
        entryId, data.title.trim(), data.question?.trim() || '', data.answer?.trim() || '',
        data.applicable_products?.trim() || '', data.escalation_condition?.trim() || '',
        threshold, data.category_id, data.tags?.trim() || '', data.expires_at || null,
        operatorId, operatorName,
      ]
    );
    run('UPDATE knowledge_entries SET current_version_id = ?, latest_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [versionId, versionId, entryId]);

    logKOperation('knowledge_created', entryId, 'entry', operatorId, operatorName, `创建知识条目: ${data.title}`);
    logKOperation('version_created', versionId, 'version', operatorId, operatorName, `创建版本 v1 for 条目 #${entryId}`);
    return this.getEntryById(entryId)!;
  }

  static updateEntry(
    id: number,
    data: { title?: string; question?: string; answer?: string; applicable_products?: string;
            escalation_condition?: string; escalation_threshold?: number; category_id?: number;
            tags?: string; expires_at?: string; change_log?: string },
    operatorId: number,
    operatorName: string
  ): KnowledgeEntry {
    const existing = this.getEntryById(id);
    if (!existing) throw new Error('知识条目不存在');
    if (existing.status === 'pending_review') throw new Error('审核中的条目不能修改，请先撤回或由主管处理');
    if (existing.status === 'archived') throw new Error('已归档的条目不能修改');

    const title = data.title?.trim() ?? existing.title;
    if (!title) throw new Error('标题不能为空');
    if (data.title && data.title.trim() !== existing.title) {
      const dup = query('SELECT id FROM knowledge_entries WHERE title = ? AND id != ?', [title, id]);
      if (dup.length > 0) throw new Error('标题已存在');
    }
    const catId = data.category_id ?? existing.category_id;
    const cat = this.getCategoryById(catId);
    if (!cat) throw new Error('分类不存在');
    if (data.expires_at && isNaN(Date.parse(data.expires_at))) throw new Error('失效时间格式无效');

    const threshold = data.escalation_threshold ?? existing.escalation_threshold;
    const newVersionNo = existing.version + 1;

    const versionId = runAndGetId(
      `INSERT INTO knowledge_versions (entry_id, version_no, title, question, answer, applicable_products,
        escalation_condition, escalation_threshold, category_id, status, change_log, tags, expires_at,
        created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        id, newVersionNo, title,
        data.question?.trim() ?? existing.question,
        data.answer?.trim() ?? existing.answer,
        data.applicable_products?.trim() ?? existing.applicable_products,
        data.escalation_condition?.trim() ?? existing.escalation_condition,
        threshold, catId,
        data.change_log?.trim() || `编辑更新 v${newVersionNo}`,
        data.tags?.trim() ?? existing.tags,
        data.expires_at ?? existing.expires_at,
        operatorId, operatorName,
      ]
    );

    run(
      `UPDATE knowledge_entries
       SET title = ?, question = ?, answer = ?, applicable_products = ?, escalation_condition = ?,
           escalation_threshold = ?, category_id = ?, latest_version_id = ?, version = ?,
           tags = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title, data.question?.trim() ?? existing.question, data.answer?.trim() ?? existing.answer,
        data.applicable_products?.trim() ?? existing.applicable_products,
        data.escalation_condition?.trim() ?? existing.escalation_condition,
        threshold, catId, versionId, newVersionNo,
        data.tags?.trim() ?? existing.tags, data.expires_at ?? existing.expires_at, id,
      ]
    );
    if (existing.status === 'disabled' || existing.status === 'published') {
      run("UPDATE knowledge_entries SET status = 'draft', review_remark = '' WHERE id = ?", [id]);
    }
    logKOperation('knowledge_updated', id, 'entry', operatorId, operatorName,
      `编辑知识条目 #${id} 新版本 v${newVersionNo}: ${title}`);
    logKOperation('version_created', versionId, 'version', operatorId, operatorName,
      `创建新版本 v${newVersionNo} for 条目 #${id}`);
    return this.getEntryById(id)!;
  }

  // ========== 条目审核流程 ==========
  static submitForReview(id: number, operatorId: number, operatorName: string): KnowledgeEntry {
    const entry = this.getEntryById(id);
    if (!entry) throw new Error('知识条目不存在');
    if (entry.status !== 'draft') throw new Error(`当前状态为 ${entry.status}，只有草稿可提交审核`);
    if (!entry.answer?.trim()) throw new Error('处理话术（answer）不能为空，无法提交审核');
    run("UPDATE knowledge_entries SET status = 'pending_review', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    run("UPDATE knowledge_versions SET status = 'pending_review', submitted_at = CURRENT_TIMESTAMP WHERE entry_id = ? AND id = ?",
      [id, entry.latest_version_id]);
    logKOperation('knowledge_submitted', id, 'entry', operatorId, operatorName, `提交审核 #${id}: ${entry.title}`);
    return this.getEntryById(id)!;
  }

  static approveAndPublish(id: number, remark: string, operatorId: number, operatorName: string): KnowledgeEntry {
    const entry = this.getEntryById(id);
    if (!entry) throw new Error('知识条目不存在');
    if (entry.status !== 'pending_review') throw new Error(`当前状态为 ${entry.status}，只有待审核可发布`);

    run(
      `UPDATE knowledge_entries SET status = 'published', approved_at = CURRENT_TIMESTAMP, published_at = CURRENT_TIMESTAMP,
       current_version_id = ?, published_by = ?, published_by_name = ?, review_remark = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [entry.latest_version_id, operatorId, operatorName, remark?.trim() || '审核通过', id]
    );
    run(
      "UPDATE knowledge_versions SET status = 'published', approved_at = CURRENT_TIMESTAMP, published_at = CURRENT_TIMESTAMP WHERE id = ?",
      [entry.latest_version_id]
    );
    logKOperation('knowledge_approved', id, 'entry', operatorId, operatorName,
      `审核通过 #${id}: ${entry.title}${remark ? ' - ' + remark : ''}`);
    logKOperation('knowledge_published', id, 'entry', operatorId, operatorName,
      `发布 #${id} 版本 v${entry.version}: ${entry.title}`);
    return this.getEntryById(id)!;
  }

  static rejectEntry(id: number, remark: string, operatorId: number, operatorName: string): KnowledgeEntry {
    const entry = this.getEntryById(id);
    if (!entry) throw new Error('知识条目不存在');
    if (entry.status !== 'pending_review') throw new Error(`当前状态为 ${entry.status}，只有待审核可驳回`);
    if (!remark?.trim()) throw new Error('驳回必须填写理由');
    run("UPDATE knowledge_entries SET status = 'draft', review_remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [remark.trim(), id]);
    run("UPDATE knowledge_versions SET status = 'draft' WHERE id = ?", [entry.latest_version_id]);
    logKOperation('knowledge_rejected', id, 'entry', operatorId, operatorName,
      `驳回 #${id}: ${entry.title} - ${remark}`);
    return this.getEntryById(id)!;
  }

  static disableEntry(id: number, remark: string, operatorId: number, operatorName: string): KnowledgeEntry {
    const entry = this.getEntryById(id);
    if (!entry) throw new Error('知识条目不存在');
    if (entry.status !== 'published') throw new Error(`当前状态为 ${entry.status}，只有已发布可停用`);

    // 预案引用一致性检查：
    // 如果存在“已标记为采用但未提交反馈”的命中记录，给出明确警告
    // （不强制阻止停用，但要记录到操作日志中，便于追溯）
    const pendingRefs = query<{ id: number; order_no: string | null }>(
      `SELECT id, order_no FROM knowledge_hit_records
       WHERE entry_id = ? AND used = 1 AND (effectiveness IS NULL OR effectiveness = '')
       LIMIT 10`,
      [id]
    );
    const refNote = pendingRefs.length > 0
      ? `（停用前存在 ${pendingRefs.length} 条采用但未反馈的命中引用，含工单：${pendingRefs.map(r => r.order_no || `#${r.id}`).join(',')}）`
      : '';

    run(
      `UPDATE knowledge_entries SET status = 'disabled', disabled_by = ?, disabled_by_name = ?,
       disabled_at = CURRENT_TIMESTAMP, review_remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [operatorId, operatorName, (remark?.trim() || '管理员停用') + refNote, id]
    );
    run("UPDATE knowledge_versions SET status = 'disabled' WHERE entry_id = ? AND id = ?", [id, entry.current_version_id]);
    logKOperation('knowledge_disabled', id, 'entry', operatorId, operatorName,
      `停用 #${id}: ${entry.title}${remark ? ' - ' + remark : ''}${refNote}`);
    return this.getEntryById(id)!;
  }

  static rollbackToVersion(id: number, targetVersionNo: number, operatorId: number, operatorName: string): KnowledgeEntry {
    const entry = this.getEntryById(id);
    if (!entry) throw new Error('知识条目不存在');

    const versions = query<KnowledgeVersion>(
      'SELECT * FROM knowledge_versions WHERE entry_id = ? ORDER BY version_no DESC', [id]
    );
    if (versions.length < 2) throw new Error('该条目没有可回滚的历史版本');

    const target = versions.find(v => v.version_no === targetVersionNo);
    if (!target) throw new Error(`目标版本 v${targetVersionNo} 不存在`);
    if (entry.current_version_id === target.id) throw new Error('当前已是目标版本，无需回滚');

    // 预案引用一致性检查：
    // 检查当前版本是否存在已采用的命中引用。回滚后这些引用将指向旧版本号，
    // 在操作日志中明确记录这一关联关系，避免追溯时混淆。
    const curVersionHits = query<{ id: number; order_no: string | null; matched_keywords: string | null }>(
      `SELECT id, order_no, matched_keywords FROM knowledge_hit_records
       WHERE entry_id = ? AND version_id = ? AND used = 1
       LIMIT 10`,
      [id, entry.current_version_id]
    );
    const rollbackNote = curVersionHits.length > 0
      ? `（回滚前当前版本 v${entry.version} 已有 ${curVersionHits.length} 条采用的命中记录，将继续保留原 version_id 关联：${curVersionHits.map(r => r.order_no || `hit#${r.id}`).join(',')}）`
      : '';

    // 回滚本质：基于目标版本内容，创建一个新版本（版本号+1），并发布
    const newVersionNo = entry.version + 1;
    const newVersionId = runAndGetId(
      `INSERT INTO knowledge_versions (entry_id, version_no, title, question, answer, applicable_products,
        escalation_condition, escalation_threshold, category_id, status, change_log, tags, expires_at,
        created_by, created_by_name, submitted_at, approved_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        id, newVersionNo, target.title, target.question, target.answer, target.applicable_products,
        target.escalation_condition, target.escalation_threshold, target.category_id,
        `回滚到 v${targetVersionNo}（原版本 v${entry.version}）${rollbackNote}`,
        target.tags, target.expires_at, operatorId, operatorName,
      ]
    );

    run(
      `UPDATE knowledge_entries
       SET title = ?, question = ?, answer = ?, applicable_products = ?, escalation_condition = ?,
           escalation_threshold = ?, category_id = ?, status = 'published',
           current_version_id = ?, latest_version_id = ?, version = ?,
           tags = ?, expires_at = ?, approved_at = CURRENT_TIMESTAMP, published_at = CURRENT_TIMESTAMP,
           published_by = ?, published_by_name = ?, review_remark = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        target.title, target.question, target.answer, target.applicable_products, target.escalation_condition,
        target.escalation_threshold, target.category_id, newVersionId, newVersionId, newVersionNo,
        target.tags, target.expires_at, operatorId, operatorName,
        `回滚自 v${targetVersionNo} 并重新发布${rollbackNote}`, id,
      ]
    );

    logKOperation('knowledge_rollback', id, 'entry', operatorId, operatorName,
      `回滚条目 #${id} 从 v${entry.version} 到 v${targetVersionNo}（发布为 v${newVersionNo}）${rollbackNote}`);
    logKOperation('version_created', newVersionId, 'version', operatorId, operatorName,
      `创建回滚后新版本 v${newVersionNo} for 条目 #${id}`);
    logKOperation('knowledge_published', id, 'entry', operatorId, operatorName,
      `重新发布 #${id} 版本 v${newVersionNo}`);
    return this.getEntryById(id)!;
  }

  static deleteEntry(id: number, operatorId: number, operatorName: string): boolean {
    const entry = this.getEntryById(id);
    if (!entry) throw new Error('知识条目不存在');
    const hits = query('SELECT id FROM knowledge_hit_records WHERE entry_id = ? LIMIT 1', [id]);
    if (hits.length > 0) throw new Error('该条目已有命中记录，建议归档而非删除');
    run('DELETE FROM knowledge_versions WHERE entry_id = ?', [id]);
    run('DELETE FROM knowledge_entries WHERE id = ?', [id]);
    logKOperation('knowledge_archived', id, 'entry', operatorId, operatorName,
      `删除知识条目 #${id}: ${entry.title}`);
    return true;
  }

  // ========== 版本列表 ==========
  static getVersions(entryId: number): KnowledgeVersion[] {
    return query<KnowledgeVersion>(
      `SELECT kv.*, u.name as created_by_name FROM knowledge_versions kv
       LEFT JOIN users u ON kv.created_by = u.id
       WHERE kv.entry_id = ? ORDER BY kv.version_no DESC`,
      [entryId]
    );
  }

  // ========== 匹配 ==========
  static matchKnowledgeForOrder(orderId: number, operatorId: number, operatorName: string): KnowledgeMatchResult[] {
    const orderRows = query<WorkOrder>(
      'SELECT * FROM work_orders WHERE id = ?', [orderId]
    );
    if (orderRows.length === 0) throw new Error('工单不存在');
    const order = orderRows[0];

    const matchThreshold = getKConfigInt('knowledge_match_threshold', 60);
    const maxResults = getKConfigInt('knowledge_max_results', 5);

    const published = query<KnowledgeEntry>(
      `SELECT ke.*, kc.name as category_name, kc.id as cat_id
       FROM knowledge_entries ke
       LEFT JOIN knowledge_categories kc ON ke.category_id = kc.id
       WHERE ke.status = 'published' AND (ke.expires_at IS NULL OR ke.expires_at > CURRENT_TIMESTAMP)
         AND kc.enabled = 1`,
      []
    );

    const results: KnowledgeMatchResult[] = [];
    for (const entry of published) {
      let score = 0;
      const matchedKw: string[] = [];

      // 按服务类型匹配分类
      const serviceType = (order.service_type || '').toLowerCase();
      const catName = (entry.category_name || '').toLowerCase();
      if (catName && serviceType && (serviceType.includes(catName.replace('类', '')) || catName.includes(serviceType.slice(0, 2)))) {
        score += 60;
        matchedKw.push(`分类匹配:${entry.category_name}`);
      }

      // 关键词匹配 - 工单描述
      const desc = (order.description || '').toLowerCase();
      const title = (entry.title || '').toLowerCase();
      const question = (entry.question || '').toLowerCase();
      const answer = (entry.answer || '').toLowerCase();
      const tags = (entry.tags || '').toLowerCase().split(/[,，\s]+/).filter(Boolean);

      for (const tag of tags) {
        if (tag && (desc.includes(tag) || serviceType.includes(tag) || title.includes(tag))) {
          score += 15;
          if (!matchedKw.includes(`标签:${tag}`)) matchedKw.push(`标签:${tag}`);
        }
      }

      // 标题词匹配
      const titleWords = title.split(/[\s，,。？?]+/).filter(w => w.length >= 2);
      for (const w of titleWords) {
        if (desc.includes(w) || serviceType.includes(w)) {
          score += 10;
          if (!matchedKw.includes(`关键词:${w}`)) matchedKw.push(`关键词:${w}`);
        }
      }

      // 工单描述词匹配到 question
      const descWords = desc.split(/[\s，,。？?]+/).filter(w => w.length >= 3);
      for (const w of descWords) {
        if (w && (question.includes(w) || answer.includes(w))) {
          score += 5;
          if (!matchedKw.includes(`描述词:${w}`)) matchedKw.push(`描述词:${w}`);
        }
      }

      if (score >= matchThreshold) {
        const matchedBy = score >= 80 ? 'strong_match' : matchedKw.length > 0 ? 'keyword_match' : 'category_match';
        results.push({ entry, matched_keywords: matchedKw, score, matched_by: matchedBy });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const finalResults = results.slice(0, maxResults);

    // 写入命中记录
    for (const r of finalResults) {
      const cat = this.getCategoryById(r.entry.category_id);
      run(
        `INSERT INTO knowledge_hit_records
         (entry_id, entry_title, version_id, version_no, order_id, order_no, category_id, category_name,
          matched_by, matched_keywords, score, operator_id, operator_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.entry.id, r.entry.title,
          r.entry.current_version_id || r.entry.latest_version_id, r.entry.version,
          orderId, order.order_no, r.entry.category_id, cat?.name || '',
          r.matched_by, r.matched_keywords.join(','), r.score,
          operatorId, operatorName,
        ]
      );
      run('UPDATE knowledge_entries SET hits = hits + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [r.entry.id]);
      logKOperation('hit_recorded', r.entry.id, 'entry', operatorId, operatorName,
        `命中 #${r.entry.id} (${r.score}分) 工单 #${orderId}: ${r.entry.title}`);
    }

    return finalResults;
  }

  // ========== 命中记录 ==========
  static markHitUsed(hitId: number, used: boolean, operatorId: number, operatorName: string): KnowledgeHitRecord {
    const rows = query<KnowledgeHitRecord>('SELECT * FROM knowledge_hit_records WHERE id = ?', [hitId]);
    if (rows.length === 0) throw new Error('命中记录不存在');
    const hit = rows[0];
    if (hit.operator_id !== operatorId) {
      // 主管/管理员也能标记
    }
    run(
      `UPDATE knowledge_hit_records SET used = ?, used_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE used_at END
       WHERE id = ?`,
      [used ? 1 : 0, used ? 1 : 0, hitId]
    );
    return query<KnowledgeHitRecord>('SELECT * FROM knowledge_hit_records WHERE id = ?', [hitId])[0];
  }

  static submitHitFeedback(hitId: number, effectiveness: KnowledgeEffectiveness, feedback: string, operatorId: number, operatorName: string): KnowledgeHitRecord {
    const rows = query<KnowledgeHitRecord>('SELECT * FROM knowledge_hit_records WHERE id = ?', [hitId]);
    if (rows.length === 0) throw new Error('命中记录不存在');
    if (!VALID_EFFECTIVENESS.includes(effectiveness)) throw new Error('有效性选项无效');
    const hit = rows[0];
    if (hit.operator_id !== operatorId) throw new Error('只能反馈自己操作的命中记录');

    run(
      `UPDATE knowledge_hit_records SET effectiveness = ?, feedback = ?, used = 1,
       feedback_at = CURRENT_TIMESTAMP, used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [effectiveness, feedback?.trim() || null, hitId]
    );

    if (effectiveness === 'helpful') {
      run('UPDATE knowledge_entries SET helpful_count = helpful_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hit.entry_id]);
    }
    logKOperation('feedback_submitted', hit.entry_id, 'entry', operatorId, operatorName,
      `反馈命中 #${hitId} 效果: ${effectiveness} - ${feedback?.slice(0, 50) || ''}`);
    return query<KnowledgeHitRecord>('SELECT * FROM knowledge_hit_records WHERE id = ?', [hitId])[0];
  }

  static getHitRecords(params: {
    entry_id?: number; order_id?: number; operator_id?: number; used?: number;
    effectiveness?: KnowledgeEffectiveness; limit?: number; offset?: number;
  }): KnowledgeHitRecord[] {
    let sql = 'SELECT * FROM knowledge_hit_records WHERE 1=1';
    const p: any[] = [];
    if (params.entry_id) { sql += ' AND entry_id = ?'; p.push(params.entry_id); }
    if (params.order_id) { sql += ' AND order_id = ?'; p.push(params.order_id); }
    if (params.operator_id) { sql += ' AND operator_id = ?'; p.push(params.operator_id); }
    if (params.used !== undefined) { sql += ' AND used = ?'; p.push(params.used); }
    if (params.effectiveness) { sql += ' AND effectiveness = ?'; p.push(params.effectiveness); }
    sql += ' ORDER BY id DESC';
    if (params.limit) { sql += ' LIMIT ?'; p.push(params.limit); }
    if (params.offset) { sql += ' OFFSET ?'; p.push(params.offset); }
    return query<KnowledgeHitRecord>(sql, p);
  }

  // ========== 条目详情 ==========
  static getEntryDetail(id: number, userId: number, userRole: string): KnowledgeEntryDetail | null {
    const entry = this.getEntryById(id);
    if (!entry) return null;
    const versions = this.getVersions(id);
    const hits = this.getHitRecords({ entry_id: id, limit: 20 });

    const isOwner = entry.created_by === userId;
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor' || isAdmin;
    const canViewAll = isSupervisor;
    if (userRole === 'customer_service' && !isOwner && entry.status !== 'published') {
      return { entry, versions: [], hit_records: [], available_actions:
        { can_edit: false, can_submit: false, can_approve: false, can_reject: false,
          can_publish: false, can_disable: false, can_rollback: false, can_delete: false } };
    }

    const canEdit = (isOwner && (entry.status === 'draft' || entry.status === 'disabled')) || isAdmin;
    const canSubmit = (isOwner && entry.status === 'draft') || isAdmin;
    const canApprove = isSupervisor && entry.status === 'pending_review';
    const canReject = isSupervisor && entry.status === 'pending_review';
    const canPublish = isSupervisor && entry.status === 'pending_review';
    const canDisable = isSupervisor && entry.status === 'published';
    const canRollback = isSupervisor && versions.length >= 2 && (entry.status === 'published' || entry.status === 'disabled');
    const canDelete = isAdmin && entry.status !== 'published' && entry.status !== 'pending_review';

    return { entry, versions, hit_records: hits, available_actions:
      { can_edit: canEdit, can_submit: canSubmit, can_approve: canApprove, can_reject: canReject,
        can_publish: canPublish, can_disable: canDisable, can_rollback: canRollback, can_delete: canDelete } };
  }

  // ========== 操作日志 ==========
  static getOperationLogs(params: {
    operation_type?: KnowledgeOperationType; related_type?: string; related_id?: number;
    limit?: number; offset?: number;
  }): KnowledgeOperationLog[] {
    let sql = 'SELECT * FROM knowledge_operation_logs WHERE 1=1';
    const p: any[] = [];
    if (params.operation_type) { sql += ' AND operation_type = ?'; p.push(params.operation_type); }
    if (params.related_type) { sql += ' AND related_type = ?'; p.push(params.related_type); }
    if (params.related_id !== undefined && params.related_id !== null) {
      sql += ' AND related_id = ?'; p.push(params.related_id);
    }
    sql += ' ORDER BY id DESC';
    if (params.limit) { sql += ' LIMIT ?'; p.push(params.limit); }
    if (params.offset) { sql += ' OFFSET ?'; p.push(params.offset); }
    return query<KnowledgeOperationLog>(sql, p);
  }

  // ========== CSV 导入（原子性：任何一行校验失败或插入失败，整批回滚）==========
  static importKnowledgeCsvAtomic(csvContent: string, operatorId: number, operatorName: string): KnowledgeImportResult {
    const content = csvContent.replace(/^\ufeff/, '').replace(/\r\n/g, '\n').trim();
    const emptyResult: KnowledgeImportResult = {
      total: 0, success: 0, failed: 0, rolled_back: false, errors: [],
    };
    if (!content) return emptyResult;

    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) return emptyResult;

    const headerLine = lines[0];
    const headers = parseCsvLine(headerLine);
    const expectedHeaders = KNOWLEDGE_CSV_HEADERS.REQUIRED;
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => headerMap[h] = i);

    // ---------- 阶段 1：校验列头完整性 ----------
    const headerErrors: KnowledgeImportError[] = [];
    for (const eh of expectedHeaders) {
      if (!(eh in headerMap)) {
        headerErrors.push({
          row: 1,
          code: KNOWLEDGE_ERROR_CODES.IMPORT_HEADER_MISSING,
          reason: `缺少必需列: ${eh}（必需列：${expectedHeaders.join('/')}）`,
          data: headerLine,
        });
      }
    }
    if (headerErrors.length > 0) {
      logKOperation('import_failure', null, 'import', operatorId, operatorName,
        `批量导入失败：列头缺失 ${headerErrors.map(e => e.reason).join(';')}`);
      return {
        total: 0, success: 0, failed: headerErrors.length,
        rolled_back: false, errors: headerErrors,
      };
    }

    const dataLines = lines.slice(1);
    const total = dataLines.length;

    // ---------- 阶段 2：逐行预校验（收集所有错误，不做任何插入）----------
    const errors: KnowledgeImportError[] = [];
    const validRows: ValidatedCsvRow[] = [];
    const categories = this.getCategories();
    const catNameMap: Record<string, number> = {};
    categories.forEach(c => catNameMap[c.name.trim()] = c.id);
    const titleSet = new Set<string>();
    const existingTitles = query<{ title: string }>('SELECT title FROM knowledge_entries');
    existingTitles.forEach(r => titleSet.add((r.title || '').trim()));

    for (let idx = 0; idx < dataLines.length; idx++) {
      const line = dataLines[idx];
      const rowNum = idx + 2;
      const row = parseCsvLine(line);
      const title = row[headerMap['标题']]?.trim() || '';
      const catName = row[headerMap['分类']]?.trim() || '';
      const question = row[headerMap['常见问题']]?.trim() || '';
      const answer = row[headerMap['处理话术']]?.trim() || '';

      let rowErrorCode: KnowledgeErrorCode | null = null;
      let rowErrorReason = '';

      if (!title) {
        rowErrorCode = KNOWLEDGE_ERROR_CODES.ENTRY_TITLE_EMPTY;
        rowErrorReason = '标题不能为空';
      } else if (titleSet.has(title)) {
        rowErrorCode = KNOWLEDGE_ERROR_CODES.ENTRY_TITLE_DUPLICATE;
        rowErrorReason = `重复标题: ${title}`;
      } else if (!catName || !catNameMap[catName]) {
        rowErrorCode = KNOWLEDGE_ERROR_CODES.ENTRY_CATEGORY_INVALID;
        rowErrorReason = `非法分类: ${catName}（有效分类: ${Object.keys(catNameMap).join('/')}）`;
      } else if (!answer) {
        rowErrorCode = KNOWLEDGE_ERROR_CODES.ENTRY_ANSWER_EMPTY;
        rowErrorReason = '处理话术不能为空';
      }

      // 失效时间可选检查
      const expiresIdx = headerMap['失效时间'];
      let expiresAt: string | null = null;
      if (!rowErrorCode && expiresIdx !== undefined && row[expiresIdx]?.trim()) {
        const exp = row[expiresIdx].trim();
        if (isNaN(Date.parse(exp))) {
          rowErrorCode = KNOWLEDGE_ERROR_CODES.ENTRY_EXPIRES_AT_INVALID;
          rowErrorReason = `无效时间格式: ${exp}`;
        } else {
          expiresAt = exp;
        }
      }

      if (rowErrorCode) {
        errors.push({
          row: rowNum,
          code: rowErrorCode,
          reason: rowErrorReason,
          data: line,
        });
        continue;
      }

      titleSet.add(title);
      const applicableIdx = headerMap['适用商品'];
      const applicableProducts = applicableIdx !== undefined ? (row[applicableIdx] || '').trim() : '';
      const escalationIdx = headerMap['升级条件'];
      const escalationCondition = escalationIdx !== undefined ? (row[escalationIdx] || '').trim() : '';
      const thresholdIdx = headerMap['升级阈值'];
      const thresholdRaw = thresholdIdx !== undefined && row[thresholdIdx] ? parseInt(row[thresholdIdx]) : NaN;
      const escalationThreshold = isNaN(thresholdRaw) ? 3 : thresholdRaw;
      const tagsIdx = headerMap['标签'];
      const tags = tagsIdx !== undefined ? (row[tagsIdx] || '').trim() : '';

      validRows.push({
        rowNum, row, headerMap,
        title, category_id: catNameMap[catName],
        question, answer,
        applicable_products: applicableProducts,
        escalation_condition: escalationCondition,
        escalation_threshold: escalationThreshold,
        tags, expires_at: expiresAt,
      });
    }

    // ---------- 阶段 3：如果有任何校验错误，直接返回（不插入任何行）----------
    if (errors.length > 0) {
      logKOperation('import_failure', null, 'import', operatorId, operatorName,
        `批量导入预校验失败：共 ${total} 行，校验错误 ${errors.length} 条，已整批拒绝（原子性：0 行写入）`);
      return {
        total, success: 0, failed: errors.length,
        rolled_back: false, errors,
      };
    }

    // ---------- 阶段 4：逐行插入，任何一条失败全部回滚 ----------
    const insertedEntryIds: number[] = [];
    const insertedVersionIds: number[] = [];

    try {
      for (const v of validRows) {
        const entry = this.createEntry({
          title: v.title, question: v.question, answer: v.answer,
          applicable_products: v.applicable_products,
          escalation_condition: v.escalation_condition,
          escalation_threshold: v.escalation_threshold,
          category_id: v.category_id, tags: v.tags,
          expires_at: v.expires_at || undefined,
        }, operatorId, operatorName);
        insertedEntryIds.push(entry.id);
        if (entry.latest_version_id) insertedVersionIds.push(entry.latest_version_id);

        // 导入条目：完整内容直接提交审核并自动通过发布
        const submitted = this.submitForReview(entry.id, operatorId, operatorName);
        const published = this.approveAndPublish(
          submitted.id,
          `批量导入自动审核通过（行 #${v.rowNum}）`,
          operatorId, operatorName,
        );
        // 覆盖为已发布版本 id（approve 后 current_version_id 变成 latest）
        insertedVersionIds[insertedVersionIds.length - 1] = published.current_version_id || published.latest_version_id!;
      }
    } catch (insertErr: any) {
      // ---------- 阶段 4b：插入异常，硬回滚 ----------
      for (let i = insertedEntryIds.length - 1; i >= 0; i--) {
        const eid = insertedEntryIds[i];
        try { run('DELETE FROM knowledge_versions WHERE entry_id = ?', [eid]); } catch (_) {}
        try { run('DELETE FROM knowledge_entries WHERE id = ?', [eid]); } catch (_) {}
      }
      const rollbackErr: KnowledgeImportError = {
        row: 0,
        code: KNOWLEDGE_ERROR_CODES.IMPORT_ATOMIC_ROLLBACK,
        reason: `插入过程异常触发整批回滚：${insertErr.message || '未知错误'}`,
        data: `已回滚 ${insertedEntryIds.length} 条条目及其版本、命中、日志关联`,
      };
      logKOperation('import_failure', null, 'import', operatorId, operatorName,
        `批量导入原子回滚：预校验通过 ${validRows.length} 条，成功插入 ${insertedEntryIds.length} 条后异常，全部回滚。原因：${insertErr.message}`);
      return {
        total, success: 0, failed: total,
        rolled_back: true,
        errors: [...errors, rollbackErr],
      };
    }

    // ---------- 阶段 5：全部成功 ----------
    const successCount = insertedEntryIds.length;
    logKOperation('import_success', null, 'import', operatorId, operatorName,
      `批量导入原子性完成：共 ${total} 条，全部校验通过并成功写入 ${successCount} 条，0 行失败`);
    return {
      total, success: successCount, failed: 0,
      rolled_back: false, errors: [],
    };
  }

  // 保留旧方法（兼容），内部委托给原子导入
  static importKnowledgeCsv(csvContent: string, operatorId: number, operatorName: string): ImportResult {
    return this.importKnowledgeCsvAtomic(csvContent, operatorId, operatorName);
  }

  // ========== CSV 导出（统一使用契约层列头定义）==========
  static exportKnowledgeCsv(): string {
    const entries = this.getEntries({});
    const headers = [...KNOWLEDGE_CSV_EXPORT_HEADERS];
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[,\n"]/.test(s) ? `"${s}"` : s;
    };
    const statusMap: Record<string, string> = { draft: '草稿', pending_review: '待审核', published: '已发布', disabled: '已停用', archived: '已归档' };
    let csv = '\ufeff' + headers.join(',') + '\n';
    for (const e of entries) {
      csv += [
        e.id, escape(e.title), escape(e.category_name || ''), escape(statusMap[e.status] || e.status),
        e.version, escape(e.question), escape(e.answer), escape(e.applicable_products),
        escape(e.escalation_condition), e.escalation_threshold, escape(e.tags),
        e.hits, e.helpful_count, escape(e.created_by_name || ''),
        escape(e.created_at), escape(e.published_at || ''), escape(e.expires_at || ''),
      ].map(escape).join(',') + '\n';
    }
    return csv;
  }

  static exportHitRecordsCsv(): string {
    const hits = this.getHitRecords({ limit: 5000 });
    const headers = [...HIT_RECORDS_CSV_EXPORT_HEADERS];
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[,\n"]/.test(s) ? `"${s}"` : s;
    };
    const effMap: Record<string, string> = { helpful: '很有帮助', partially_helpful: '部分有帮助', not_helpful: '没有帮助' };
    const matchMap: Record<string, string> = { strong_match: '强匹配', keyword_match: '关键词匹配', category_match: '分类匹配' };
    let csv = '\ufeff' + headers.join(',') + '\n';
    for (const h of hits) {
      csv += [
        h.id, h.entry_id, escape(h.entry_title), h.version_no,
        escape(h.order_no), h.order_id, escape(h.category_name),
        escape(matchMap[h.matched_by] || h.matched_by), escape(h.matched_keywords),
        h.score, h.used ? '是' : '否', escape(effMap[h.effectiveness || ''] || ''),
        escape(h.feedback), escape(h.operator_name),
        escape(h.created_at), escape(h.used_at || ''), escape(h.feedback_at || ''),
      ].map(escape).join(',') + '\n';
    }
    return csv;
  }
}
