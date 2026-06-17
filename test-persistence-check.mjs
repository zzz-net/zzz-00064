import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let cookie = '';

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookie = setCookie.split(';')[0];
  }

  const data = await response.json();
  return { response, data };
}

async function captureState(label) {
  console.log(`\n--- ${label} ---`);

  const { data: orders } = await apiRequest('/orders?limit=50');
  console.log(`工单总数: ${orders.data?.total || 0}`);
  const orderList = orders.data?.orders || [];

  const bug1Orders = orderList.filter(o => o.customer_name?.includes('重叠测试'));
  console.log(`Bug1 测试工单: ${bug1Orders.length} 张`);
  bug1Orders.forEach(o => {
    console.log(`  - ${o.order_no} | ${o.status} | ${o.technician_name || '未分配'}`);
  });

  const bug2Order = orderList.find(o => o.customer_name?.includes('审批测试'));
  if (bug2Order) {
    console.log(`Bug2 测试工单: ${bug2Order.order_no} | ${bug2Order.status} | ${bug2Order.technician_name || '未分配'}`);
  }

  const { data: approvals } = await apiRequest('/approvals');
  console.log(`审批记录总数: ${approvals.data?.length || 0}`);
  const forceAssignApproval = approvals.data?.find(a => a.order_no === bug2Order?.order_no);
  if (forceAssignApproval) {
    console.log(`  Bug2 审批: ${forceAssignApproval.status} | 目标技师ID: ${forceAssignApproval.target_technician_id}`);
  }

  const { data: conflicts } = await apiRequest('/conflicts');
  console.log(`冲突记录: ${conflicts.data?.length || 0} 条`);

  const { data: technicians } = await apiRequest('/technicians');
  console.log(`技师数量: ${technicians.data?.length || 0}`);

  return { orderList, approvals, conflicts, technicians };
}

async function main() {
  console.log('=== 数据持久化验证 ===\n');

  await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });

  const before = await captureState('重启前状态');

  console.log('\n请重启服务器后再次运行此脚本验证');
  console.log('或者使用 --check 参数仅检查当前状态');
}

main();
