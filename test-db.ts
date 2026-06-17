import { initDatabase, query, run, getLastInsertId, saveDatabase } from './api/db/index';

async function testDb() {
  console.log('初始化数据库...');
  await initDatabase();
  
  console.log('\n测试 1: 插入一条数据，然后获取 last_insert_rowid');
  run("INSERT INTO technicians (name, phone, skill, status) VALUES (?, ?, ?, ?)", 
      ['测试技师', '123456', '测试', 'active']);
  
  const id1 = getLastInsertId();
  console.log('  插入后的 last_insert_rowid:', id1);
  
  console.log('\n测试 2: 查询刚插入的数据');
  const tech = query('SELECT * FROM technicians WHERE id = ?', [id1]);
  console.log('  查询结果:', tech);
  
  console.log('\n测试 3: 检查 work_orders 表是否有数据');
  const orders = query('SELECT * FROM work_orders');
  console.log('  工单数量:', orders.length);
  
  console.log('\n测试 4: 尝试插入一条工单');
  run(`INSERT INTO work_orders (
    order_no, customer_name, customer_phone, customer_address,
    service_type, description, status, scheduled_start_time,
    scheduled_end_time, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`, [
    'WO202606180001',
    '测试客户',
    '123456789',
    '测试地址',
    '空调维修',
    '测试描述',
    '2026-06-19T10:00:00.000Z',
    '2026-06-19T12:00:00.000Z',
    1
  ]);
  
  const orderId = getLastInsertId();
  console.log('  工单 ID:', orderId);
  
  const orderCheck = query('SELECT * FROM work_orders WHERE id = ?', [orderId]);
  console.log('  工单查询结果:', orderCheck.length > 0 ? '找到' : '未找到');
  if (orderCheck.length > 0) {
    console.log('  工单详情:', JSON.stringify(orderCheck[0], null, 2));
  }
  
  console.log('\n测试 5: 测试带 JOIN 的查询');
  const orderWithJoin = query(`
    SELECT wo.*, t.name as technician_name, u.name as created_by_name
    FROM work_orders wo
    LEFT JOIN technicians t ON wo.technician_id = t.id
    LEFT JOIN users u ON wo.created_by = u.id
    WHERE wo.id = ?
  `, [orderId]);
  console.log('  JOIN 查询结果:', orderWithJoin.length > 0 ? '找到' : '未找到');
  if (orderWithJoin.length > 0) {
    console.log('  工单详情:', JSON.stringify(orderWithJoin[0], null, 2));
  }
  
  console.log('\n测试完成!');
}

testDb().catch(console.error);
