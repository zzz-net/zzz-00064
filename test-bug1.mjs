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

async function testBug1() {
  console.log('=== Bug 1 复现：同一技师重叠时段确认两张工单 ===\n');

  try {
    console.log('1. 登录 admin');
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });

    console.log('\n2. 创建工单 A（10:00-12:00）');
    const { data: orderA } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '客户A',
        serviceType: '空调维修',
        description: '测试工单A',
        scheduledStartTime: '2026-06-20T10:00:00.000Z',
        scheduledEndTime: '2026-06-20T12:00:00.000Z',
      }),
    });
    console.log('   工单A:', orderA.success ? orderA.data.order_no : orderA.error);
    const orderAId = orderA.data?.id;

    console.log('\n3. 创建工单 B（11:00-13:00，与 A 重叠）');
    const { data: orderB } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '客户B',
        serviceType: '水电维修',
        description: '测试工单B',
        scheduledStartTime: '2026-06-20T11:00:00.000Z',
        scheduledEndTime: '2026-06-20T13:00:00.000Z',
      }),
    });
    console.log('   工单B:', orderB.success ? orderB.data.order_no : orderB.error);
    const orderBId = orderB.data?.id;

    if (!orderAId || !orderBId) {
      console.log('\n❌ 工单创建失败，无法继续测试');
      return;
    }

    console.log('\n4. 分配工单 A 给技师 1（李师傅）');
    const { data: assignA } = await apiRequest(`/orders/${orderAId}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 1 }),
    });
    console.log('   分配A:', assignA.success ? '成功 - ' + assignA.data.status : '失败 - ' + assignA.error);

    console.log('\n5. 分配工单 B 给技师 1（李师傅）- 应该失败（时段重叠）');
    const { data: assignB } = await apiRequest(`/orders/${orderBId}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 1 }),
    });
    console.log('   分配B:', assignB.success ? '⚠️ 成功（可能有问题）' : '✅ 失败（预期）');
    console.log('   错误信息:', assignB.error || '无');

    // 如果分配 B 失败了（因为重叠检测），那我们用强制派单来创建一个重叠的已分配工单
    if (!assignB.success) {
      console.log('\n6. 使用强制派单将工单 B 也分配给技师 1（制造重叠）');
      const { data: forceB } = await apiRequest(`/orders/${orderBId}/force-assign`, {
        method: 'PUT',
        body: JSON.stringify({ technicianId: 1, reason: '测试重叠确认' }),
      });
      console.log('   强制派单B:', forceB.success ? '成功 - ' + forceB.data.status : '失败 - ' + forceB.error);
    }

    console.log('\n7. 确认工单 A');
    const { data: confirmA } = await apiRequest(`/orders/${orderAId}/confirm`, {
      method: 'PUT',
    });
    console.log('   确认A:', confirmA.success ? '成功 - ' + confirmA.data.status : '失败 - ' + confirmA.error);

    console.log('\n8. 确认工单 B - 应该失败（与已确认的 A 重叠）');
    const { data: confirmB } = await apiRequest(`/orders/${orderBId}/confirm`, {
      method: 'PUT',
    });
    console.log('   确认B:', confirmB.success ? '⚠️ 成功（BUG！重叠确认）' : '✅ 失败（预期）');
    console.log('   错误信息:', confirmB.error || '无');

    if (confirmB.success) {
      console.log('\n❌ BUG 确认：同一技师在重叠时段可以确认两张工单！');
    } else {
      console.log('\n✅ Bug 1 不存在，确认时的重叠检测正常');
    }

    console.log('\n9. 检查两张工单的最终状态');
    const { data: detailA } = await apiRequest(`/orders/${orderAId}`);
    const { data: detailB } = await apiRequest(`/orders/${orderBId}`);
    console.log('   工单A状态:', detailA.data?.status);
    console.log('   工单B状态:', detailB.data?.status);
    console.log('   工单A技师:', detailA.data?.technician_name);
    console.log('   工单B技师:', detailB.data?.technician_name);

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    console.error(error.stack);
  }
}

testBug1();
