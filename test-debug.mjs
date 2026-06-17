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

async function test() {
  console.log('登录...');
  const { data: loginData } = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  console.log('登录结果:', loginData.success);

  console.log('\n创建第一张工单...');
  const { data: order1 } = await apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerName: '测试1',
      serviceType: '空调维修',
      scheduledStartTime: '2026-06-19T10:00:00.000Z',
      scheduledEndTime: '2026-06-19T12:00:00.000Z',
    }),
  });
  console.log('第一张:', order1.success, order1.error || order1.data?.order_no);

  console.log('\n创建第二张工单...');
  const { data: order2 } = await apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerName: '测试2',
      serviceType: '水电维修',
      scheduledStartTime: '2026-06-19T14:00:00.000Z',
      scheduledEndTime: '2026-06-19T16:00:00.000Z',
    }),
  });
  console.log('第二张:', order2.success, order2.error || order2.data?.order_no);

  console.log('\n获取工单列表...');
  const { data: list } = await apiRequest('/orders');
  console.log('工单数量:', list.data?.length || 0);
  if (list.data) {
    list.data.forEach(o => console.log('  -', o.order_no, o.status));
  }
}

test().catch(console.error);
