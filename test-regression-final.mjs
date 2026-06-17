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

const UNIQUE_TOKEN = Date.now().toString().slice(-8);
console.log(`测试唯一标识: ${UNIQUE_TOKEN}\n`);

async function testBug1_OverlapConfirm() {
  console.log('=== Bug 1 回归测试：同一技师重叠时段确认工单 ===\n');
  let pass = true;

  try {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });

    const DAY1 = '2099-01-15';
    console.log(`1. 创建两张重叠时段的工单（使用隔离日期 ${DAY1}）`);
    const { data: orderA } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: `BUG1-A-${UNIQUE_TOKEN}`,
        serviceType: '空调维修',
        description: 'Bug1 测试A',
        scheduledStartTime: `${DAY1}T10:00:00.000Z`,
        scheduledEndTime: `${DAY1}T12:00:00.000Z`,
      }),
    });
    const { data: orderB } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: `BUG1-B-${UNIQUE_TOKEN}`,
        serviceType: '水电维修',
        description: 'Bug1 测试B',
        scheduledStartTime: `${DAY1}T11:00:00.000Z`,
        scheduledEndTime: `${DAY1}T13:00:00.000Z`,
      }),
    });
    const orderAId = orderA.data.id;
    const orderBId = orderB.data.id;
    console.log(`   工单A: ${orderA.data.order_no}`);
    console.log(`   工单B: ${orderB.data.order_no}`);

    console.log('\n2. 用强制派单把两张都分配给技师1（李师傅）');
    await apiRequest(`/orders/${orderAId}/force-assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 1, reason: `Bug1 测试-${UNIQUE_TOKEN}` }),
    });
    await apiRequest(`/orders/${orderBId}/force-assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 1, reason: `Bug1 测试-${UNIQUE_TOKEN}` }),
    });
    console.log('   两张工单都已强制分配给李师傅（assigned 状态）');

    console.log('\n3. 确认工单 A - 应该成功（该时段没有已确认/进行中的其他工单）');
    const { data: confirmA } = await apiRequest(`/orders/${orderAId}/confirm`, { method: 'PUT' });
    if (confirmA.success && confirmA.data.status === 'confirmed') {
      console.log(`   ✅ 工单A确认成功，状态: ${confirmA.data.status}`);
    } else {
      console.log(`   ❌ 工单A确认失败: ${confirmA.error}`);
      pass = false;
    }

    console.log('\n4. 确认工单 B - 应该失败（与已确认的A重叠）');
    const { data: confirmB } = await apiRequest(`/orders/${orderBId}/confirm`, { method: 'PUT' });
    if (!confirmB.success) {
      console.log(`   ✅ 工单B被正确拦截: ${confirmB.error}`);
    } else {
      console.log(`   ❌ Bug复现！工单B也确认成功了，状态: ${confirmB.data.status}`);
      pass = false;
    }

    console.log('\n5. 验证最终状态');
    const { data: detailA } = await apiRequest(`/orders/${orderAId}`);
    const { data: detailB } = await apiRequest(`/orders/${orderBId}`);
    console.log(`   工单A状态: ${detailA.data?.status} 技师: ${detailA.data?.technician_name}`);
    console.log(`   工单B状态: ${detailB.data?.status} 技师: ${detailB.data?.technician_name}`);

    if (detailA.data?.status === 'confirmed' && detailB.data?.status === 'assigned') {
      console.log('\n   ✅ Bug 1 修复验证通过：第一张能确认，第二张被拦截');
    } else {
      console.log('\n   ❌ Bug 1 修复验证失败');
      pass = false;
    }

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    console.error(error.stack);
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

    const DAY2 = '2099-02-20';
    console.log(`\n2. 创建一张新工单（隔离日期 ${DAY2}）`);
    const { data: order } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: `BUG2-${UNIQUE_TOKEN}`,
        serviceType: '家电维修',
        description: 'Bug2 测试',
        scheduledStartTime: `${DAY2}T14:00:00.000Z`,
        scheduledEndTime: `${DAY2}T16:00:00.000Z`,
      }),
    });
    const orderId = order.data.id;
    console.log(`   工单: ${order.data.order_no}`);
    console.log(`   初始状态: ${order.data.status}`);
    console.log(`   初始技师: ${order.data.technician_name || '无'}`);

    console.log('\n3. 调度员提交强制派单申请（给技师2 - 王师傅）');
    const { data: request } = await apiRequest(`/orders/${orderId}/force-assign-request`, {
      method: 'POST',
      body: JSON.stringify({ technicianId: 2, reason: `紧急工单 Bug2测试-${UNIQUE_TOKEN}` }),
    });
    console.log(`   申请提交: ${request.success ? '成功' : '失败'}`);

    console.log('\n4. 查询审批记录，验证目标技师ID已保存');
    const { data: approvalsBefore } = await apiRequest('/approvals?status=pending&type=force_assign');
    const approval = approvalsBefore.data?.find(a => a.order_id === orderId);
    if (approval) {
      console.log(`   审批ID: ${approval.id}`);
      console.log(`   目标技师ID: ${approval.target_technician_id}`);
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
      body: JSON.stringify({ remark: `同意 Bug2测试-${UNIQUE_TOKEN}` }),
    });
    console.log(`   审批结果: ${approveResult.success ? '成功' : '失败'}`);

    console.log('\n6. 验证审批后工单状态');
    const { data: orderAfter } = await apiRequest(`/orders/${orderId}`);
    console.log(`   工单状态: ${orderAfter.data?.status}`);
    console.log(`   负责技师: ${orderAfter.data?.technician_name}`);
    console.log(`   技师ID: ${orderAfter.data?.technician_id}`);

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
    console.log(`   历史记录数量: ${history.data?.length || 0}`);
    history.data?.forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.action} - ${h.operator_name} - ${h.remark || ''}`);
    });
    if (history.data?.length < 3) {
      console.log('   ❌ 历史记录不完整');
      pass = false;
    }

    console.log('\n8. 验证工单可以继续流转（确认 → 开始 → 完成）');
    const { data: confirm } = await apiRequest(`/orders/${orderId}/confirm`, { method: 'PUT' });
    console.log(`   确认: ${confirm.success ? '成功 - ' + confirm.data.status : '失败 - ' + confirm.error}`);
    const { data: start } = confirm.success ? await apiRequest(`/orders/${orderId}/start`, { method: 'PUT' }) : { data: {} };
    if (confirm.success) console.log(`   开始服务: ${start.success ? '成功 - ' + start.data.status : '失败 - ' + start.error}`);
    const { data: complete } = start.success ? await apiRequest(`/orders/${orderId}/complete`, { method: 'PUT', body: JSON.stringify({ result: '修复完成 Bug2测试' }) }) : { data: {} };
    if (start.success) console.log(`   完成服务: ${complete.success ? '成功 - ' + complete.data.status : '失败 - ' + complete.error}`);

    if (!complete.success) {
      console.log('   ❌ 工单无法继续流转');
      pass = false;
    } else {
      console.log('   ✅ 工单可以完整流转到 completed 状态');
    }

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    console.error(error.stack);
    pass = false;
  }

  return pass;
}

async function testAssignOverlapStillWorks() {
  console.log('\n=== 回归验证：正常分配的时段重叠检测仍然有效 ===\n');
  let pass = true;

  try {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    });

    const DAY3 = '2099-03-10';
    console.log(`1. 创建两张重叠工单（隔离日期 ${DAY3}）`);
    const { data: orderA } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: `ASSIGN-A-${UNIQUE_TOKEN}`,
        serviceType: '空调维修',
        scheduledStartTime: `${DAY3}T09:00:00.000Z`,
        scheduledEndTime: `${DAY3}T11:00:00.000Z`,
      }),
    });
    const { data: orderB } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: `ASSIGN-B-${UNIQUE_TOKEN}`,
        serviceType: '水电维修',
        scheduledStartTime: `${DAY3}T10:00:00.000Z`,
        scheduledEndTime: `${DAY3}T12:00:00.000Z`,
      }),
    });

    console.log('\n2. 正常分配工单A给技师4（陈师傅）- 应该成功');
    const { data: assignA } = await apiRequest(`/orders/${orderA.data.id}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 4 }),
    });
    if (assignA.success) {
      console.log(`   ✅ 分配A成功，状态: ${assignA.data.status}`);
    } else {
      console.log(`   ❌ 分配A失败: ${assignA.error}`);
      pass = false;
    }

    console.log('\n3. 正常分配工单B也给技师4 - 应该失败（时段重叠）');
    const { data: assignB } = await apiRequest(`/orders/${orderB.data.id}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 4 }),
    });
    if (!assignB.success) {
      console.log(`   ✅ 分配B被正确拦截: ${assignB.error}`);
    } else {
      console.log(`   ❌ 分配B也成功了，重叠检测失效，状态: ${assignB.data.status}`);
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
  results.push(await testAssignOverlapStillWorks());

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
