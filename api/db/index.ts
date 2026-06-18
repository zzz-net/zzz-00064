import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../../data/database.db');
const DB_DIR = path.dirname(DB_PATH);

let db: Database | null = null;
let SQL: SqlJsStatic | null = null;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  SQL = await initSqlJs({
    locateFile: (file: string) => path.join(__dirname, '../../node_modules/sql.js/dist', file),
  });

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    migrateDatabase();
  } else {
    db = new SQL.Database();
    createTables();
    seedData();
    saveDatabase();
  }

  return db;
}

export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function createTables(): void {
  if (!db) return;

  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'dispatcher', 'customer_service', 'supervisor')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      skill TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE schedule_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      customer_address TEXT,
      service_type TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'confirmed', 'in_progress', 'completed', 'cancelled')),
      technician_id INTEGER,
      scheduled_start_time DATETIME NOT NULL,
      scheduled_end_time DATETIME NOT NULL,
      actual_start_time DATETIME,
      actual_end_time DATETIME,
      cancel_reason TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES technicians(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE order_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('reassign', 'force_assign', 'overtime')),
      order_id INTEGER NOT NULL,
      applicant_id INTEGER NOT NULL,
      applicant_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      target_technician_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'withdrawn')),
      approver_id INTEGER,
      approver_name TEXT,
      approval_remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME,
      withdrawn_at DATETIME,
      withdraw_reason TEXT,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (applicant_id) REFERENCES users(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (target_technician_id) REFERENCES technicians(id)
    )
  `);

  db.run(`
    CREATE TABLE conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      technician_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('time_overlap', 'overtime')),
      description TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      approval_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (technician_id) REFERENCES technicians(id),
      FOREIGN KEY (approval_id) REFERENCES approvals(id)
    )
  `);

  db.run(`
    CREATE TABLE dispatch_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('max_daily_orders', 'min_service_interval', 'required_skill_match')),
      severity TEXT NOT NULL CHECK(severity IN ('block', 'warn')),
      value TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE rule_operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL CHECK(operation_type IN ('rule_created', 'rule_updated', 'rule_enabled', 'rule_disabled', 'rule_deleted', 'rule_hit', 'rule_overridden', 'import_success', 'import_failure')),
      rule_id INTEGER,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rule_id) REFERENCES dispatch_rules(id) ON DELETE SET NULL,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  db.run('CREATE INDEX idx_dispatch_rules_type ON dispatch_rules(type)');
  db.run('CREATE INDEX idx_dispatch_rules_enabled ON dispatch_rules(enabled)');
  db.run('CREATE INDEX idx_rule_logs_operation ON rule_operation_logs(operation_type)');
  db.run('CREATE INDEX idx_rule_logs_rule ON rule_operation_logs(rule_id)');

  db.run('CREATE INDEX idx_orders_status ON work_orders(status)');
  db.run('CREATE INDEX idx_orders_technician ON work_orders(technician_id)');
  db.run('CREATE INDEX idx_orders_scheduled ON work_orders(scheduled_start_time)');
  db.run('CREATE INDEX idx_histories_order ON order_histories(order_id)');
  db.run('CREATE INDEX idx_approvals_status ON approvals(status)');
  db.run('CREATE INDEX idx_conflicts_resolved ON conflicts(resolved)');

  db.run(`
    CREATE TABLE return_visit_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE appeal_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE after_sale_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE return_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      template_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'timeout', 'cancelled')),
      result TEXT CHECK(result IN ('satisfied', 'dissatisfied', 'no_answer', 'invalid_number', 'refused')),
      remark TEXT,
      image_required INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      timeout_hours INTEGER NOT NULL DEFAULT 24,
      initiator_id INTEGER NOT NULL,
      initiator_name TEXT NOT NULL,
      handler_id INTEGER,
      handler_name TEXT,
      initiated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      due_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES return_visit_templates(id) ON DELETE SET NULL,
      FOREIGN KEY (initiator_id) REFERENCES users(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE return_visit_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visit_id) REFERENCES return_visits(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE appeals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'reassigned', 'resolved', 'withdrawn')),
      reason TEXT NOT NULL,
      image_url TEXT,
      image_required INTEGER NOT NULL DEFAULT 0,
      submitter_id INTEGER NOT NULL,
      submitter_name TEXT NOT NULL,
      handler_id INTEGER,
      handler_name TEXT,
      handle_remark TEXT,
      timeout_hours INTEGER NOT NULL DEFAULT 48,
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      due_at DATETIME NOT NULL,
      handled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visit_id) REFERENCES return_visits(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES appeal_categories(id),
      FOREIGN KEY (submitter_id) REFERENCES users(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE appeal_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appeal_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE after_sale_operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL,
      related_id INTEGER,
      related_type TEXT,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  db.run('CREATE INDEX idx_visits_status ON return_visits(status)');
  db.run('CREATE INDEX idx_visits_order ON return_visits(order_id)');
  db.run('CREATE INDEX idx_visits_initiator ON return_visits(initiator_id)');
  db.run('CREATE INDEX idx_visits_due ON return_visits(due_at)');
  db.run('CREATE INDEX idx_appeals_status ON appeals(status)');
  db.run('CREATE INDEX idx_appeals_order ON appeals(order_id)');
  db.run('CREATE INDEX idx_appeals_submitter ON appeals(submitter_id)');
  db.run('CREATE INDEX idx_appeals_due ON appeals(due_at)');
  db.run('CREATE INDEX idx_as_logs_operation ON after_sale_operation_logs(operation_type)');
  db.run('CREATE INDEX idx_as_logs_related ON after_sale_operation_logs(related_type, related_id)');

  db.run(`
    CREATE TABLE knowledge_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      applicable_products TEXT NOT NULL DEFAULT '',
      escalation_condition TEXT NOT NULL DEFAULT '',
      escalation_threshold INTEGER NOT NULL DEFAULT 3,
      category_id INTEGER NOT NULL,
      current_version_id INTEGER,
      latest_version_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'published', 'disabled', 'archived')),
      hits INTEGER NOT NULL DEFAULT 0,
      helpful_count INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      review_remark TEXT,
      expires_at DATETIME,
      tags TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      published_by INTEGER,
      published_by_name TEXT,
      disabled_by INTEGER,
      disabled_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME,
      approved_at DATETIME,
      published_at DATETIME,
      disabled_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (published_by) REFERENCES users(id),
      FOREIGN KEY (disabled_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE knowledge_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      title TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      applicable_products TEXT NOT NULL DEFAULT '',
      escalation_condition TEXT NOT NULL DEFAULT '',
      escalation_threshold INTEGER NOT NULL DEFAULT 3,
      category_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'published', 'disabled', 'archived')),
      change_log TEXT NOT NULL DEFAULT '',
      expires_at DATETIME,
      tags TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME,
      approved_at DATETIME,
      published_at DATETIME,
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE knowledge_hit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      entry_title TEXT NOT NULL,
      version_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_no TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      matched_by TEXT NOT NULL DEFAULT 'category',
      matched_keywords TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      effectiveness TEXT CHECK(effectiveness IN ('helpful', 'partially_helpful', 'not_helpful')),
      feedback TEXT,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME,
      feedback_at DATETIME,
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (version_id) REFERENCES knowledge_versions(id),
      FOREIGN KEY (order_id) REFERENCES work_orders(id),
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE knowledge_operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL,
      related_id INTEGER,
      related_type TEXT,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  db.run('CREATE INDEX idx_kc_enabled ON knowledge_categories(enabled)');
  db.run('CREATE INDEX idx_ke_status ON knowledge_entries(status)');
  db.run('CREATE INDEX idx_ke_category ON knowledge_entries(category_id)');
  db.run('CREATE INDEX idx_ke_created_by ON knowledge_entries(created_by)');
  db.run('CREATE INDEX idx_ke_title ON knowledge_entries(title)');
  db.run('CREATE INDEX idx_kv_entry ON knowledge_versions(entry_id)');
  db.run('CREATE INDEX idx_kv_version ON knowledge_versions(entry_id, version_no)');
  db.run('CREATE INDEX idx_khr_entry ON knowledge_hit_records(entry_id)');
  db.run('CREATE INDEX idx_khr_order ON knowledge_hit_records(order_id)');
  db.run('CREATE INDEX idx_khr_operator ON knowledge_hit_records(operator_id)');
  db.run('CREATE INDEX idx_khr_created ON knowledge_hit_records(created_at)');
  db.run('CREATE INDEX idx_kol_operation ON knowledge_operation_logs(operation_type)');
  db.run('CREATE INDEX idx_kol_related ON knowledge_operation_logs(related_type, related_id)');

  db.run(`
    CREATE TABLE knowledge_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function migrateDatabase(): void {
  if (!db) return;

  try {
    const userCols = db.exec("PRAGMA table_info(users)");
    const userColNames = userCols[0]?.values.map(row => row[1]) || [];
    const sqliteMasterUsers = db.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    );
    const userCreateSql = sqliteMasterUsers[0]?.values[0]?.[0] as string || '';
    const hasAllRoles = userCreateSql.includes("'customer_service'") && userCreateSql.includes("'supervisor'");

    if (!hasAllRoles) {
      console.log('[migrate] 重建 users 表以更新角色 CHECK 约束...');
      db.run(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'dispatcher', 'customer_service', 'supervisor')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const colsToCopy = userColNames.join(', ');
      db.run(`INSERT INTO users_new (${colsToCopy}) SELECT ${colsToCopy} FROM users`);
      db.run('DROP TABLE users');
      db.run('ALTER TABLE users_new RENAME TO users');
      saveDatabase();
    }

    const approvalCols = db.exec("PRAGMA table_info(approvals)");
    const approvalColNames = approvalCols[0]?.values.map(row => row[1]) || [];

    if (!approvalColNames.includes('target_technician_id')) {
      db.run('ALTER TABLE approvals ADD COLUMN target_technician_id INTEGER REFERENCES technicians(id)');
      saveDatabase();
    }

    if (!approvalColNames.includes('withdrawn_at')) {
      db.run('ALTER TABLE approvals ADD COLUMN withdrawn_at DATETIME');
      saveDatabase();
    }

    if (!approvalColNames.includes('withdraw_reason')) {
      db.run('ALTER TABLE approvals ADD COLUMN withdraw_reason TEXT');
      saveDatabase();
    }

    const sqliteMaster = db.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='approvals'"
    );
    const createSql = sqliteMaster[0]?.values[0]?.[0] as string || '';
    const hasWithdrawnInCheck = createSql.includes("'withdrawn'");

    if (!hasWithdrawnInCheck) {
      console.log('[migrate] 重建 approvals 表以更新 CHECK 约束 (添加 withdrawn)...');

      db.run(`
        CREATE TABLE approvals_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK(type IN ('reassign', 'force_assign', 'overtime')),
          order_id INTEGER NOT NULL,
          applicant_id INTEGER NOT NULL,
          applicant_name TEXT NOT NULL,
          reason TEXT NOT NULL,
          target_technician_id INTEGER,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'withdrawn')),
          approver_id INTEGER,
          approver_name TEXT,
          approval_remark TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          approved_at DATETIME,
          withdrawn_at DATETIME,
          withdraw_reason TEXT,
          FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (applicant_id) REFERENCES users(id),
          FOREIGN KEY (approver_id) REFERENCES users(id),
          FOREIGN KEY (target_technician_id) REFERENCES technicians(id)
        )
      `);

      const colsToCopy = approvalColNames.join(', ');
      db.run(`INSERT INTO approvals_new (${colsToCopy}) SELECT ${colsToCopy} FROM approvals`);
      db.run('DROP TABLE approvals');
      db.run('ALTER TABLE approvals_new RENAME TO approvals');
      db.run('CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)');
      saveDatabase();
    }

    const conflictCols = db.exec("PRAGMA table_info(conflicts)");
    const conflictColNames = conflictCols[0]?.values.map(row => row[1]) || [];

    if (!conflictColNames.includes('approval_id')) {
      db.run('ALTER TABLE conflicts ADD COLUMN approval_id INTEGER REFERENCES approvals(id)');
      saveDatabase();
    }

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables[0]?.values.map(row => row[0]) || [];

    if (!tableNames.includes('dispatch_rules')) {
      db.run(`
        CREATE TABLE dispatch_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('max_daily_orders', 'min_service_interval', 'required_skill_match')),
          severity TEXT NOT NULL CHECK(severity IN ('block', 'warn')),
          value TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          description TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run('CREATE INDEX idx_dispatch_rules_type ON dispatch_rules(type)');
      db.run('CREATE INDEX idx_dispatch_rules_enabled ON dispatch_rules(enabled)');
      saveDatabase();
    }

    if (!tableNames.includes('rule_operation_logs')) {
      db.run(`
        CREATE TABLE rule_operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_type TEXT NOT NULL CHECK(operation_type IN ('rule_created', 'rule_updated', 'rule_enabled', 'rule_disabled', 'rule_deleted', 'rule_hit', 'rule_overridden', 'import_success', 'import_failure')),
          rule_id INTEGER,
          operator_id INTEGER NOT NULL,
          operator_name TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rule_id) REFERENCES dispatch_rules(id) ON DELETE SET NULL,
          FOREIGN KEY (operator_id) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_rule_logs_operation ON rule_operation_logs(operation_type)');
      db.run('CREATE INDEX idx_rule_logs_rule ON rule_operation_logs(rule_id)');
      saveDatabase();
    }

    if (!tableNames.includes('return_visit_templates')) {
      db.run(`
        CREATE TABLE return_visit_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      saveDatabase();
    }

    if (!tableNames.includes('appeal_categories')) {
      db.run(`
        CREATE TABLE appeal_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      saveDatabase();
    }

    if (!tableNames.includes('after_sale_configs')) {
      db.run(`
        CREATE TABLE after_sale_configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          config_key TEXT UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      saveDatabase();
    }

    const defaultConfigs = [
      ['visit_timeout_hours', '24', '回访任务超时时间（小时）'],
      ['appeal_timeout_hours', '48', '申诉处理超时时间（小时）'],
      ['appeal_image_required', '0', '申诉是否必须上传图片凭证（0否，1是）'],
    ];
    for (const [key, value, desc] of defaultConfigs) {
      const exists = db.exec(
        `SELECT id FROM after_sale_configs WHERE config_key = ?`,
        [key]
      );
      if (!exists || exists.length === 0 || !exists[0]?.values || exists[0].values.length === 0) {
        db.run(
          "INSERT INTO after_sale_configs (config_key, config_value, description) VALUES (?, ?, ?)",
          [key, value, desc]
        );
      }
    }
    saveDatabase();

    if (!tableNames.includes('return_visits')) {
      db.run(`
        CREATE TABLE return_visits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          template_id INTEGER,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'timeout', 'cancelled')),
          result TEXT CHECK(result IN ('satisfied', 'dissatisfied', 'no_answer', 'invalid_number', 'refused')),
          remark TEXT,
          image_required INTEGER NOT NULL DEFAULT 0,
          image_url TEXT,
          timeout_hours INTEGER NOT NULL DEFAULT 24,
          initiator_id INTEGER NOT NULL,
          initiator_name TEXT NOT NULL,
          handler_id INTEGER,
          handler_name TEXT,
          initiated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          due_at DATETIME NOT NULL,
          completed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (template_id) REFERENCES return_visit_templates(id) ON DELETE SET NULL,
          FOREIGN KEY (initiator_id) REFERENCES users(id),
          FOREIGN KEY (handler_id) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_visits_status ON return_visits(status)');
      db.run('CREATE INDEX idx_visits_order ON return_visits(order_id)');
      db.run('CREATE INDEX idx_visits_initiator ON return_visits(initiator_id)');
      db.run('CREATE INDEX idx_visits_due ON return_visits(due_at)');
      saveDatabase();
    }

    if (!tableNames.includes('return_visit_histories')) {
      db.run(`
        CREATE TABLE return_visit_histories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          visit_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          operator_id INTEGER NOT NULL,
          operator_name TEXT NOT NULL,
          remark TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (visit_id) REFERENCES return_visits(id) ON DELETE CASCADE,
          FOREIGN KEY (operator_id) REFERENCES users(id)
        )
      `);
      saveDatabase();
    }

    if (!tableNames.includes('appeals')) {
      db.run(`
        CREATE TABLE appeals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          visit_id INTEGER NOT NULL,
          order_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'reassigned', 'resolved', 'withdrawn')),
          reason TEXT NOT NULL,
          image_url TEXT,
          image_required INTEGER NOT NULL DEFAULT 0,
          submitter_id INTEGER NOT NULL,
          submitter_name TEXT NOT NULL,
          handler_id INTEGER,
          handler_name TEXT,
          handle_remark TEXT,
          timeout_hours INTEGER NOT NULL DEFAULT 48,
          submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          due_at DATETIME NOT NULL,
          handled_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (visit_id) REFERENCES return_visits(id) ON DELETE CASCADE,
          FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES appeal_categories(id),
          FOREIGN KEY (submitter_id) REFERENCES users(id),
          FOREIGN KEY (handler_id) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_appeals_status ON appeals(status)');
      db.run('CREATE INDEX idx_appeals_order ON appeals(order_id)');
      db.run('CREATE INDEX idx_appeals_submitter ON appeals(submitter_id)');
      db.run('CREATE INDEX idx_appeals_due ON appeals(due_at)');
      saveDatabase();
    }

    if (!tableNames.includes('appeal_histories')) {
      db.run(`
        CREATE TABLE appeal_histories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          appeal_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          operator_id INTEGER NOT NULL,
          operator_name TEXT NOT NULL,
          remark TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE CASCADE,
          FOREIGN KEY (operator_id) REFERENCES users(id)
        )
      `);
      saveDatabase();
    }

    if (!tableNames.includes('after_sale_operation_logs')) {
      db.run(`
        CREATE TABLE after_sale_operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_type TEXT NOT NULL,
          related_id INTEGER,
          related_type TEXT,
          operator_id INTEGER NOT NULL,
          operator_name TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (operator_id) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_as_logs_operation ON after_sale_operation_logs(operation_type)');
      db.run('CREATE INDEX idx_as_logs_related ON after_sale_operation_logs(related_type, related_id)');
      saveDatabase();
    }

    // ===== 知识库相关表迁移 =====
    if (!tableNames.includes('knowledge_categories')) {
      db.run(`
        CREATE TABLE knowledge_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run('CREATE INDEX idx_kc_enabled ON knowledge_categories(enabled)');
      saveDatabase();
    }

    if (!tableNames.includes('knowledge_entries')) {
      db.run(`
        CREATE TABLE knowledge_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          question TEXT NOT NULL DEFAULT '',
          answer TEXT NOT NULL DEFAULT '',
          applicable_products TEXT NOT NULL DEFAULT '',
          escalation_condition TEXT NOT NULL DEFAULT '',
          escalation_threshold INTEGER NOT NULL DEFAULT 3,
          category_id INTEGER NOT NULL,
          current_version_id INTEGER,
          latest_version_id INTEGER,
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'published', 'disabled', 'archived')),
          hits INTEGER NOT NULL DEFAULT 0,
          helpful_count INTEGER NOT NULL DEFAULT 0,
          version INTEGER NOT NULL DEFAULT 1,
          review_remark TEXT,
          expires_at DATETIME,
          tags TEXT NOT NULL DEFAULT '',
          created_by INTEGER NOT NULL,
          created_by_name TEXT NOT NULL,
          published_by INTEGER,
          published_by_name TEXT,
          disabled_by INTEGER,
          disabled_by_name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          submitted_at DATETIME,
          approved_at DATETIME,
          published_at DATETIME,
          disabled_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (category_id) REFERENCES knowledge_categories(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (published_by) REFERENCES users(id),
          FOREIGN KEY (disabled_by) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_ke_status ON knowledge_entries(status)');
      db.run('CREATE INDEX idx_ke_category ON knowledge_entries(category_id)');
      db.run('CREATE INDEX idx_ke_created_by ON knowledge_entries(created_by)');
      db.run('CREATE INDEX idx_ke_title ON knowledge_entries(title)');
      saveDatabase();
    }

    if (!tableNames.includes('knowledge_versions')) {
      db.run(`
        CREATE TABLE knowledge_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id INTEGER NOT NULL,
          version_no INTEGER NOT NULL,
          title TEXT NOT NULL,
          question TEXT NOT NULL DEFAULT '',
          answer TEXT NOT NULL DEFAULT '',
          applicable_products TEXT NOT NULL DEFAULT '',
          escalation_condition TEXT NOT NULL DEFAULT '',
          escalation_threshold INTEGER NOT NULL DEFAULT 3,
          category_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'published', 'disabled', 'archived')),
          change_log TEXT NOT NULL DEFAULT '',
          expires_at DATETIME,
          tags TEXT NOT NULL DEFAULT '',
          created_by INTEGER NOT NULL,
          created_by_name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          submitted_at DATETIME,
          approved_at DATETIME,
          published_at DATETIME,
          FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES knowledge_categories(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_kv_entry ON knowledge_versions(entry_id)');
      db.run('CREATE INDEX idx_kv_version ON knowledge_versions(entry_id, version_no)');
      saveDatabase();
    }

    if (!tableNames.includes('knowledge_hit_records')) {
      db.run(`
        CREATE TABLE knowledge_hit_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id INTEGER NOT NULL,
          entry_title TEXT NOT NULL,
          version_id INTEGER NOT NULL,
          version_no INTEGER NOT NULL,
          order_id INTEGER NOT NULL,
          order_no TEXT NOT NULL,
          category_id INTEGER NOT NULL,
          category_name TEXT NOT NULL,
          matched_by TEXT NOT NULL DEFAULT 'category',
          matched_keywords TEXT NOT NULL DEFAULT '',
          score INTEGER NOT NULL DEFAULT 0,
          used INTEGER NOT NULL DEFAULT 0,
          effectiveness TEXT CHECK(effectiveness IN ('helpful', 'partially_helpful', 'not_helpful')),
          feedback TEXT,
          operator_id INTEGER NOT NULL,
          operator_name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          used_at DATETIME,
          feedback_at DATETIME,
          FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE,
          FOREIGN KEY (version_id) REFERENCES knowledge_versions(id),
          FOREIGN KEY (order_id) REFERENCES work_orders(id),
          FOREIGN KEY (category_id) REFERENCES knowledge_categories(id),
          FOREIGN KEY (operator_id) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_khr_entry ON knowledge_hit_records(entry_id)');
      db.run('CREATE INDEX idx_khr_order ON knowledge_hit_records(order_id)');
      db.run('CREATE INDEX idx_khr_operator ON knowledge_hit_records(operator_id)');
      db.run('CREATE INDEX idx_khr_created ON knowledge_hit_records(created_at)');
      saveDatabase();
    }

    if (!tableNames.includes('knowledge_operation_logs')) {
      db.run(`
        CREATE TABLE knowledge_operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_type TEXT NOT NULL,
          related_id INTEGER,
          related_type TEXT,
          operator_id INTEGER NOT NULL,
          operator_name TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (operator_id) REFERENCES users(id)
        )
      `);
      db.run('CREATE INDEX idx_kol_operation ON knowledge_operation_logs(operation_type)');
      db.run('CREATE INDEX idx_kol_related ON knowledge_operation_logs(related_type, related_id)');
      saveDatabase();
    }

    // 知识库默认配置
    const kConfigExists = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_configs'"
    );
    if (!kConfigExists || kConfigExists.length === 0 || !kConfigExists[0]?.values || kConfigExists[0].values.length === 0) {
      db.run(`
        CREATE TABLE knowledge_configs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          config_key TEXT UNIQUE NOT NULL,
          config_value TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      saveDatabase();
    }
    const kDefaults = [
      ['knowledge_auto_match', '1', '工单处理时自动匹配知识库（0否，1是）'],
      ['knowledge_match_threshold', '60', '关键词匹配最低分数阈值（0-100）'],
      ['knowledge_max_results', '5', '单次匹配返回最大条目数'],
    ];
    const tables2 = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_configs'");
    if (tables2.length > 0 && tables2[0].values.length > 0) {
      for (const [key, value, desc] of kDefaults) {
        const exists = db.exec(
          `SELECT id FROM knowledge_configs WHERE config_key = ?`,
          [key]
        );
        if (!exists || exists.length === 0 || !exists[0]?.values || exists[0].values.length === 0) {
          db.run(
            "INSERT INTO knowledge_configs (config_key, config_value, description) VALUES (?, ?, ?)",
            [key, value, desc]
          );
        }
      }
      saveDatabase();
    }

    // 知识库默认分类
    const catDefaults = [
      ['空调类', '空调安装、维修、清洗相关问题', 1],
      ['水电类', '水电维修、安装、故障排查相关问题', 2],
      ['家电类', '家电维修、保养、使用说明相关问题', 3],
      ['管道疏通类', '管道疏通、马桶、地漏相关问题', 4],
      ['通用流程', '通用服务流程、收费标准、投诉处理等', 5],
    ];
    const catsExist = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_categories'");
    if (catsExist.length > 0 && catsExist[0].values.length > 0) {
      for (const [name, desc, sort] of catDefaults) {
        const exists = db.exec(
          `SELECT id FROM knowledge_categories WHERE name = ?`,
          [name]
        );
        if (!exists || exists.length === 0 || !exists[0]?.values || exists[0].values.length === 0) {
          db.run(
            "INSERT INTO knowledge_categories (name, description, sort_order) VALUES (?, ?, ?)",
            [name, desc, sort]
          );
        }
      }
      saveDatabase();
    }

    const csExists = query("SELECT id FROM users WHERE username = 'customer_service'");
    if (csExists.length === 0) {
      const csHash = bcrypt.hashSync('123456', 10);
      db.run(
        "INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)",
        ['customer_service', csHash, '李客服', 'customer_service']
      );
      saveDatabase();
    }
    const svExists = query("SELECT id FROM users WHERE username = 'supervisor'");
    if (svExists.length === 0) {
      const svHash = bcrypt.hashSync('123456', 10);
      db.run(
        "INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)",
        ['supervisor', svHash, '王主管', 'supervisor']
      );
      saveDatabase();
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
}

function seedData(): void {
  if (!db) return;

  const adminHash = bcrypt.hashSync('123456', 10);
  const dispatcherHash = bcrypt.hashSync('123456', 10);
  const csHash = bcrypt.hashSync('123456', 10);
  const svHash = bcrypt.hashSync('123456', 10);

  db.run(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
    ['admin', adminHash, '系统管理员', 'admin']
  );
  db.run(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
    ['dispatcher', dispatcherHash, '张调度', 'dispatcher']
  );
  db.run(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
    ['customer_service', csHash, '李客服', 'customer_service']
  );
  db.run(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
    ['supervisor', svHash, '王主管', 'supervisor']
  );

  const technicians = [
    ['李师傅', '13800138001', '空调维修', 'active'],
    ['王师傅', '13800138002', '水电维修', 'active'],
    ['赵师傅', '13800138003', '家电维修', 'active'],
    ['陈师傅', '13800138004', '管道疏通', 'active'],
  ];

  technicians.forEach((tech) => {
    db.run(
      'INSERT INTO technicians (name, phone, skill, status) VALUES (?, ?, ?, ?)',
      tech
    );
  });

  for (let techId = 1; techId <= 4; techId++) {
    for (let day = 1; day <= 5; day++) {
      db.run(
        'INSERT INTO schedule_slots (technician_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
        [techId, day, '09:00', '18:00']
      );
    }
  }

  db.run(
    "INSERT INTO return_visit_templates (name, content) VALUES (?, ?)",
    ['标准回访模板', '您好，我是XX公司的客服，想对您的本次服务做一个简单回访，请问您对服务质量满意吗？']
  );
  db.run(
    "INSERT INTO return_visit_templates (name, content) VALUES (?, ?)",
    ['满意度深度回访', '您好，感谢您选择我们的服务。为了提升服务质量，想占用您几分钟时间了解服务体验：1. 技师是否准时到达 2. 服务态度如何 3. 问题是否解决 4. 总体满意度评分']
  );

  db.run(
    "INSERT INTO appeal_categories (name, description) VALUES (?, ?)",
    ['服务态度投诉', '客户对服务人员态度不满意']
  );
  db.run(
    "INSERT INTO appeal_categories (name, description) VALUES (?, ?)",
    ['服务质量投诉', '客户认为服务质量未达到预期']
  );
  db.run(
    "INSERT INTO appeal_categories (name, description) VALUES (?, ?)",
    ['收费争议', '客户对收费金额有异议']
  );
  db.run(
    "INSERT INTO appeal_categories (name, description) VALUES (?, ?)",
    ['二次返修', '服务后问题再次出现']
  );

  db.run(
    "INSERT INTO after_sale_configs (config_key, config_value, description) VALUES (?, ?, ?)",
    ['visit_timeout_hours', '24', '回访任务超时时间（小时）']
  );
  db.run(
    "INSERT INTO after_sale_configs (config_key, config_value, description) VALUES (?, ?, ?)",
    ['appeal_timeout_hours', '48', '申诉处理超时时间（小时）']
  );
  db.run(
    "INSERT INTO after_sale_configs (config_key, config_value, description) VALUES (?, ?, ?)",
    ['appeal_image_required', '0', '申诉是否必须上传图片凭证（0否，1是）']
  );

  // ===== 知识库默认配置 =====
  db.run(
    "INSERT INTO knowledge_configs (config_key, config_value, description) VALUES (?, ?, ?)",
    ['knowledge_auto_match', '1', '工单处理时自动匹配知识库（0否，1是）']
  );
  db.run(
    "INSERT INTO knowledge_configs (config_key, config_value, description) VALUES (?, ?, ?)",
    ['knowledge_match_threshold', '60', '关键词匹配最低分数阈值（0-100）']
  );
  db.run(
    "INSERT INTO knowledge_configs (config_key, config_value, description) VALUES (?, ?, ?)",
    ['knowledge_max_results', '5', '单次匹配返回最大条目数']
  );

  // ===== 知识库默认分类 =====
  db.run(
    "INSERT INTO knowledge_categories (name, description, sort_order) VALUES (?, ?, ?)",
    ['空调类', '空调安装、维修、清洗相关问题', 1]
  );
  db.run(
    "INSERT INTO knowledge_categories (name, description, sort_order) VALUES (?, ?, ?)",
    ['水电类', '水电维修、安装、故障排查相关问题', 2]
  );
  db.run(
    "INSERT INTO knowledge_categories (name, description, sort_order) VALUES (?, ?, ?)",
    ['家电类', '家电维修、保养、使用说明相关问题', 3]
  );
  db.run(
    "INSERT INTO knowledge_categories (name, description, sort_order) VALUES (?, ?, ?)",
    ['管道疏通类', '管道疏通、马桶、地漏相关问题', 4]
  );
  db.run(
    "INSERT INTO knowledge_categories (name, description, sort_order) VALUES (?, ?, ?)",
    ['通用流程', '通用服务流程、收费标准、投诉处理等', 5]
  );

  // ===== 示例知识条目（已发布）=====
  const now = new Date().toISOString();

  // 示例 1 - 空调不制冷
  db.run(
    `INSERT INTO knowledge_entries (title, question, answer, applicable_products, escalation_condition, escalation_threshold, category_id, current_version_id, latest_version_id, status, version, tags, created_by, created_by_name, published_by, published_by_name, created_at, submitted_at, approved_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, 1, ?, 1, ?, ?, ?, ?, ?)`,
    [
      '空调不制冷怎么处理',
      '客户报修空调不制冷，上门后应检查哪些部位？',
      '1. 先检查电源是否正常、遥控器电池和设置是否正确；\n2. 查看过滤网是否积灰堵塞，建议每两周清洗；\n3. 检查室外机散热片是否被杂物遮挡；\n4. 听压缩机启动声音，判断是否氟利昂泄漏；\n5. 如以上均正常，用压力表测量氟压，R22 正常压力4.5-5.5kg。',
      '家用挂机 2匹以下',
      '连续3台同型号出现同样问题，判定为批次问题需升级技术主管',
      3,
      1,
      1,
      1,
      '空调,制冷,氟利昂,过滤网',
      '系统管理员',
      '系统管理员',
      now, now, now, now
    ]
  );
  const eid1 = getLastInsertId();
  db.run(
    `INSERT INTO knowledge_versions (entry_id, version_no, title, question, answer, applicable_products, escalation_condition, escalation_threshold, category_id, status, change_log, tags, created_by, created_by_name, created_at, submitted_at, approved_at, published_at)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 'published', '初始版本', ?, 1, ?, ?, ?, ?, ?)`,
    [eid1, '空调不制冷怎么处理', '客户报修空调不制冷，上门后应检查哪些部位？',
      '1. 先检查电源是否正常、遥控器电池和设置是否正确；\n2. 查看过滤网是否积灰堵塞，建议每两周清洗；\n3. 检查室外机散热片是否被杂物遮挡；\n4. 听压缩机启动声音，判断是否氟利昂泄漏；\n5. 如以上均正常，用压力表测量氟压，R22 正常压力4.5-5.5kg。',
      '家用挂机 2匹以下', '连续3台同型号出现同样问题，判定为批次问题需升级技术主管', 3, 1,
      '空调,制冷,氟利昂,过滤网', '系统管理员', now, now, now, now]
  );

  // 示例 2 - 水龙头漏水
  db.run(
    `INSERT INTO knowledge_entries (title, question, answer, applicable_products, escalation_condition, escalation_threshold, category_id, current_version_id, latest_version_id, status, version, tags, created_by, created_by_name, published_by, published_by_name, created_at, submitted_at, approved_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, 1, ?, 1, ?, ?, ?, ?, ?)`,
    [
      '水龙头滴水/漏水快速处理',
      '厨房或卫生间水龙头关紧后仍滴水，如何快速排查和处理？',
      '1. 首先关闭进水角阀，确认水源已切断；\n2. 拆卸把手，查看阀芯是否磨损或卡入异物；\n3. 陶瓷阀芯问题直接更换同型号阀芯（推荐更换而非维修）；\n4. 检查出水嘴起泡器是否积有泥沙，拧下清洗；\n5. 如是老式螺旋式，更换内部橡胶垫片。',
      '厨房龙头,面盆龙头,淋浴龙头',
      '更换阀芯后一周内同一客户再次报修，判定为配件质量问题',
      3,
      2,
      2,
      2,
      '水龙头,漏水,阀芯,垫片',
      '系统管理员',
      '系统管理员',
      now, now, now, now
    ]
  );
  const eid2 = getLastInsertId();
  db.run(
    `INSERT INTO knowledge_versions (entry_id, version_no, title, question, answer, applicable_products, escalation_condition, escalation_threshold, category_id, status, change_log, tags, created_by, created_by_name, created_at, submitted_at, approved_at, published_at)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 'published', '初始版本', ?, 1, ?, ?, ?, ?, ?)`,
    [eid2, '水龙头滴水/漏水快速处理', '厨房或卫生间水龙头关紧后仍滴水，如何快速排查和处理？',
      '1. 首先关闭进水角阀，确认水源已切断；\n2. 拆卸把手，查看阀芯是否磨损或卡入异物；\n3. 陶瓷阀芯问题直接更换同型号阀芯（推荐更换而非维修）；\n4. 检查出水嘴起泡器是否积有泥沙，拧下清洗；\n5. 如是老式螺旋式，更换内部橡胶垫片。',
      '厨房龙头,面盆龙头,淋浴龙头', '更换阀芯后一周内同一客户再次报修，判定为配件质量问题', 3, 2,
      '水龙头,漏水,阀芯,垫片', '系统管理员', now, now, now, now]
  );

  // 示例 3 - 售后收费说明（客服常用）
  db.run(
    `INSERT INTO knowledge_entries (title, question, answer, applicable_products, escalation_condition, escalation_threshold, category_id, current_version_id, latest_version_id, status, version, tags, created_by, created_by_name, published_by, published_by_name, created_at, submitted_at, approved_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, 1, ?, 1, ?, ?, ?, ?, ?)`,
    [
      '售后收费标准沟通话术',
      '客户询问上门维修是否收费、收多少钱时，客服应该如何规范回答？',
      '"您好！我们上门检测是免费的，检测完成后会给您提供具体维修方案和费用明细。如果您选择维修，我们会收取配件成本费和适当的工时费，费用公开透明，所有项目都有收费标准可以给您查看。如果您对报价不满意，也可以随时取消维修，不会产生任何费用。请您放心。"',
      '全品类',
      '客户对收费产生强烈投诉，且拒绝沟通，判定为需要主管介入',
      5,
      5,
      3,
      3,
      '收费,话术,沟通,上门费',
      '系统管理员',
      '系统管理员',
      now, now, now, now
    ]
  );
  const eid3 = getLastInsertId();
  db.run(
    `INSERT INTO knowledge_versions (entry_id, version_no, title, question, answer, applicable_products, escalation_condition, escalation_threshold, category_id, status, change_log, tags, created_by, created_by_name, created_at, submitted_at, approved_at, published_at)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 'published', '初始版本', ?, 1, ?, ?, ?, ?, ?)`,
    [eid3, '售后收费标准沟通话术', '客户询问上门维修是否收费、收多少钱时，客服应该如何规范回答？',
      '"您好！我们上门检测是免费的，检测完成后会给您提供具体维修方案和费用明细。如果您选择维修，我们会收取配件成本费和适当的工时费，费用公开透明，所有项目都有收费标准可以给您查看。如果您对报价不满意，也可以随时取消维修，不会产生任何费用。请您放心。"',
      '全品类', '客户对收费产生强烈投诉，且拒绝沟通，判定为需要主管介入', 5, 3,
      '收费,话术,沟通,上门费', '系统管理员', now, now, now, now]
  );
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function run(sql: string, params: any[] = []): number {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  const rowsModified = db.getRowsModified();
  saveDatabase();
  return rowsModified;
}

export function runAndGetId(sql: string, params: any[] = []): number {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  const idResult = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  if (idResult.length === 0 || idResult[0].values.length === 0) return 0;
  return idResult[0].values[0][0] as number;
}

export function getLastInsertId(): number {
  if (!db) throw new Error('Database not initialized');
  const result = db.exec('SELECT last_insert_rowid() as id');
  if (result.length === 0 || result[0].values.length === 0) return 0;
  return result[0].values[0][0] as number;
}
