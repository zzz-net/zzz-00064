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
      role TEXT NOT NULL CHECK(role IN ('admin', 'dispatcher')),
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

  db.run('CREATE INDEX idx_orders_status ON work_orders(status)');
  db.run('CREATE INDEX idx_orders_technician ON work_orders(technician_id)');
  db.run('CREATE INDEX idx_orders_scheduled ON work_orders(scheduled_start_time)');
  db.run('CREATE INDEX idx_histories_order ON order_histories(order_id)');
  db.run('CREATE INDEX idx_approvals_status ON approvals(status)');
  db.run('CREATE INDEX idx_conflicts_resolved ON conflicts(resolved)');
}

function migrateDatabase(): void {
  if (!db) return;

  try {
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
  } catch (e) {
    console.error('Migration error:', e);
  }
}

function seedData(): void {
  if (!db) return;

  const adminHash = bcrypt.hashSync('123456', 10);
  const dispatcherHash = bcrypt.hashSync('123456', 10);

  db.run(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
    ['admin', adminHash, '系统管理员', 'admin']
  );
  db.run(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
    ['dispatcher', dispatcherHash, '张调度', 'dispatcher']
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
