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

async function testBug1_OverlapConfirm() {
  console.log('\n=== Bug 1 回归测试：同一技师重叠时段确认工单 ===\n');
  let pass = true;

  try {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });

    console.log('1. 创建两张重叠时段的工单');
    const { data: orderA } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '重叠测试-客户A',
        serviceType: '空调维修',
        description: 'Bug1 测试A',
        scheduledStartTime: '2026-06-22T10:00:00.000Z',
        scheduledEndTime: '2026-06-22T12:00:00.000Z',
      }),
    });
    const { data: orderB } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '重叠测试-客户B',
        serviceType: '水电维修',
        description: 'Bug1 测试B',
        scheduledStartTime: '2026-06-22T11:00:00.000Z',
        scheduledEndTime: '2026-06-22T13:00:00.000Z',
      }),
    });
    const orderAId = orderA.data.id;
    const orderBId = orderB.data.id;
    console.log('   工单A:', orderA.data.order_no);
    console.log('   工单B:', orderB.data.order_no);

    console.log('\n2. 用强制派单把两张都分配给技师1（李师傅）');
    await apiRequest(`/orders/${orderAId}/force-assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 1, reason: 'Bug1 测试' }),
    });
    await apiRequest(`/orders/${orderBId}/force-assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 1, reason: 'Bug1 测试' }),
    });
    console.log('   两张工单都已强制分配给李师傅（assigned 状态）');

    console.log('\n3. 确认工单 A - 应该成功（没有已确认的重叠工单）');
    const { data: confirmA } = await apiRequest(`/orders/${orderAId}/confirm`, {
      method: 'PUT',
    });
    if (confirmA.success && confirmA.data.status === 'confirmed') {
      console.log('   ✅ 工单A确认成功，状态:', confirmA.data.status);
    } else {
      console.log('   ❌ 工单A确认失败:', confirmA.error);
      pass = false;
    }

    console.log('\n4. 确认工单 B - 应该失败（与已确认的A重叠）');
    const { data: confirmB } = await apiRequest(`/orders/${orderBId}/confirm`, {
      method: 'PUT',
    });
    if (!confirmB.success) {
      console.log('   ✅ 工单B确认被正确拦截，错误:', confirmB.error);
    } else {
      console.log('   ❌ Bug复现！工单B也确认成功了，状态:', confirmB.data.status);
      pass = false;
    }

    console.log('\n5. 验证最终状态');
    const { data: detailA } = await apiRequest(`/orders/${orderAId}`);
    const { data: detailB } = await apiRequest(`/orders/${orderBId}`);
    console.log('   工单A状态:', detailA.data?.status);
    console.log('   工单B状态:', detailB.data?.status);

    if (detailA.data?.status === 'confirmed' && detailB.data?.status === 'assigned') {
      console.log('\n   ✅ Bug 1 修复验证通过：第一张能确认，第二张被拦截');
    } else {
      console.log('\n   ❌ Bug 1 修复验证失败');
      pass = false;
    }

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    pass = false;
  }

  return pass;
}

