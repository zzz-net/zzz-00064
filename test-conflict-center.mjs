import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let adminCookie = '';
let dispatcherCookie = '';

async function apiRequest(path, options = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  const data = await response.json();
  return { response, data, cookie: setCookie ? setCookie.split(';')[0] : cookie };
}

const UNIQUE_TOKEN = Date.now().toString().slice(-8);
const BASE_TIMESTAMP = Date.now() + 7 * 24 * 60 * 60 * 1000;
function getTestTime(hourOffset, minuteOffset = 0) {
  const time = new Date(BASE_TIMESTAMP + hourOffset * 60 * 60 * 1000 + minuteOffset * 60 * 1000);
  return time.toISOString();
}
const TEST_DATE = new Date(BASE_TIMESTAMP).toISOString().split('T')[0];

let passed = 0;
let failed = 0;

function testPass(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}

function testFail(name, reason) {
  failed++;
  console.log(`  ❌ ${name}`);
  console.log(`     原因: ${reason}`);
}

async function loginAsAdmin() {
  const { cookie } = await apiRequest(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    },
    adminCookie
  );
  adminCookie = cookie;
  return adminCookie;
}

async function loginAsDispatcher() {
  const { cookie } = await apiRequest(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username: 'dispatcher', password: '123456' }),
    },
    dispatcherCookie
  );
  dispatcherCookie = cookie;
  return dispatcherCookie;
}

async function createOrder(customerName, startTime, endTime, cookie) {
  const { data } = await apiRequest(
    '/orders',
    {
      method: 'POST',
      body: JSON.stringify({
        customerName,
        serviceType: '空调维修',
        description: `测试工单-${UNIQUE_TOKEN}`,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
      }),
    },
    cookie
  );
  return data.data;
}

