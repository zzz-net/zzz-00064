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

async function main() {
  await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });

  const { data: orders } = await apiRequest('/orders?limit=200');
  console.log('李师傅(technician_id=1) 已确认/进行中的工单：');
  orders.data
    .filter(o => o.technician_id === 1 && ['confirmed', 'in_progress', 'assigned'].includes(o.status))
    .forEach(o => console.log(`  ${o.order_no} ${o.status} ${o.scheduled_start_time} ~ ${o.scheduled_end_time} ${o.customer_name}`));

  console.log('\n赵师傅(technician_id=3) 已确认/进行中的工单：');
  orders.data
    .filter(o => o.technician_id === 3 && ['confirmed', 'in_progress', 'assigned'].includes(o.status))
    .forEach(o => console.log(`  ${o.order_no} ${o.status} ${o.scheduled_start_time} ~ ${o.scheduled_end_time} ${o.customer_name}`));
}

main();
