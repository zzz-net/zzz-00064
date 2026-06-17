import { initDatabase, query, run, getLastInsertId, getDb } from './api/db/index';
import { OrderService } from './api/services/OrderService';

async function testOrderService() {
  console.log('初始化数据库...');
  await initDatabase();
  
  console.log('\n测试 1: 直接调用 run 插入，检查 getLastInsertId');
  run("INSERT INTO technicians (name, phone, skill, status) VALUES (?, ?, ?, ?)", 
      ['测试技师', '123456', '测试', 'active']);
  
  const id1 = getLastInsertId();
  console.log('  lastInsertId:', id1);
  
  const tech = query('SELECT * FROM technicians WHERE id = ?', [id1]);
  console.log('  查询结果长度:', tech.length);
  console.log('  查询结果:', JSON.stringify(tech));
  
  console.log('\n测试 2: 用 db.exec 来查询');
  const db = getDb();
  const result = db.exec(`SELECT * FROM technicians WHERE id = ${id1}`);
  console.log('  exec 结果:', JSON.stringify(result));
  
  console.log('\n测试 3: 调用 OrderService.create');
  try {
    const order = OrderService.create({
      customerName: '测试客户',
      customerPhone: '123456789',
      customerAddress: '测试地址',
      serviceType: '空调维修',
      description: '测试描述',
      scheduledStartTime: '2026-06-19T10:00:00.000Z',
      scheduledEndTime: '2026-06-19T12:00:00.000Z',
      createdBy: 1,
      createdByName: '测试员',
    });
    console.log('  创建成功!');
    console.log('  订单:', JSON.stringify(order, null, 2));
  } catch (e: any) {
    console.log('  创建失败:', e.message);
    console.log('  栈:', e.stack);
  }
  
  console.log('\n测试 4: 直接查询 work_orders 表');
  const orders = query('SELECT * FROM work_orders');
  console.log('  工单数量:', orders.length);
  if (orders.length > 0) {
    console.log('  第一张工单:', JSON.stringify(orders[0], null, 2));
  }
  
  console.log('\n测试 5: 用 JOIN 查询工单');
  const ordersWithJoin = query(`
    SELECT wo.*, t.name as technician_name, u.name as created_by_name
    FROM work_orders wo
    LEFT JOIN technicians t ON wo.technician_id = t.id
    LEFT JOIN users u ON wo.created_by = u.id
  `);
  console.log('  JOIN 查询结果数量:', ordersWithJoin.length);
  if (ordersWithJoin.length > 0) {
    console.log('  第一条:', JSON.stringify(ordersWithJoin[0], null, 2));
  }
  
  console.log('\n测试完成!');
}

testOrderService().catch(console.error);
