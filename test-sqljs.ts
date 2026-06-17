import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

async function testSqlJs() {
  console.log('初始化 sql.js...');
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join('./node_modules/sql.js/dist', file),
  });
  
  const db: Database = new SQL.Database();
  
  console.log('\n创建表...');
  db.run(`
    CREATE TABLE test_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);
  
  console.log('\n测试 1: 用 db.run() 插入，然后用 db.exec() 查询 last_insert_rowid');
  db.run("INSERT INTO test_table (name) VALUES (?)", ['测试1']);
  
  const result1 = db.exec("SELECT last_insert_rowid() as id");
  console.log('  db.exec 结果:', JSON.stringify(result1));
  
  console.log('\n测试 2: 用 prepared statement 插入，然后查询');
  const stmt = db.prepare("INSERT INTO test_table (name) VALUES (?)");
  stmt.bind(['测试2']);
  stmt.step();
  stmt.free();
  
  const result2 = db.exec("SELECT last_insert_rowid() as id");
  console.log('  准备语句插入后结果:', JSON.stringify(result2));
  
  console.log('\n测试 3: 查询所有数据');
  const allData = db.exec("SELECT * FROM test_table");
  console.log('  所有数据:', JSON.stringify(allData));
  
  console.log('\n测试 4: 检查 db.run 是否真的支持参数');
  try {
    db.run("INSERT INTO test_table (name) VALUES (?, ?)", ['测试3', '多余参数']);
    console.log('  多参数没有报错');
  } catch (e: any) {
    console.log('  多参数报错:', e.message);
  }
  
  console.log('\n测试 5: 直接传字符串 SQL（没有参数）');
  db.run("INSERT INTO test_table (name) VALUES ('测试4')");
  const result3 = db.exec("SELECT last_insert_rowid() as id");
  console.log('  无参数插入后结果:', JSON.stringify(result3));
  
  const allData2 = db.exec("SELECT * FROM test_table");
  console.log('  所有数据:', JSON.stringify(allData2));
  
  console.log('\n测试完成!');
}

testSqlJs().catch(console.error);
