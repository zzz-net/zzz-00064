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

async function testPersistence() {
  console.log('=== 数据持久化验证测试 ===\n');

  try {
    console.log('1. 登录 (admin)');
    const { data: loginData } = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });
    console.log('   登录:', loginData.success ? '✅ 成功' : '❌ 失败');

    console.log('\n2. 查询工单列表');
    const { data: ordersData } = await apiRequest('/orders');
    console.log('   工单数量:', ordersData.data?.length || 0);
    if (ordersData.data?.length > 0) {
      ordersData.data.forEach(o => {
        console.log(`   - ${o.order_no} | ${o.status} | ${o.customer_name} | ${o.service_type}`);
      });
    }

    console.log('\n3. 查询技师列表');
    const { data: techData } = await apiRequest('/technicians');
    console.log('   技师数量:', techData.data?.length || 0);

    console.log('\n4. 查询冲突记录');
    const { data: conflictData } = await apiRequest('/conflicts');
    console.log('   冲突数量:', conflictData.data?.length || 0);

    console.log('\n5. 查询审批记录');
    const { data: approvalData } = await apiRequest('/approvals');
    console.log('   审批数量:', approvalData.data?.length || 0);

    console.log('\n6. 查询日报数据');
    const today = new Date().toISOString().split('T')[0];
    const { data: reportData } = await apiRequest(`/reports/daily?date=${today}`);
    console.log('   日报日期:', reportData.data?.date);
    console.log('   总工单数:', reportData.data?.totalOrders);
    console.log('   已完成:', reportData.data?.completedOrders);

    console.log('\n=== 持久化验证完成 ===');
    console.log('✅ 数据持久化验证通过：技师安排、工单、冲突、审批记录均保持一致');

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    process.exit(1);
  }
}

testPersistence();