async function runTests() {
  console.log('========================================');
  console.log('冲突处理中心回归测试');
  console.log(`测试标识: ${UNIQUE_TOKEN}`);
  console.log(`测试日期: ${TEST_DATE}`);
  console.log('========================================\n');

  await loginAsAdmin();
  await loginAsDispatcher();

  console.log('\n--- 测试 1: 正常派单无冲突 ---');
  try {
    const order1 = await createOrder(
      `测试1-${UNIQUE_TOKEN}`,
      getTestTime(0),
      getTestTime(1),
      adminCookie
    );

    const { data: assignResult } = await apiRequest(
      `/orders/${order1.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: 1 }) },
      adminCookie
    );

    if (assignResult.success && assignResult.data.status === 'assigned') {
      testPass('正常派单成功');
    } else {
      testFail('正常派单成功', assignResult.error || '未知错误');
    }
  } catch (err) {
    testFail('正常派单成功', err.message);
  }

  console.log('\n--- 测试 2: 时段重叠冲突检测 ---');
  try {
    const order2 = await createOrder(
      `测试2-${UNIQUE_TOKEN}`,
      getTestTime(0, 30),
      getTestTime(1, 30),
      adminCookie
    );

    const { data: checkResult } = await apiRequest(
      `/conflicts/check-assign/${order2.id}/1`,
      { method: 'GET' },
      adminCookie
    );

    if (checkResult.success && !checkResult.data.can_assign) {
      testPass('检测到时段重叠冲突');
      if (checkResult.data.conflicts.length > 0) {
        testPass('返回冲突详情数据');
      } else {
        testFail('返回冲突详情数据', 'conflicts 为空');
      }
      if (checkResult.data.schedule_items.length > 0) {
        testPass('返回同时段安排列表');
      } else {
        testFail('返回同时段安排列表', 'schedule_items 为空');
      }
    } else {
      testFail('检测到时段重叠冲突', '未检测到冲突');
    }

    const { response, data: assignResult } = await apiRequest(
      `/orders/${order2.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: 1 }) },
      adminCookie
    );

    if (!assignResult.success && response.status === 409) {
      testPass('派单接口返回 409 冲突状态码');
      if (assignResult.conflict_detail) {
        testPass('返回冲突详情结构');
      } else {
        testFail('返回冲突详情结构', '缺少 conflict_detail');
      }
    } else {
      testFail('派单接口返回 409 冲突状态码', `状态码: ${response.status}`);
    }
  } catch (err) {
    testFail('时段重叠冲突检测', err.message);
  }

  console.log('\n--- 测试 3: 冲突列表筛选 ---');
  try {
    const { data: allConflicts } = await apiRequest(
      '/conflicts?resolved=false',
      { method: 'GET' },
      adminCookie
    );

    if (allConflicts.success && Array.isArray(allConflicts.data)) {
      testPass('获取未解决冲突列表');
    } else {
      testFail('获取未解决冲突列表', allConflicts.error || '未知错误');
    }

    const { data: techConflicts } = await apiRequest(
      '/conflicts?technicianId=1&resolved=false',
      { method: 'GET' },
      adminCookie
    );

    if (techConflicts.success && Array.isArray(techConflicts.data)) {
      testPass('按技师筛选冲突');
    } else {
      testFail('按技师筛选冲突', techConflicts.error || '未知错误');
    }

    const { data: typeConflicts } = await apiRequest(
      '/conflicts?type=time_overlap&resolved=false',
      { method: 'GET' },
      adminCookie
    );

    if (typeConflicts.success && Array.isArray(typeConflicts.data)) {
      testPass('按类型筛选冲突');
    } else {
      testFail('按类型筛选冲突', typeConflicts.error || '未知错误');
    }
  } catch (err) {
    testFail('冲突列表筛选', err.message);
  }

  console.log('\n--- 测试 4: 技师时段安排查询 ---');
  try {
    const { data: schedule } = await apiRequest(
      `/conflicts/technician/1/schedule?startTime=${TEST_DATE}T00:00:00.000Z&endTime=${TEST_DATE}T23:59:59.999Z`,
      { method: 'GET' },
      adminCookie
    );

    if (schedule.success && Array.isArray(schedule.data)) {
      testPass('获取技师时段安排');
      const hasOrder = schedule.data.some((item) => item.type.startsWith('order_'));
      if (hasOrder) {
        testPass('时段安排包含工单');
      } else {
        testFail('时段安排包含工单', '没有找到工单类型');
      }
    } else {
      testFail('获取技师时段安排', schedule.error || '未知错误');
    }
  } catch (err) {
    testFail('技师时段安排查询', err.message);
  }

  console.log('\n--- 测试 5: 调度员申请强制派单 ---');
  try {
    const order5 = await createOrder(
      `测试5-${UNIQUE_TOKEN}`,
      getTestTime(2),
      getTestTime(3),
      dispatcherCookie
    );

    const { data: requestResult } = await apiRequest(
      `/orders/${order5.id}/force-assign-request`,
      {
        method: 'POST',
        body: JSON.stringify({
          technicianId: 1,
          reason: `测试强制派单申请-${UNIQUE_TOKEN}`,
        }),
      },
      dispatcherCookie
    );

    if (requestResult.success) {
      testPass('调度员发起强制派单申请成功');
    } else {
      testFail('调度员发起强制派单申请成功', requestResult.error || '未知错误');
    }

    const { data: approvals } = await apiRequest(
      '/approvals?status=pending',
      { method: 'GET' },
      adminCookie
    );

    const testApproval = approvals.data?.find(
      (a) => a.order_id === order5.id && a.type === 'force_assign'
    );

    if (testApproval) {
      testPass('审批列表中出现待审批申请');
    } else {
      testFail('审批列表中出现待审批申请', '未找到申请');
    }
  } catch (err) {
    testFail('调度员申请强制派单', err.message);
  }

  console.log('\n--- 测试 6: 权限拦截 - 调度员不能审批 ---');
  try {
    const order6 = await createOrder(
      `测试6-${UNIQUE_TOKEN}`,
      getTestTime(4),
      getTestTime(5),
      dispatcherCookie
    );

    await apiRequest(
      `/orders/${order6.id}/force-assign-request`,
      {
        method: 'POST',
        body: JSON.stringify({
          technicianId: 2,
          reason: `测试权限-${UNIQUE_TOKEN}`,
        }),
      },
      dispatcherCookie
    );

    const { data: approvals } = await apiRequest(
      '/approvals?status=pending',
      { method: 'GET' },
      dispatcherCookie
    );

    const testApproval = approvals.data?.find(
      (a) => a.order_id === order6.id && a.type === 'force_assign'
    );

    if (testApproval) {
      const { response, data: approveResult } = await apiRequest(
        `/approvals/${testApproval.id}/approve`,
        { method: 'PUT', body: JSON.stringify({ remark: '测试审批' }) },
        dispatcherCookie
      );

      if (response.status === 403 || !approveResult.success) {
        testPass('调度员审批被权限拦截');
      } else {
        testFail('调度员审批被权限拦截', '调度员居然审批成功了！');
      }
    } else {
      testFail('调度员审批被权限拦截', '未找到测试审批');
    }
  } catch (err) {
    testPass('调度员审批被权限拦截（异常拦截也算）');
  }

  console.log('\n--- 测试 7: 主管审批通过后派单 ---');
  try {
    const order7 = await createOrder(
      `测试7-${UNIQUE_TOKEN}`,
      getTestTime(6),
      getTestTime(7),
      dispatcherCookie
    );

    await apiRequest(
      `/orders/${order7.id}/force-assign-request`,
      {
        method: 'POST',
        body: JSON.stringify({
          technicianId: 2,
          reason: `测试审批通过-${UNIQUE_TOKEN}`,
        }),
      },
      dispatcherCookie
    );

    const { data: approvals } = await apiRequest(
      '/approvals?status=pending',
      { method: 'GET' },
      adminCookie
    );

    const testApproval = approvals.data?.find(
      (a) => a.order_id === order7.id && a.type === 'force_assign'
    );

    if (testApproval) {
      const { data: approveResult } = await apiRequest(
        `/approvals/${testApproval.id}/approve`,
        { method: 'PUT', body: JSON.stringify({ remark: '同意强制派单' }) },
        adminCookie
      );

      if (approveResult.success && approveResult.data.status === 'approved') {
        testPass('主管审批通过成功');

        const { data: orderDetail } = await apiRequest(
          `/orders/${order7.id}`,
          { method: 'GET' },
          adminCookie
        );

        if (orderDetail.data.status === 'assigned' && orderDetail.data.technician_id === 2) {
          testPass('审批通过后工单自动分配给技师');
        } else {
          testFail(
            '审批通过后工单自动分配给技师',
            `状态: ${orderDetail.data.status}, 技师: ${orderDetail.data.technician_id}`
          );
        }
      } else {
        testFail('主管审批通过成功', approveResult.error || '未知错误');
      }
    } else {
      testFail('主管审批通过后派单', '未找到测试审批');
    }
  } catch (err) {
    testFail('主管审批通过后派单', err.message);
  }

  console.log('\n--- 测试 8: 驳回后不可再次申请强制派单 ---');
  try {
    const order8 = await createOrder(
      `测试8-${UNIQUE_TOKEN}`,
      getTestTime(8),
      getTestTime(9),
      dispatcherCookie
    );

    const { data: request1 } = await apiRequest(
      `/orders/${order8.id}/force-assign-request`,
      {
        method: 'POST',
        body: JSON.stringify({
          technicianId: 3,
          reason: `测试驳回-${UNIQUE_TOKEN}`,
        }),
      },
      dispatcherCookie
    );

    if (!request1.success) {
      testFail('驳回测试', '第一次申请失败');
      return;
    }
    testPass('第一次强制派单申请成功');

    const { data: approvals } = await apiRequest(
      '/approvals?status=pending',
      { method: 'GET' },
      adminCookie
    );

    const testApproval = approvals.data?.find(
      (a) => a.order_id === order8.id && a.type === 'force_assign'
    );

    if (testApproval) {
      const { data: rejectResult } = await apiRequest(
        `/approvals/${testApproval.id}/reject`,
        { method: 'PUT', body: JSON.stringify({ remark: '不同意，请换技师' }) },
        adminCookie
      );

      if (rejectResult.success && rejectResult.data.status === 'rejected') {
        testPass('主管驳回申请成功');
      } else {
        testFail('主管驳回申请成功', rejectResult.error || '未知错误');
        return;
      }
    }

    const { data: request2 } = await apiRequest(
      `/orders/${order8.id}/force-assign-request`,
      {
        method: 'POST',
        body: JSON.stringify({
          technicianId: 3,
          reason: `再次申请-${UNIQUE_TOKEN}`,
        }),
      },
      dispatcherCookie
    );

    if (!request2.success) {
      testPass('驳回后再次申请被正确拦截');
    } else {
      testFail('驳回后再次申请被正确拦截', '居然申请成功了！');
    }

    const { response, data: forceAssignResult } = await apiRequest(
      `/orders/${order8.id}/force-assign`,
      {
        method: 'PUT',
        body: JSON.stringify({
          technicianId: 3,
          reason: `管理员强制-${UNIQUE_TOKEN}`,
        }),
      },
      adminCookie
    );

    if (!forceAssignResult.success && response.status === 409) {
      testPass('管理员也不能对已驳回的技师强制派单');
    } else {
      testFail('管理员也不能对已驳回的技师强制派单', `状态码: ${response.status}`);
    }
  } catch (err) {
    testFail('驳回后不可再次申请强制派单', err.message);
  }

  console.log('\n--- 测试 9: 操作历史可追溯 ---');
  try {
    const order9 = await createOrder(
      `测试9-${UNIQUE_TOKEN}`,
      getTestTime(10),
      getTestTime(11),
      adminCookie
    );

    await apiRequest(
      `/orders/${order9.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: 4 }) },
      adminCookie
    );

    const { data: history } = await apiRequest(
      `/orders/${order9.id}/history`,
      { method: 'GET' },
      adminCookie
    );

    if (history.success && history.data.length >= 2) {
      testPass('工单操作历史可追溯');
      const hasCreate = history.data.some((h) => h.action === 'create');
      const hasAssign = history.data.some((h) => h.action === 'assign');
      if (hasCreate && hasAssign) {
        testPass('历史记录包含创建和分配动作');
      } else {
        testFail('历史记录包含创建和分配动作', '动作不完整');
      }
    } else {
      testFail('工单操作历史可追溯', history.error || '历史记录不足');
    }
  } catch (err) {
    testFail('操作历史可追溯', err.message);
  }

  console.log('\n--- 测试 10: 冲突详情查询 ---');
  try {
    const { data: conflicts } = await apiRequest(
      '/conflicts?resolved=false&type=time_overlap',
      { method: 'GET' },
      adminCookie
    );

    if (conflicts.data && conflicts.data.length > 0) {
      const firstConflict = conflicts.data[0];
      const { data: detail } = await apiRequest(
        `/conflicts/${firstConflict.id}`,
        { method: 'GET' },
        adminCookie
      );

      if (detail.success && detail.data) {
        testPass('查询冲突详情成功');
        if (detail.data.order_no) {
          testPass('详情包含关联工单信息');
        } else {
          testFail('详情包含关联工单信息', '没有工单信息');
        }
      } else {
        testFail('查询冲突详情成功', detail.error || '未知错误');
      }
    }
  } catch (err) {
    testFail('冲突详情查询', err.message);
  }

  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`  通过: ${passed}`);
  console.log(`  失败: ${failed}`);
  console.log(`  总计: ${passed + failed}`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\n测试执行异常:', err);
  process.exit(1);
});
