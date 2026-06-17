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