async function testBug2_ForceAssignApproval() {
  console.log('\n=== Bug 2 回归测试：强制派单审批通过后工单状态更新 ===\n');
  let pass = true;

  try {
    console.log('1. 登录调度员 dispatcher');
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'dispatcher', password: '123456' }),
    });

    console.log('\n2. 创建一张新工单');
    const { data: order } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '审批测试-客户',
        serviceType: '家电维修',
        description: 'Bug2 测试',
        scheduledStartTime: '2026-06-23T14:00:00.000Z',
        scheduledEndTime: '2026-06-23T16:00:00.000Z',
      }),
    });
    const orderId = order.data.id;
    console.log('   工单:', order.data.order_no);
    console.log('   初始状态:', order.data.status);
    console.log('   初始技师:', order.data.technician_name || '无');

    console.log('\n3. 调度员提交强制派单申请（给技师2 - 王师傅）');
    const { data: request } = await apiRequest(`/orders/${orderId}/force-assign-request`, {
      method: 'POST',
      body: JSON.stringify({ technicianId: 2, reason: '紧急工单，需要强制派给王师傅' }),
    });
    console.log('   申请提交:', request.success ? '成功' : '失败');

    console.log('\n4. 查询审批记录，验证目标技师ID已保存');
    const { data: approvalsBefore } = await apiRequest('/approvals?status=pending&type=force_assign');
    const approval = approvalsBefore.data?.find(a => a.order_id === orderId);
    if (approval) {
      console.log('   审批ID:', approval.id);
      console.log('   目标技师ID:', approval.target_technician_id);
      if (approval.target_technician_id === 2) {
        console.log('   ✅ 目标技师ID正确保存');
      } else {
        console.log('   ❌ 目标技师ID不对');
        pass = false;
      }
    } else {
      console.log('   ❌ 没找到审批记录');
      pass = false;
    }
    const approvalId = approval?.id;

    console.log('\n5. 切换到 admin 账号审批通过');
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });

    const { data: approveResult } = await apiRequest(`/approvals/${approvalId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ remark: '同意，紧急处理' }),
    });
    console.log('   审批结果:', approveResult.success ? '成功' : '失败');

    console.log('\n6. 验证审批后工单状态');
    const { data: orderAfter } = await apiRequest(`/orders/${orderId}`);
    console.log('   工单状态:', orderAfter.data?.status);
    console.log('   负责技师:', orderAfter.data?.technician_name);
    console.log('   技师ID:', orderAfter.data?.technician_id);

    if (orderAfter.data?.status === 'assigned' &&
        orderAfter.data?.technician_id === 2 &&
        orderAfter.data?.technician_name === '王师傅') {
      console.log('\n   ✅ Bug 2 修复验证通过：审批通过后工单状态和技师分配都正确');
    } else {
      console.log('\n   ❌ Bug 2 修复验证失败：状态或技师不正确');
      pass = false;
    }

    console.log('\n7. 验证工单历史记录');
    const { data: history } = await apiRequest(`/orders/${orderId}/history`);
    console.log('   历史记录数量:', history.data?.length || 0);
    history.data?.forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.action} - ${h.operator_name} - ${h.remark || ''}`);
    });

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    console.error(error.stack);
    pass = false;
  }

  return pass;
}

async function testBug1_AssignOverlapStillWorks() {
  console.log('\n=== 验证：正常分配的重叠检测仍然有效 ===\n');
  let pass = true;

  try {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });

    console.log('1. 创建两张重叠工单');
    const { data: orderA } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '分配重叠测试A',
        serviceType: '空调维修',
        description: '分配重叠测试',
        scheduledStartTime: '2026-06-24T09:00:00.000Z',
        scheduledEndTime: '2026-06-24T11:00:00.000Z',
      }),
    });
    const { data: orderB } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '分配重叠测试B',
        serviceType: '水电维修',
        description: '分配重叠测试',
        scheduledStartTime: '2026-06-24T10:00:00.000Z',
        scheduledEndTime: '2026-06-24T12:00:00.000Z',
      }),
    });

    console.log('\n2. 正常分配工单A给技师3（赵师傅）- 应该成功');
    const { data: assignA } = await apiRequest(`/orders/${orderA.data.id}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 3 }),
    });
    if (assignA.success) {
      console.log('   ✅ 分配A成功');
    } else {
      console.log('   ❌ 分配A失败:', assignA.error);
      pass = false;
    }

    console.log('\n3. 正常分配工单B也给技师3 - 应该失败（时段重叠）');
    const { data: assignB } = await apiRequest(`/orders/${orderB.data.id}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 3 }),
    });
    if (!assignB.success) {
      console.log('   ✅ 分配B被正确拦截:', assignB.error);
    } else {
      console.log('   ❌ 分配B也成功了，重叠检测失效');
      pass = false;
    }

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    pass = false;
  }

  return pass;
}

async function runAllTests() {
  console.log('========================================');
  console.log('  上门工单调度系统 - Bug 修复回归测试');
  console.log('========================================');

  const results = [];

  results.push(await testBug1_OverlapConfirm());
  results.push(await testBug2_ForceAssignApproval());
  results.push(await testBug1_AssignOverlapStillWorks());

  console.log('\n========================================');
  console.log('  测试总结');
  console.log('========================================');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`通过: ${passed}/${total}`);

  if (passed === total) {
    console.log('\n✅ 全部测试通过！');
    process.exit(0);
  } else {
    console.log('\n❌ 有测试失败');
    process.exit(1);
  }
}

runAllTests();
