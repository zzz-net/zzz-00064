import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let adminCookie = '';
let dispatcherCookie = '';
let dispatcherUserId = 0;

async function apiRequest(path, options = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = { _rawText: text, _contentType: contentType };
  }
  return { response, data, cookie: setCookie ? setCookie.split(';')[0] : cookie };
}

const UNIQUE_TOKEN = Date.now().toString().slice(-8);
const BASE_TIMESTAMP = Date.now() + 180 * 24 * 60 * 60 * 1000;
function getTestTime(hourOffset, minuteOffset = 0) {
  const time = new Date(BASE_TIMESTAMP + hourOffset * 60 * 60 * 1000 + minuteOffset * 60 * 1000);
  return time.toISOString();
}
const TEST_DATE = new Date(BASE_TIMESTAMP).toISOString().split('T')[0];
const TEST_DATE_NEXT = new Date(BASE_TIMESTAMP + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

let passed = 0;
let failed = 0;
const testContext = { uniqueToken: UNIQUE_TOKEN };

function testPass(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}

function testFail(name, reason) {
  failed++;
  console.log(`  ❌ ${name}`);
  console.log(`     原因: ${reason}`);
}

function assertEq(actual, expected, testName, detail = '') {
  if (actual === expected) {
    testPass(testName);
  } else {
    testFail(testName, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}。${detail}`);
  }
}

function assertTrue(cond, testName, detail = '') {
  if (cond) {
    testPass(testName);
  } else {
    testFail(testName, detail || '条件为 false');
  }
}

async function loginAsAdmin() {
  const { cookie, data } = await apiRequest(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: '123456' }),
    },
    adminCookie
  );
  adminCookie = cookie;
  return { cookie, user: data.data };
}

async function loginAsDispatcher() {
  const { cookie, data } = await apiRequest(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username: 'dispatcher', password: '123456' }),
    },
    dispatcherCookie
  );
  dispatcherCookie = cookie;
  dispatcherUserId = data.data?.id || 2;
  testContext.dispatcherUserId = dispatcherUserId;
  return { cookie, user: data.data };
}

async function createOrder(customerName, startTime, endTime, cookie) {
  const { data } = await apiRequest(
    '/orders',
    {
      method: 'POST',
      body: JSON.stringify({
        customerName,
        customerPhone: '13800000000',
        customerAddress: `测试地址-${UNIQUE_TOKEN}`,
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

console.log('============================================================');
console.log('冲突处理中心 V3 完整回归测试（撤回+导出+持久化）');
console.log(`测试数据标记 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);
console.log(`测试日期: ${TEST_DATE} ~ ${TEST_DATE_NEXT}`);
console.log('============================================================\n');

await loginAsAdmin();
await loginAsDispatcher();
testPass('管理员和调度员登录成功');
console.log();

// ============================================================
// 测试组 1: 撤回权限边界
// ============================================================
console.log('=== 测试组 1: 撤回权限边界 ===');

const orderForWithdraw = await createOrder(
  `撤回权限工单-${UNIQUE_TOKEN}`,
  getTestTime(0), getTestTime(2),
  dispatcherCookie
);
testPass('[1.1] 调度员创建待分配工单A (时段0-2)');

const orderBlocker = await createOrder(
  `占用工单-${UNIQUE_TOKEN}`,
  getTestTime(1), getTestTime(3),
  adminCookie
);
await apiRequest(
  `/orders/${orderBlocker.id}/assign`,
  { method: 'PUT', body: JSON.stringify({ technicianId: 1 }) },
  adminCookie
);
testPass('[1.2] 管理员创建并分配占用工单B给技师1 (时段1-3，与A重叠)');

const { data: applyResult } = await apiRequest(
  `/orders/${orderForWithdraw.id}/force-assign-request`,
  {
    method: 'POST',
    body: JSON.stringify({
      technicianId: 1,
      reason: `测试撤回申请-${UNIQUE_TOKEN}`,
    }),
  },
  dispatcherCookie
);
assertTrue(applyResult.success, '[1.3] 调度员发起强制派单申请成功', applyResult.error);

const { data: pendingListBefore } = await apiRequest(
  '/approvals?status=pending',
  { method: 'GET' },
  dispatcherCookie
);
const myPendingApproval = pendingListBefore.data.find(
  a => a.reason && a.reason.includes(UNIQUE_TOKEN) && a.status === 'pending'
);
assertTrue(myPendingApproval !== undefined, '[1.4] 待审批列表中有刚发起的申请', `没找到包含 ${UNIQUE_TOKEN} 的 pending 审批`);

const approvalId = myPendingApproval.id;
testContext.approvalIdForWithdraw = approvalId;
testContext.orderIdForWithdraw = orderForWithdraw.id;

// 1.5 另一个调度员（这里用管理员模拟非申请人）不能撤回
const { data: withdrawByOther } = await apiRequest(
  `/approvals/${approvalId}/withdraw`,
  { method: 'PUT', body: JSON.stringify({ reason: '别人的申请我来撤' }) },
  adminCookie
);
assertEq(withdrawByOther.success, false, '[1.5] 非申请人撤回申请被拒绝', withdrawByOther.error);

// 1.6 申请人撤回（合法）
const { data: withdrawByOwner } = await apiRequest(
  `/approvals/${approvalId}/withdraw`,
  { method: 'PUT', body: JSON.stringify({ reason: `调度员主动撤回-${UNIQUE_TOKEN}` }) },
  dispatcherCookie
);
assertTrue(withdrawByOwner.success, '[1.6] 申请人本人撤回申请成功', withdrawByOwner.error);

// 1.7 撤回后状态变为 withdrawn
assertEq(withdrawByOwner.data.status, 'withdrawn', '[1.7] 撤回后审批状态变为 withdrawn');
assertTrue(withdrawByOwner.data.withdrawn_at !== null, '[1.8] 撤回后 withdrawn_at 已记录');
assertTrue(
  (withdrawByOwner.data.withdraw_reason || '').includes(UNIQUE_TOKEN),
  '[1.9] 撤回后 withdraw_reason 已记录',
  `withdraw_reason=${withdrawByOwner.data.withdraw_reason}`
);
console.log();

// ============================================================
// 测试组 2: 撤回后工单回到可派单/改派状态 + 再次申请
// ============================================================
console.log('=== 测试组 2: 撤回后状态同步 + 再次申请 ===');

const { data: withdrawnList } = await apiRequest(
  '/approvals?status=withdrawn',
  { method: 'GET' },
  dispatcherCookie
);
const withdrawnRecord = withdrawnList.data.find(a => a.id === approvalId);
assertTrue(withdrawnRecord !== undefined, '[2.1] 撤回记录出现在「已撤回」筛选列表中');

const { data: orderAfterWithdraw } = await apiRequest(
  `/orders/${orderForWithdraw.id}`,
  { method: 'GET' },
  dispatcherCookie
);
assertEq(orderAfterWithdraw.data.status, 'pending', '[2.2] 撤回后工单状态仍为 pending（可重新派单）');
assertEq(orderAfterWithdraw.data.technician_id, null, '[2.3] 撤回后工单 technician_id 仍为 null（未被分配）');

const { data: historyAfter } = await apiRequest(
  `/orders/${orderForWithdraw.id}/history`,
  { method: 'GET' },
  dispatcherCookie
);
const hasWithdrawHistory = historyAfter.data.some(
  h => h.action === 'approval_withdrawn_force_assign' && (h.remark || '').includes(UNIQUE_TOKEN)
);
assertTrue(hasWithdrawHistory, '[2.4] 操作日志中记录了 approval_withdrawn 动作', `历史:${JSON.stringify(historyAfter.data.map(h => h.action))}`);

// 冲突列表同步：该工单的冲突解除了之前的 approval_id 关联（必须在再次申请之前检查）
const { data: conflictsAfter } = await apiRequest(
  `/conflicts`,
  { method: 'GET' },
  dispatcherCookie
);
const orderConflicts = conflictsAfter.data.filter(c => c.order_id === orderForWithdraw.id);
const unlinkedConflict = orderConflicts.find(
  c => c.resolved === 0 && (c.approval_id === null || c.approval_id === undefined)
);
assertTrue(unlinkedConflict !== undefined, '[2.5] 撤回后原冲突记录的 approval_id 被解除（变为 null）', 
  `工单冲突: ${JSON.stringify(orderConflicts.map(c => ({ id: c.id, approval_id: c.approval_id, status: c.conflict_status })))}`
);

// 撤回后冲突解除关联，重新发起申请应该成功
const { data: reapplyResult } = await apiRequest(
  `/orders/${orderForWithdraw.id}/force-assign-request`,
  {
    method: 'POST',
    body: JSON.stringify({
      technicianId: 1,
      reason: `撤回后再次申请-${UNIQUE_TOKEN}`,
    }),
  },
  dispatcherCookie
);
assertTrue(reapplyResult.success, '[2.6] 撤回后可再次发起强制派单申请', reapplyResult.error);

const { data: pendingList2 } = await apiRequest(
  '/approvals?status=pending',
  { method: 'GET' },
  dispatcherCookie
);
const reapplyApproval = pendingList2.data.find(
  a => a.reason && a.reason.includes(`撤回后再次申请-${UNIQUE_TOKEN}`)
);
assertTrue(reapplyApproval !== undefined, '[2.7] 撤回后再次申请出现在待审批列表中');
testContext.reapplyApprovalId = reapplyApproval.id;
console.log();

// ============================================================
// 测试组 3: 已审批记录禁止撤回
// ============================================================
console.log('=== 测试组 3: 已审批记录禁止撤回 ===');

const orderForRejectTest = await createOrder(
  `驳回后撤回工单-${UNIQUE_TOKEN}`,
  getTestTime(4), getTestTime(6),
  dispatcherCookie
);
await apiRequest(
  `/orders/${orderForRejectTest.id}/force-assign-request`,
  {
    method: 'POST',
    body: JSON.stringify({ technicianId: 1, reason: `驳回撤回测试-${UNIQUE_TOKEN}` }),
  },
  dispatcherCookie
);
testPass('[3.1] 创建并发起另一份强制派单申请');

const { data: pending3 } = await apiRequest('/approvals?status=pending', { method: 'GET' }, dispatcherCookie);
const rejectApproval = pending3.data.find(a => a.reason && a.reason.includes(`驳回撤回测试-${UNIQUE_TOKEN}`));
assertTrue(rejectApproval !== undefined, '[3.2] 找到待审批申请（待驳回后测试）');

await apiRequest(
  `/approvals/${rejectApproval.id}/reject`,
  { method: 'PUT', body: JSON.stringify({ remark: '主管驳回-测试用' }) },
  adminCookie
);
testPass('[3.3] 主管驳回该申请');

const { data: tryWithdrawRejected } = await apiRequest(
  `/approvals/${rejectApproval.id}/withdraw`,
  { method: 'PUT', body: JSON.stringify({ reason: '驳回后再试撤' }) },
  dispatcherCookie
);
assertEq(tryWithdrawRejected.success, false, '[3.4] 已驳回记录撤回被拒绝', tryWithdrawRejected.error);

// 已通过也不能撤回
const orderForApproveTest = await createOrder(
  `通过后撤回工单-${UNIQUE_TOKEN}`,
  getTestTime(6, 30), getTestTime(8, 30),
  dispatcherCookie
);
await apiRequest(
  `/orders/${orderForApproveTest.id}/force-assign-request`,
  {
    method: 'POST',
    body: JSON.stringify({ technicianId: 2, reason: `通过撤回测试-${UNIQUE_TOKEN}` }),
  },
  dispatcherCookie
);
const { data: pending3b } = await apiRequest('/approvals?status=pending', { method: 'GET' }, dispatcherCookie);
const approveApproval = pending3b.data.find(a => a.reason && a.reason.includes(`通过撤回测试-${UNIQUE_TOKEN}`));
assertTrue(approveApproval !== undefined, '[3.5] 找到待审批申请（待通过后测试）');

await apiRequest(
  `/approvals/${approveApproval.id}/approve`,
  { method: 'PUT', body: JSON.stringify({ remark: '主管通过-测试用' }) },
  adminCookie
);
testPass('[3.6] 主管通过该申请');

const { data: tryWithdrawApproved } = await apiRequest(
  `/approvals/${approveApproval.id}/withdraw`,
  { method: 'PUT', body: JSON.stringify({ reason: '通过后再试撤' }) },
  dispatcherCookie
);
assertEq(tryWithdrawApproved.success, false, '[3.7] 已通过记录撤回被拒绝', tryWithdrawApproved.error);
console.log();

// ============================================================
// 测试组 4: 冲突详情 can_withdraw 权限
// ============================================================
console.log('=== 测试组 4: 冲突详情 available_actions.can_withdraw ===');

// 找一个当前申请待审批，并且申请人是当前调度员的冲突
const { data: conflictsPending } = await apiRequest(
  '/conflicts?conflictStatus=approval_pending',
  { method: 'GET' },
  dispatcherCookie
);
const myPendingConflict = conflictsPending.data.find(c => 
  c.applicant_name === '张调度' && c.conflict_status === 'approval_pending'
);

if (myPendingConflict) {
  const { data: detailAsDispatcher } = await apiRequest(
    `/conflicts/${myPendingConflict.id}`,
    { method: 'GET' },
    dispatcherCookie
  );
  assertTrue(
    detailAsDispatcher.data?.available_actions?.can_withdraw === true,
    '[4.1] 调度员看自己发起的待审批冲突：can_withdraw = true',
    `available_actions=${JSON.stringify(detailAsDispatcher.data?.available_actions)}`
  );

  const { data: detailAsAdmin } = await apiRequest(
    `/conflicts/${myPendingConflict.id}`,
    { method: 'GET' },
    adminCookie
  );
  assertTrue(
    detailAsAdmin.data?.available_actions?.can_withdraw === false,
    '[4.2] 管理员看同一条待审批冲突：can_withdraw = false（非申请人）',
    `available_actions=${JSON.stringify(detailAsAdmin.data?.available_actions)}`
  );
} else {
  testFail('[4.1] 找到调度员发起的待审批冲突用于测试 can_withdraw', '没找到符合条件的冲突，跳过 4.1 和 4.2');
  testFail('[4.2] 管理员 can_withdraw 为 false', '前置跳过');
}
console.log();

// ============================================================
// 测试组 5: 审批列表 CSV 导出（按筛选条件）
// ============================================================
console.log('=== 测试组 5: 审批列表 CSV 导出 ===');

// 先造一条 withdrawn 状态（前面测试1有了），和 pending（测试2里）
const { data: exportPending } = await apiRequest(
  '/approvals/export?status=pending',
  { method: 'GET' },
  dispatcherCookie
);
const pendingCsv = exportPending._rawText || '';
assertTrue(pendingCsv.startsWith('\ufeff'), '[5.1] 审批导出CSV带 UTF-8 BOM（Excel 正确识别中文）', `实际长度=${pendingCsv.length}`);
assertTrue(pendingCsv.includes('ID,类型,工单编号'), '[5.2] 审批导出CSV包含正确表头（中文）',
  `前100字符: ${pendingCsv.slice(0, 100)}`
);
assertTrue(pendingCsv.includes('待审批'), '[5.3] 审批 pending 筛选导出中包含「待审批」状态文字');
assertTrue(!pendingCsv.includes('已撤回'), '[5.4] 审批 pending 筛选导出中不包含「已撤回」状态文字（筛选正确）');

// withdrawn 筛选
const { data: exportWithdrawn } = await apiRequest(
  '/approvals/export?status=withdrawn',
  { method: 'GET' },
  dispatcherCookie
);
const withdrawnCsv = exportWithdrawn._rawText || '';
assertTrue(withdrawnCsv.includes(UNIQUE_TOKEN), '[5.5] 已撤回筛选导出中包含 UNIQUE_TOKEN 标记的撤回记录',
  `包含?: ${withdrawnCsv.includes(UNIQUE_TOKEN)}`
);
assertTrue(withdrawnCsv.includes('已撤回'), '[5.6] 已撤回筛选导出中包含「已撤回」状态文字');
console.log();

// ============================================================
// 测试组 6: 冲突列表 CSV 导出（组合筛选：技师+状态+日期）
// ============================================================
console.log('=== 测试组 6: 冲突列表 CSV 导出（组合筛选） ===');

// 不加筛选
const { data: exportAllConflicts } = await apiRequest(
  '/conflicts/export',
  { method: 'GET' },
  dispatcherCookie
);
const allConflictCsv = exportAllConflicts._rawText || '';
assertTrue(allConflictCsv.startsWith('\ufeff'), '[6.1] 冲突导出CSV带 UTF-8 BOM');
assertTrue(allConflictCsv.includes('ID,工单编号,客户姓名,技师'), '[6.2] 冲突导出CSV包含正确表头（中文）',
  `前120字符: ${allConflictCsv.slice(0, 120)}`
);

// 技师1筛选
const { data: exportTech1 } = await apiRequest(
  '/conflicts/export?technicianId=1',
  { method: 'GET' },
  dispatcherCookie
);
const tech1Csv = exportTech1._rawText || '';
const tech1Lines = tech1Csv.split('\n').slice(1).filter(l => l.trim());
const onlyTech1 = tech1Lines.every(line => {
  const cols = line.split(',');
  return cols[3] === '李师傅' || cols[3] === '"李师傅"';
});
assertTrue(onlyTech1 || tech1Lines.length === 0, '[6.3] 技师筛选导出：所有行技师都是李师傅（或空）',
  `行数=${tech1Lines.length}, 技师列样本=${tech1Lines.slice(0, 3).map(l => l.split(',')[3]).join('|')}`
);

// approval_pending 筛选
const { data: exportAppPending } = await apiRequest(
  '/conflicts/export?conflictStatus=approval_pending',
  { method: 'GET' },
  dispatcherCookie
);
const appPendingCsv = exportAppPending._rawText || '';
const appPendingLines = appPendingCsv.split('\n').slice(1).filter(l => l.trim());
const onlyPending = appPendingLines.every(line => line.includes('待审批'));
assertTrue(onlyPending || appPendingLines.length === 0, '[6.4] 状态筛选导出：所有行都是「待审批」状态');

// 日期筛选
const { data: exportDateRange } = await apiRequest(
  `/conflicts/export?dateFrom=${TEST_DATE}T00:00:00.000Z&dateTo=${TEST_DATE_NEXT}T23:59:59.999Z`,
  { method: 'GET' },
  dispatcherCookie
);
const dateRangeCsv = exportDateRange._rawText || '';
assertTrue(dateRangeCsv.includes(UNIQUE_TOKEN), '[6.5] 日期范围筛选导出中包含本次测试的标记（在日期范围内）',
  `包含?: ${dateRangeCsv.includes(UNIQUE_TOKEN)}`
);
console.log();

// ============================================================
// 测试组 7: 撤回后再次申请 -> 主管通过 -> 完成工单全链路
// ============================================================
console.log('=== 测试组 7: 撤回后再次申请全链路 ===');

const reapplyApprovalId = reapplyApproval.id;
const { data: approve7 } = await apiRequest(
  `/approvals/${reapplyApprovalId}/approve`,
  { method: 'PUT', body: JSON.stringify({ remark: `主管通过重发申请-${UNIQUE_TOKEN}` }) },
  adminCookie
);
assertTrue(approve7.success, '[7.1] 撤回后再次发起的申请，主管可以正常审批通过', approve7.error);

const { data: order7After } = await apiRequest(
  `/orders/${orderForWithdraw.id}`,
  { method: 'GET' },
  dispatcherCookie
);
assertEq(order7After.data.status, 'assigned', '[7.2] 审批通过后工单状态变为 assigned');
assertEq(order7After.data.technician_id, 1, '[7.3] 审批通过后工单挂到技师1名下');

const { data: confirmResult } = await apiRequest(`/orders/${orderForWithdraw.id}/confirm`, { method: 'PUT' }, dispatcherCookie);
assertTrue(confirmResult.success === true, '[7.4] 确认工单（接口成功返回）', 
  `confirm返回: ${JSON.stringify(confirmResult)}，工单当前状态: ${order7After.data?.status}，技师: ${order7After.data?.technician_id}`);

const { data: history7 } = await apiRequest(
  `/orders/${orderForWithdraw.id}/history`,
  { method: 'GET' },
  dispatcherCookie
);
const actions = history7.data.map(h => h.action);
assertTrue(actions.includes('approval_withdrawn_force_assign'), '[7.5] 操作日志含 withdraw 动作',
  `实际动作列表: ${JSON.stringify(actions)}`);
assertTrue(actions.includes('force_assign_approved'), '[7.6] 操作日志含 force_assign_approved 动作',
  `实际动作列表: ${JSON.stringify(actions)}`);
assertTrue(actions.includes('confirm'), '[7.7] 操作日志含 confirm 动作',
  `实际动作列表: ${JSON.stringify(actions)}`);
console.log();

// ============================================================
// 汇总
// ============================================================
const total = passed + failed;
console.log('============================================================');
console.log(`测试完成: 通过 ${passed}/${total}，失败 ${failed}`);
console.log(`测试数据标记 UNIQUE_TOKEN=${UNIQUE_TOKEN}（重启后持久化验证请使用此值）`);
console.log('============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n💯 全部通过！下一步：');
  console.log(`  1) 重启后端服务`);
  console.log(`  2) 运行: node test-conflict-center-v3-persistence.mjs ${UNIQUE_TOKEN}`);
}
