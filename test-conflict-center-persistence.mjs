import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let adminCookie = '';

async function apiRequest(path, options = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  const data = await response.json();
  return { response, data, cookie: setCookie ? setCookie.split(';')[0] : cookie };
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

const UNIQUE_TOKEN = process.argv[2];

if (!UNIQUE_TOKEN) {
  console.error('用法: node test-conflict-center-persistence.mjs <UNIQUE_TOKEN>');
  console.error('UNIQUE_TOKEN 是运行 test-conflict-center-v2.mjs 时生成的8位数字');
  process.exit(1);
}

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

console.log('========================================');
console.log('冲突处理中心 - 持久化验证');
console.log(`测试标识: ${UNIQUE_TOKEN}`);
console.log('========================================\n');

await loginAsAdmin();

console.log('\n--- 验证 1: 重启后冲突列表仍可查询 ---');
try {
  const { data: allConflicts } = await apiRequest('/conflicts', { method: 'GET' }, adminCookie);
  if (allConflicts.success && Array.isArray(allConflicts.data)) {
    testPass(`重启后仍能查询到 ${allConflicts.data.length} 条冲突记录`);
    const hasStatus = allConflicts.data.length > 0 && allConflicts.data[0].conflict_status !== undefined;
    if (hasStatus) {
      testPass('冲突记录仍包含 conflict_status 字段');
    } else {
      testFail('冲突记录包含 conflict_status 字段', '字段丢失');
    }
  } else {
    testFail('重启后查询冲突列表', allConflicts.error || '未知错误');
  }
} catch (err) {
  testFail('重启后查询冲突', err.message);
}

console.log('\n--- 验证 2: 各种状态筛选重启后仍然有效 ---');

const statuses = [
  { key: 'assigned', label: '已分配' },
  { key: 'confirmed', label: '已确认' },
  { key: 'approval_pending', label: '待审批' },
  { key: 'approval_rejected', label: '已驳回' },
  { key: 'resolved', label: '已解决' },
];

for (const s of statuses) {
  try {
    const { data } = await apiRequest(
      `/conflicts?conflictStatus=${s.key}`,
      { method: 'GET' },
      adminCookie
    );
    if (data.success && Array.isArray(data.data)) {
      const allMatch = data.data.every(c => c.conflict_status === s.key);
      if (allMatch) {
        testPass(`重启后按「${s.label}」状态筛选结果正确`);
      } else {
        testFail(`按「${s.label}」筛选`, '存在不匹配状态的记录');
      }
    } else {
      testFail(`按「${s.label}」筛选`, data.error || '未知错误');
    }
  } catch (err) {
    testFail(`按「${s.label}」筛选异常`, err.message);
  }
}

console.log('\n--- 验证 3: 审批记录重启后可追溯 ---');
try {
  const { data: allApprovals } = await apiRequest('/approvals', { method: 'GET' }, adminCookie);
  if (allApprovals.success && Array.isArray(allApprovals.data)) {
    testPass(`重启后仍能查询到 ${allApprovals.data.length} 条审批记录`);
  } else {
    testFail('重启后查询审批记录', allApprovals.error || '未知错误');
  }
} catch (err) {
  testFail('重启后查询审批记录', err.message);
}

try {
  const { data: pendingApprovals } = await apiRequest(
    '/approvals?status=pending',
    { method: 'GET' },
    adminCookie
  );
  if (pendingApprovals.success) {
    testPass(`重启后按 pending 状态筛选审批: ${pendingApprovals.data?.length || 0} 条`);
  } else {
    testFail('重启后筛选待审批', pendingApprovals.error || '未知错误');
  }

  const { data: rejectedApprovals } = await apiRequest(
    '/approvals?status=rejected',
    { method: 'GET' },
    adminCookie
  );
  if (rejectedApprovals.success && rejectedApprovals.data?.length > 0) {
    const hasRemark = rejectedApprovals.data.some(a => a.approval_remark);
    if (hasRemark) {
      testPass('重启后已驳回审批仍保留驳回意见');
    } else {
      testFail('重启后已驳回审批保留驳回意见', '没有找到带驳回意见的记录');
    }
  }
} catch (err) {
  testFail('重启后审批状态筛选', err.message);
}

console.log('\n--- 验证 4: 组合筛选重启后仍然有效 ---');
try {
  const { data: combo } = await apiRequest(
    `/conflicts?conflictStatus=approval_rejected&technicianId=4`,
    { method: 'GET' },
    adminCookie
  );
  if (combo.success && Array.isArray(combo.data)) {
    const valid = combo.data.every(
      c => c.conflict_status === 'approval_rejected' && c.technician_id === 4
    );
    if (valid) {
      testPass('重启后组合筛选（已驳回+技师4）结果正确');
    } else {
      testFail('重启后组合筛选', '条件不匹配');
    }
  } else {
    testFail('重启后组合筛选', combo.error || '未知错误');
  }
} catch (err) {
  testFail('重启后组合筛选异常', err.message);
}

console.log('\n--- 验证 5: 冲突详情与操作日志重启后可追溯 ---');
try {
  const { data: anyConflict } = await apiRequest('/conflicts?limit=1', { method: 'GET' }, adminCookie);
  if (anyConflict.data && anyConflict.data.length > 0) {
    const conflict = anyConflict.data[0];
    const { data: detail } = await apiRequest(`/conflicts/${conflict.id}`, { method: 'GET' }, adminCookie);
    if (detail.success && detail.data) {
      testPass('重启后冲突详情仍可查询');
      if (detail.data.available_actions) {
        testPass('重启后详情仍包含 available_actions');
      }
    }

    if (detail.data?.related_order) {
      const { data: history } = await apiRequest(
        `/orders/${detail.data.related_order.id}/history`,
        { method: 'GET' },
        adminCookie
      );
      if (history.success && history.data.length >= 1) {
        testPass(`重启后工单操作日志仍可追溯（${history.data.length}条）`);
      } else {
        testFail('重启后工单操作日志', '无法获取或为空');
      }
    }
  }
} catch (err) {
  testFail('重启后详情和日志', err.message);
}

console.log('\n========================================');
console.log('持久化验证结果');
console.log('========================================');
console.log(`  通过: ${passed}`);
console.log(`  失败: ${failed}`);
console.log(`  总计: ${passed + failed}`);
console.log('========================================');

if (failed > 0) {
  process.exit(1);
}
