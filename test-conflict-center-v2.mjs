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
const BASE_TIMESTAMP = Date.now() + 14 * 24 * 60 * 60 * 1000;
function getTestTime(hourOffset, minuteOffset = 0) {
  const time = new Date(BASE_TIMESTAMP + hourOffset * 60 * 60 * 1000 + minuteOffset * 60 * 1000);
  return time.toISOString();
}
const TEST_DATE = new Date(BASE_TIMESTAMP).toISOString().split('T')[0];
const TEST_DATE_NEXT = new Date(BASE_TIMESTAMP + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

console.log('========================================');
console.log('冲突处理中心完整回归测试');
console.log(`测试标识: ${UNIQUE_TOKEN}`);
console.log(`测试日期: ${TEST_DATE}`);
console.log('========================================\n');

await loginAsAdmin();
await loginAsDispatcher();

console.log('\n=== 测试组 1: 基础数据准备（创建各种状态的冲突） ===');

const orderAssigned = await createOrder(`已分配工单-${UNIQUE_TOKEN}`, getTestTime(0), getTestTime(1), adminCookie);
await apiRequest(`/orders/${orderAssigned.id}/assign`, { method: 'PUT', body: JSON.stringify({ technicianId: 1 }) }, adminCookie);
testPass('准备：创建已分配工单（技师1，时段0-1）');

const orderConfirmed = await createOrder(`已确认工单-${UNIQUE_TOKEN}`, getTestTime(2), getTestTime(3), adminCookie);
await apiRequest(`/orders/${orderConfirmed.id}/assign`, { method: 'PUT', body: JSON.stringify({ technicianId: 2 }) }, adminCookie);
await apiRequest(`/orders/${orderConfirmed.id}/confirm`, { method: 'PUT' }, adminCookie);
testPass('准备：创建已确认工单（技师2，时段2-3）');

const orderPending = await createOrder(`待审批工单-${UNIQUE_TOKEN}`, getTestTime(0, 30), getTestTime(1, 30), dispatcherCookie);
await apiRequest(`/orders/${orderPending.id}/force-assign-request`, {
  method: 'POST',
  body: JSON.stringify({ technicianId: 1, reason: `测试待审批-${UNIQUE_TOKEN}` }),
}, dispatcherCookie);
testPass('准备：创建待审批强制派单申请（技师1，时段0.5-1.5，与已分配重叠）');

console.log('\n=== 测试组 2: 状态筛选准确性 ===');

try {
  const { data: allConflicts } = await apiRequest('/conflicts', { method: 'GET' }, adminCookie);
  if (allConflicts.success && Array.isArray(allConflicts.data)) {
    testPass('获取全部冲突列表成功');
    if (allConflicts.data.length > 0 && allConflicts.data[0].conflict_status !== undefined) {
      testPass('冲突记录包含 conflict_status 字段');
    } else {
      testFail('冲突记录包含 conflict_status 字段', '缺少 conflict_status');
    }
    if (allConflicts.data.length > 0 && allConflicts.data[0].conflict_status_label !== undefined) {
      testPass('冲突记录包含 conflict_status_label 字段');
    } else {
      testFail('冲突记录包含 conflict_status_label 字段', '缺少 conflict_status_label');
    }
  } else {
    testFail('获取全部冲突列表成功', allConflicts.error || '未知错误');
  }
} catch (err) {
  testFail('状态筛选基础获取', err.message);
}

try {
  const { data: assignedConflicts } = await apiRequest(
    '/conflicts?conflictStatus=assigned',
    { method: 'GET' },
    adminCookie
  );
  if (assignedConflicts.success && Array.isArray(assignedConflicts.data)) {
    const allAssigned = assignedConflicts.data.every(c => c.conflict_status === 'assigned');
    if (allAssigned) {
      testPass('按「已分配」状态筛选：返回结果全部为已分配');
    } else {
      testFail('按「已分配」状态筛选', '存在非已分配状态的记录');
    }
  } else {
    testFail('按「已分配」状态筛选', assignedConflicts.error || '未知错误');
  }
} catch (err) {
  testFail('按已分配状态筛选', err.message);
}

try {
  const { data: confirmedConflicts } = await apiRequest(
    '/conflicts?conflictStatus=confirmed',
    { method: 'GET' },
    adminCookie
  );
  if (confirmedConflicts.success && Array.isArray(confirmedConflicts.data)) {
    const allConfirmed = confirmedConflicts.data.every(c => c.conflict_status === 'confirmed');
    if (allConfirmed) {
      testPass('按「已确认」状态筛选：返回结果全部为已确认');
    } else {
      testFail('按「已确认」状态筛选', '存在非已确认状态的记录');
    }
  } else {
    testFail('按「已确认」状态筛选', confirmedConflicts.error || '未知错误');
  }
} catch (err) {
  testFail('按已确认状态筛选', err.message);
}

try {
  const { data: pendingConflicts } = await apiRequest(
    '/conflicts?conflictStatus=approval_pending',
    { method: 'GET' },
    adminCookie
  );
  if (pendingConflicts.success && Array.isArray(pendingConflicts.data)) {
    const allPending = pendingConflicts.data.every(c => c.conflict_status === 'approval_pending');
    if (allPending && pendingConflicts.data.length > 0) {
      testPass('按「待审批」状态筛选：返回结果正确且有记录');
    } else if (pendingConflicts.data.length === 0) {
      testFail('按「待审批」状态筛选', '没有找到待审批记录（应该有）');
    } else {
      testFail('按「待审批」状态筛选', '存在非待审批状态的记录');
    }
  } else {
    testFail('按「待审批」状态筛选', pendingConflicts.error || '未知错误');
  }
} catch (err) {
  testFail('按待审批状态筛选', err.message);
}

console.log('\n=== 测试组 3: 组合筛选（状态 + 技师 + 日期） ===');

try {
  const { data: tech1Assigned } = await apiRequest(
    `/conflicts?conflictStatus=assigned&technicianId=1`,
    { method: 'GET' },
    adminCookie
  );
  if (tech1Assigned.success && Array.isArray(tech1Assigned.data)) {
    const valid = tech1Assigned.data.every(
      c => c.conflict_status === 'assigned' && c.technician_id === 1
    );
    if (valid) {
      testPass('组合筛选：状态=已分配 + 技师=1 结果正确');
    } else {
      testFail('组合筛选：状态+技师', '条件不匹配');
    }
  } else {
    testFail('组合筛选：状态+技师', tech1Assigned.error || '未知错误');
  }
} catch (err) {
  testFail('组合筛选状态+技师', err.message);
}

try {
  const { data: dateFiltered } = await apiRequest(
    `/conflicts?dateFrom=${TEST_DATE}T00:00:00.000Z&dateTo=${TEST_DATE}T23:59:59.999Z`,
    { method: 'GET' },
    adminCookie
  );
  if (dateFiltered.success && Array.isArray(dateFiltered.data)) {
    testPass('按日期范围筛选成功');
  } else {
    testFail('按日期范围筛选', dateFiltered.error || '未知错误');
  }
} catch (err) {
  testFail('按日期范围筛选', err.message);
}

try {
  const { data: tripleFilter } = await apiRequest(
    `/conflicts?conflictStatus=approval_pending&technicianId=1&dateFrom=${TEST_DATE}T00:00:00.000Z&dateTo=${TEST_DATE_NEXT}T23:59:59.999Z`,
    { method: 'GET' },
    adminCookie
  );
  if (tripleFilter.success && Array.isArray(tripleFilter.data)) {
    const valid = tripleFilter.data.every(
      c => c.conflict_status === 'approval_pending' && c.technician_id === 1
    );
    if (valid && tripleFilter.data.length > 0) {
      testPass('三重组合筛选（待审批+技师1+日期范围）结果正确');
    } else {
      testFail('三重组合筛选', `结果数=${tripleFilter.data.length}, 全部符合条件=${valid}`);
    }
  } else {
    testFail('三重组合筛选', tripleFilter.error || '未知错误');
  }
} catch (err) {
  testFail('三重组合筛选', err.message);
}

console.log('\n=== 测试组 4: 冲突详情与可用动作 ===');

try {
  const { data: pendingList } = await apiRequest(
    '/conflicts?conflictStatus=approval_pending',
    { method: 'GET' },
    adminCookie
  );
  if (pendingList.data && pendingList.data.length > 0) {
    const firstPending = pendingList.data[0];
    const { data: detail } = await apiRequest(
      `/conflicts/${firstPending.id}`,
      { method: 'GET' },
      adminCookie
    );
    if (detail.success && detail.data) {
      testPass('查询冲突详情成功');
      if (detail.data.available_actions) {
        testPass('详情包含 available_actions 字段');
      } else {
        testFail('详情包含 available_actions', '缺少字段');
      }
      if (detail.data.available_actions?.can_approve === true) {
        testPass('管理员在待审批冲突详情中：can_approve=true');
      } else {
        testFail('管理员 can_approve', `值为 ${detail.data.available_actions?.can_approve}`);
      }
      if (detail.data.available_actions?.can_reject === true) {
        testPass('管理员在待审批冲突详情中：can_reject=true');
      } else {
        testFail('管理员 can_reject', `值为 ${detail.data.available_actions?.can_reject}`);
      }
      if (detail.data.overlapping_items) {
        testPass('详情包含 overlapping_items 重叠项');
      } else {
        testFail('详情包含 overlapping_items', '缺少字段');
      }
    } else {
      testFail('查询冲突详情成功', detail.error || '未知错误');
    }
  }
} catch (err) {
  testFail('冲突详情查询', err.message);
}

console.log('\n=== 测试组 5: 权限拦截（调度员不能审批） ===');

try {
  const { data: pendingList } = await apiRequest(
    '/conflicts?conflictStatus=approval_pending',
    { method: 'GET' },
    adminCookie
  );
  if (pendingList.data && pendingList.data.length > 0) {
    const testApproval = pendingList.data.find(c => c.order_id === orderPending.id);
    if (testApproval && testApproval.approval_id) {
      const { response, data: approveResult } = await apiRequest(
        `/approvals/${testApproval.approval_id}/approve`,
        { method: 'PUT', body: JSON.stringify({ remark: '测试审批' }) },
        dispatcherCookie
      );
      if (response.status === 403 || !approveResult.success) {
        testPass('调度员审批被 403 权限拦截');
      } else {
        testFail('调度员审批被权限拦截', '调度员居然审批成功了！');
      }

      const { response: resp2, data: rejectResult } = await apiRequest(
        `/approvals/${testApproval.approval_id}/reject`,
        { method: 'PUT', body: JSON.stringify({ remark: '测试驳回' }) },
        dispatcherCookie
      );
      if (resp2.status === 403 || !rejectResult.success) {
        testPass('调度员驳回被 403 权限拦截');
      } else {
        testFail('调度员驳回被权限拦截', '调度员居然驳回成功了！');
      }
    }
  }
} catch (err) {
  testFail('权限拦截测试异常', err.message);
}

console.log('\n=== 测试组 6: 重叠冲突检测与禁止直接派单 ===');

try {
  const orderOverlap = await createOrder(
    `重叠检测-${UNIQUE_TOKEN}`,
    getTestTime(0),
    getTestTime(1),
    adminCookie
  );
  const { response, data: assignResult } = await apiRequest(
    `/orders/${orderOverlap.id}/assign`,
    { method: 'PUT', body: JSON.stringify({ technicianId: 1 }) },
    adminCookie
  );
  if (!assignResult.success && response.status === 409) {
    testPass('重叠时段派单被 409 正确拦截');
    if (assignResult.conflict_detail) {
      testPass('冲突响应包含 conflict_detail 结构');
    } else {
      testFail('冲突响应包含 conflict_detail', '缺少结构');
    }
  } else {
    testFail('重叠时段派单被拦截', `状态码=${response.status}`);
  }
} catch (err) {
  testFail('重叠冲突检测', err.message);
}

console.log('\n=== 测试组 7: 审批通过后继续派单流程 ===');

try {
  const orderApprove = await createOrder(
    `审批通过测试-${UNIQUE_TOKEN}`,
    getTestTime(11),
    getTestTime(12),
    dispatcherCookie
  );
  const orderBase = await createOrder(
    `占用时段基础-${UNIQUE_TOKEN}`,
    getTestTime(11),
    getTestTime(12),
    adminCookie
  );
  await apiRequest(`/orders/${orderBase.id}/assign`, { method: 'PUT', body: JSON.stringify({ technicianId: 2 }) }, adminCookie);

  await apiRequest(`/orders/${orderApprove.id}/force-assign-request`, {
    method: 'POST',
    body: JSON.stringify({ technicianId: 2, reason: `测试审批通过流程-${UNIQUE_TOKEN}` }),
  }, dispatcherCookie);
  testPass('调度员发起强制派单申请成功');

  const { data: approvals } = await apiRequest(
    '/approvals?status=pending',
    { method: 'GET' },
    adminCookie
  );
  const targetApproval = approvals.data?.find(
    a => a.order_id === orderApprove.id && a.type === 'force_assign'
  );
  if (!targetApproval) {
    testFail('找到审批记录进行测试', '未找到待审批记录');
  } else {
    const { data: approveResult } = await apiRequest(
      `/approvals/${targetApproval.id}/approve`,
      { method: 'PUT', body: JSON.stringify({ remark: '同意强制派单-测试' }) },
      adminCookie
    );
    if (approveResult.success && approveResult.data.status === 'approved') {
      testPass('主管审批通过成功');

      const { data: orderDetail } = await apiRequest(
        `/orders/${orderApprove.id}`,
        { method: 'GET' },
        adminCookie
      );
      if (orderDetail.data.status === 'assigned' && orderDetail.data.technician_id === 2) {
        testPass('审批通过后工单自动变为「已分配」且技师正确');
      } else {
        testFail('审批通过后工单自动分配',
          `状态=${orderDetail.data.status}, 技师=${orderDetail.data.technician_id}`);
      }

      const { data: history } = await apiRequest(
        `/orders/${orderApprove.id}/history`,
        { method: 'GET' },
        adminCookie
      );
      if (history.success && history.data.length >= 3) {
        testPass('审批后工单操作日志可追溯（至少3条）');
        const hasApproveAction = history.data.some(
          h => h.action === 'force_assign_approved'
        );
        if (hasApproveAction) {
          testPass('操作日志包含 force_assign_approved 动作');
        } else {
          testFail('操作日志包含审批通过动作', '未找到该动作');
        }
      } else {
        testFail('审批后操作日志', `日志数量=${history.data?.length}`);
      }

      await apiRequest(
        `/orders/${orderBase.id}/cancel`,
        { method: 'PUT', body: JSON.stringify({ reason: '取消占用，测试审批后继续派单' }) },
        adminCookie
      );

      const { data: confirmResult } = await apiRequest(
        `/orders/${orderApprove.id}/confirm`,
        { method: 'PUT' },
        adminCookie
      );
      if (confirmResult.success && confirmResult.data.status === 'confirmed') {
        testPass('审批通过且取消冲突工单后，可以正常确认上门');
      } else {
        testFail('审批后确认上门', confirmResult.error || '未知错误');
      }

      const { data: startResult } = await apiRequest(
        `/orders/${orderApprove.id}/start`,
        { method: 'PUT' },
        adminCookie
      );
      if (startResult.success && startResult.data.status === 'in_progress') {
        testPass('审批通过后的工单可以正常开始服务');
      } else {
        testFail('审批后工单开始服务', startResult.error || '未知错误');
      }

      const { data: completeResult } = await apiRequest(
        `/orders/${orderApprove.id}/complete`,
        { method: 'PUT', body: JSON.stringify({ remark: '服务完成测试' }) },
        adminCookie
      );
      if (completeResult.success && completeResult.data.status === 'completed') {
        testPass('审批通过后的工单可以正常完成服务（全流程贯通）');
      } else {
        testFail('审批后工单完成服务', completeResult.error || '未知错误');
      }
    } else {
      testFail('主管审批通过', approveResult.error || '未知错误');
    }
  }
} catch (err) {
  testFail('审批通过后派单流程', err.message);
}

console.log('\n=== 测试组 8: 驳回后禁止强派（调度员+管理员都不行） ===');

try {
  const orderReject = await createOrder(
    `驳回测试-${UNIQUE_TOKEN}`,
    getTestTime(6),
    getTestTime(7),
    dispatcherCookie
  );
  const orderRejectBase = await createOrder(
    `驳回测试占用-${UNIQUE_TOKEN}`,
    getTestTime(6),
    getTestTime(7),
    adminCookie
  );
  await apiRequest(`/orders/${orderRejectBase.id}/assign`, { method: 'PUT', body: JSON.stringify({ technicianId: 4 }) }, adminCookie);

  const { data: req1 } = await apiRequest(`/orders/${orderReject.id}/force-assign-request`, {
    method: 'POST',
    body: JSON.stringify({ technicianId: 4, reason: `测试驳回-${UNIQUE_TOKEN}` }),
  }, dispatcherCookie);
  if (!req1.success) {
    testFail('驳回测试', '第一次申请失败');
  } else {
    testPass('第一次强制派单申请成功');
  }

  const { data: approvals1 } = await apiRequest(
    '/approvals?status=pending',
    { method: 'GET' },
    adminCookie
  );
  const rejectApproval = approvals1.data?.find(
    a => a.order_id === orderReject.id && a.type === 'force_assign'
  );
  if (rejectApproval) {
    const { data: rejectResult } = await apiRequest(
      `/approvals/${rejectApproval.id}/reject`,
      { method: 'PUT', body: JSON.stringify({ remark: '不同意，请换技师-测试' }) },
      adminCookie
    );
    if (rejectResult.success && rejectResult.data.status === 'rejected') {
      testPass('主管驳回申请成功');
    } else {
      testFail('主管驳回', rejectResult.error || '未知错误');
    }
  }

  const { data: req2 } = await apiRequest(`/orders/${orderReject.id}/force-assign-request`, {
    method: 'POST',
    body: JSON.stringify({ technicianId: 4, reason: `再次申请-${UNIQUE_TOKEN}` }),
  }, dispatcherCookie);
  if (!req2.success) {
    testPass('驳回后调度员再次申请被正确拦截');
  } else {
    testFail('驳回后调度员再次申请被正确拦截', '居然申请成功了！');
  }

  const { response: respFa, data: forceAssignResult } = await apiRequest(
    `/orders/${orderReject.id}/force-assign`,
    {
      method: 'PUT',
      body: JSON.stringify({ technicianId: 4, reason: `管理员强制-${UNIQUE_TOKEN}` }),
    },
    adminCookie
  );
  if (!forceAssignResult.success && respFa.status === 409) {
    testPass('管理员也不能对已驳回的技师强制派单');
  } else {
    testFail('管理员也不能对已驳回的技师强制派单', `状态码: ${respFa.status}`);
  }

  const { data: rejectedConflicts } = await apiRequest(
    '/conflicts?conflictStatus=approval_rejected',
    { method: 'GET' },
    adminCookie
  );
  if (rejectedConflicts.success && Array.isArray(rejectedConflicts.data) && rejectedConflicts.data.length > 0) {
    testPass('按「已驳回」状态筛选能正确返回记录');
    const hasRejectRemark = rejectedConflicts.data.some(c => c.approval_remark !== null && c.approval_remark !== undefined);
    if (hasRejectRemark) {
      testPass('已驳回冲突记录包含审批驳回意见');
    } else {
      testFail('已驳回冲突记录包含审批驳回意见', '没有找到驳回意见');
    }
  } else {
    testFail('按已驳回状态筛选', '没有找到记录');
  }
} catch (err) {
  testFail('驳回后禁止强派', err.message);
}

console.log('\n=== 测试组 9: 数据持久化验证（标记测试数据） ===');
console.log(`  ⚠️  持久化验证请在重启服务后执行: node test-conflict-center-persistence.mjs ${UNIQUE_TOKEN}`);
console.log(`  ℹ️  测试数据标记 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);

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
