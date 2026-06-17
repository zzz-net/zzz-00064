import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let cookie = '';

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await response.json();
  return { response, data };
}

const TOKEN = '19939265';

async function main() {
  console.log('=== 重启后数据持久化验证（标识: ' + TOKEN + '）===\n');

  await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });

  const { data: orders } = await apiRequest('/orders?limit=200');
  const myOrders = orders.data?.filter(o => (o.customer_name || '').includes(TOKEN)) || [];
  console.log(`找到测试工单 ${myOrders.length} 张（期望 ≥ 5）`);

  const bug1A = myOrders.find(o => o.customer_name.includes('BUG1-A'));
  const bug1B = myOrders.find(o => o.customer_name.includes('BUG1-B'));
  const bug2  = myOrders.find(o => o.customer_name.includes('BUG2-'));
  const assignA = myOrders.find(o => o.customer_name.includes('ASSIGN-A'));
  const assignB = myOrders.find(o => o.customer_name.includes('ASSIGN-B'));

  let allOk = true;

  function check(label, actual, expected) {
    const ok = actual === expected;
    console.log(`${ok ? '✅' : '❌'} ${label}: 实际=${actual} 期望=${expected}`);
    if (!ok) allOk = false;
  }

  console.log('\n--- Bug 1 工单（重叠时段确认）---');
  check('BUG1-A 状态', bug1A?.status, 'confirmed');
  check('BUG1-A 技师', bug1A?.technician_name, '李师傅');
  check('BUG1-B 状态', bug1B?.status, 'assigned');
  check('BUG1-B 技师', bug1B?.technician_name, '李师傅');

  console.log('\n--- Bug 2 工单（强制派单审批）---');
  check('BUG2 状态', bug2?.status, 'completed');
  check('BUG2 技师', bug2?.technician_name, '王师傅');

  console.log('\n--- 正常分配重叠验证 ---');
  check('ASSIGN-A 状态', assignA?.status, 'assigned');
  check('ASSIGN-A 技师', assignA?.technician_name, '陈师傅');
  check('ASSIGN-B 状态', assignB?.status, 'pending');
  check('ASSIGN-B 技师', assignB?.technician_name || '未分配', '未分配');

  console.log('\n--- 审批记录 ---');
  const { data: approvals } = await apiRequest('/approvals');
  const bug2Approval = approvals.data?.find(a =>
    a.type === 'force_assign' && a.status === 'approved' && (a.reason || '').includes(TOKEN)
  );
  check('强制派单审批存在', bug2Approval ? '存在' : '不存在', '存在');
  check('审批目标技师ID', bug2Approval?.target_technician_id, 2);

  console.log('\n--- 工单历史记录（BUG2 工单）---');
  if (bug2) {
    const { data: history } = await apiRequest(`/orders/${bug2.id}/history`);
    const actions = history.data?.map(h => h.action) || [];
    console.log(`  历史记录数量: ${actions.length}（期望 ≥ 6）`);
    ['create', 'apply_force_assign', 'force_assign', 'confirm', 'start_progress', 'complete'].forEach(a => {
      const has = actions.includes(a);
      console.log(`  ${has ? '✅' : '❌'} ${a}: ${has ? '存在' : '缺失'}`);
      if (!has) allOk = false;
    });
  }

  console.log('\n========================================');
  console.log(allOk ? '✅ 全部数据持久化验证通过！重启后所有状态、技师分配、审批记录、历史记录都保持一致' : '❌ 有数据丢失');
  process.exit(allOk ? 0 : 1);
}

main();
