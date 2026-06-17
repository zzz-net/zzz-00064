import { initDatabase, query, getDb } from './api/db/index';
import { OrderService } from './api/services/OrderService';

async function test() {
  console.log('初始化数据库...');
  await initDatabase();
  
  console.log('\n现有工单数:');
  const orders = query('SELECT order_no FROM work_orders ORDER BY id');
  console.log('  数量:', orders.length);
  orders.forEach(o => console.log('   -', o.order_no));
  
  console.log('\n测试 generateOrderNo:');
  const no1 = OrderService.generateOrderNo();
  console.log('  生成1:', no1);
  
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  console.log('  日期前缀:', dateStr);
  
  const pattern = `${dateStr}%`;
  console.log('  LIKE 模式:', pattern);
  
  const result = query<{ count: number }>(
    "SELECT COUNT(*) as count FROM work_orders WHERE order_no LIKE ?",
    [pattern]
  );
  console.log('  COUNT 结果:', result[0].count);
  
  console.log('\n直接用 exec 查询:');
  const db = getDb();
  const execResult = db.exec(`SELECT COUNT(*) as count FROM work_orders WHERE order_no LIKE '${dateStr}%'`);
  console.log('  exec 结果:', JSON.stringify(execResult));
}

test().catch(console.error);
