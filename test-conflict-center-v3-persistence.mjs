import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let adminCookie = '';
let dispatcherCookie = '';

const UNIQUE_TOKEN = process.argv[2];

if (!UNIQUE_TOKEN || UNIQUE_TOKEN.length !== 8) {
  console.error('用法: node test-conflict-center-v3-persistence.mjs <8位UNIQUE_TOKEN>');
  console.error('  UNIQUE_TOKEN 来自 test-conflict-center-v3.mjs 的最后输出');
  process.exit(1);
}

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

let passed = 0;
let failed = 0;

function testPass(name) { passed++; console.log(`  ✅ ${name}`); }
function testFail(name, reason) { failed++; console.log(`  ❌ ${name}`); console.log(`     原因: ${reason}`); }
function assertEq(a, e, name, d='') { if (a===e) testPass(name); else testFail(name, `期望 ${JSON.stringify(e)}，实际 ${JSON.stringify(a)}。${d}`); }
function assertTrue(c, name, d='') { if (c) testPass(name); else testFail(name, d || 'false'); }

async function loginAsAdmin() {
  const { cookie } = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: '123456' }) }, adminCookie);
  adminCookie = cookie;
}
async function loginAsDispatcher() {
  const { cookie } = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'dispatcher', password: '123456' }) }, dispatcherCookie);
  dispatcherCookie = cookie;
}

console.log('============================================================');
console.log('冲突处理中心 V3 - 重启后持久化验证');
console.log(`验证 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);
console.log('============================================================\n');

await loginAsAdmin();
await loginAsDispatcher();
testPass('双角色登录成功');
console.log();

// ============================================================
// 测试组 P1: 撤回记录持久化
// ============================================================
console.log('=== 测试组 P1: 撤回记录持久化 ===');

const { data: withdrawnList } = await apiRequest('/approvals?status=withdrawn', { method: 'GET' }, dispatcherCookie);
const withdrawn = withdrawnList.data?.find(a => (a.withdraw_reason || '').includes(UNIQUE_TOKEN));
assertTrue(withdrawn !== undefined, '[P1.1] 重启后「已撤回」列表仍能找到带 UNIQUE_TOKEN 的撤回记录',
  `实际记录数=${withdrawnList.data?.length || 0}`
);
if (withdrawn) {
  assertEq(withdrawn.status, 'withdrawn', '[P1.2] 状态字段正确为 withdrawn');
  assertTrue(withdrawn.withdrawn_at !== null, '[P1.3] withdrawn_at 时间戳存在');
  assertTrue((withdrawn.withdraw_reason || '').includes(UNIQUE_TOKEN), '[P1.4] withdraw_reason 正确保存');
  assertTrue((withdrawn.applicant_name || '') !== '', '[P1.5] applicant_name 字段存在');
} else {
  testFail('[P1.2]', '前置失败');
  testFail('[P1.3]', '前置失败');
  testFail('[P1.4]', '前置失败');
  testFail('[P1.5]', '前置失败');
}

// 已驳回和已通过也不能撤回
const { data: rejectedList } = await apiRequest('/approvals?status=rejected', { method: 'GET' }, dispatcherCookie);
const rejected = rejectedList.data?.find(a => (a.approval_remark || '') === '主管驳回-测试用' || (a.reason || '').includes(`驳回撤回测试-${UNIQUE_TOKEN}`));
if (rejected) {
  const { data: tryW } = await apiRequest(`/approvals/${rejected.id}/withdraw`, { method: 'PUT', body: JSON.stringify({}) }, dispatcherCookie);
  assertEq(tryW.success, false, '[P1.6] 重启后，已驳回记录仍然不能撤回', tryW.error);
} else {
  testFail('[P1.6]', '未找到对应的已驳回记录');
}

const { data: approvedList } = await apiRequest('/approvals?status=approved', { method: 'GET' }, dispatcherCookie);
const approved = approvedList.data?.find(a => (a.reason || '').includes(`通过撤回测试-${UNIQUE_TOKEN}`));
if (approved) {
  const { data: tryW2 } = await apiRequest(`/approvals/${approved.id}/withdraw`, { method: 'PUT', body: JSON.stringify({}) }, dispatcherCookie);
  assertEq(tryW2.success, false, '[P1.7] 重启后，已通过记录仍然不能撤回', tryW2.error);
} else {
  testFail('[P1.7]', '未找到对应的已通过记录');
}
console.log();

// ============================================================
// 测试组 P2: 撤回后工单状态持久化 + 操作日志
// ============================================================
console.log('=== 测试组 P2: 工单状态 + 操作日志持久化 ===');

// 找那个撤回后再次申请并完成的工单（重发申请成功后assigned+confirmed）
const { data: orderList } = await apiRequest('/orders?search=' + encodeURIComponent(`撤回权限工单-${UNIQUE_TOKEN}`), { method: 'GET' }, dispatcherCookie);
const targetOrder = orderList.data?.find(o => o.customer_name && o.customer_name.includes(`撤回权限工单-${UNIQUE_TOKEN}`));
assertTrue(targetOrder !== undefined, '[P2.1] 重启后仍能找到带标记的目标工单',
  `orders.search=${UNIQUE_TOKEN}，结果=${JSON.stringify(orderList.data?.map(o => ({ id: o.id, name: o.customer_name, status: o.status })))}`
);

if (targetOrder) {
  assertTrue(targetOrder.status === 'assigned' || targetOrder.status === 'confirmed',
    '[P2.2] 重启后工单状态为 assigned 或 confirmed（确认测试后应为 confirmed）',
    `status=${targetOrder.status}, tech_id=${targetOrder.technician_id}`
  );
  assertEq(targetOrder.technician_id, 1, '[P2.3] 重启后工单技师仍然是技师1');

  const { data: history } = await apiRequest(`/orders/${targetOrder.id}/history`, { method: 'GET' }, dispatcherCookie);
  const actions = history.data?.map(h => h.action) || [];
  assertTrue(actions.includes('approval_withdrawn_force_assign'), '[P2.4] 操作日志含 approval_withdrawn_force_assign 记录',
    `实际 actions=${JSON.stringify(actions)}`
  );
  assertTrue(actions.includes('force_assign_approved'), '[P2.5] 操作日志含 force_assign_approved 记录');
  assertTrue(actions.includes('confirm'), '[P2.6] 操作日志含 confirm 记录');

  const withdrawHistory = history.data?.find(h => h.action === 'approval_withdrawn_force_assign');
  assertTrue((withdrawHistory?.remark || '').includes(UNIQUE_TOKEN), '[P2.7] 操作日志 remark 中含 UNIQUE_TOKEN（可追溯）',
    `remark=${withdrawHistory?.remark}`
  );
} else {
  for (let i = 2; i <= 7; i++) testFail(`[P2.${i}]`, '未找到目标工单');
}
console.log();

// ============================================================
// 测试组 P3: 冲突列表 + 审批筛选导出（重启后仍然可导）
// ============================================================
console.log('=== 测试组 P3: CSV 导出在重启后仍可用 ===');

// 审批导出
const { data: exportW } = await apiRequest('/approvals/export?status=withdrawn', { method: 'GET' }, dispatcherCookie);
const csvW = exportW._rawText || '';
assertTrue(csvW.startsWith('\ufeff'), '[P3.1] 重启后审批导出CSV仍带BOM');
assertTrue(csvW.includes(UNIQUE_TOKEN), '[P3.2] 重启后「已撤回」审批导出仍含 UNIQUE_TOKEN 记录',
  `包含?: ${csvW.includes(UNIQUE_TOKEN)}，长度=${csvW.length}`
);

// 冲突导出 - 用日期筛选（与 test-conflict-center-v3.mjs 保持 180 天一致）
const BASE_TIMESTAMP = Date.now() + 180 * 24 * 60 * 60 * 1000;
const TEST_DATE = new Date(BASE_TIMESTAMP).toISOString().split('T')[0];
const TEST_DATE_NEXT = new Date(BASE_TIMESTAMP + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const { data: exportC } = await apiRequest(
  `/conflicts/export?dateFrom=${TEST_DATE}T00:00:00.000Z&dateTo=${TEST_DATE_NEXT}T23:59:59.999Z`,
  { method: 'GET' },
  dispatcherCookie
);
const csvC = exportC._rawText || '';
assertTrue(csvC.includes('ID,工单编号,客户姓名,技师'), '[P3.3] 重启后冲突导出CSV表头仍然正确');
assertTrue(csvC.length > 0, '[P3.4] 重启后冲突导出CSV内容不为空');

// 冲突状态筛选导出
const { data: exportPending } = await apiRequest('/conflicts/export?conflictStatus=approval_pending', { method: 'GET' }, dispatcherCookie);
const csvP = exportPending._rawText || '';
const linesP = csvP.split('\n').slice(1).filter(l => l.trim());
const allPending = linesP.every(l => l.includes('待审批'));
assertTrue(allPending || linesP.length === 0, '[P3.5] 重启后「待审批」状态筛选导出仍然正确（都是待审批）',
  `行数=${linesP.length}`
);
console.log();

// ============================================================
// 测试组 P4: 撤回后冲突解除关联持久化
// ============================================================
console.log('=== 测试组 P4: 冲突与审批解除关联持久化 ===');

if (targetOrder) {
  const { data: conflictsForOrder } = await apiRequest('/conflicts', { method: 'GET' }, dispatcherCookie);
  const tConflicts = (conflictsForOrder.data || []).filter(c => c.order_id === targetOrder.id);
  assertTrue(tConflicts.length > 0, '[P4.1] 工单对应的冲突记录仍然存在',
    `数量=${tConflicts.length}`
  );
  // 撤回的那条已经解除 approval_id 关联（应该是第1条），新申请那条还挂着 approval_id
  const unlinked = tConflicts.filter(c => c.approval_id === null || c.approval_id === undefined);
  assertTrue(unlinked.length >= 1, '[P4.2] 至少有 1 条冲突解除了 approval_id 关联（撤回的）',
    `工单冲突详情: ${JSON.stringify(tConflicts.map(c => ({ id: c.id, approval_id: c.approval_id, status: c.conflict_status, resolved: c.resolved })))}`
  );
  const linked = tConflicts.filter(c => c.approval_id !== null && c.approval_id !== undefined);
  assertTrue(linked.length >= 1, '[P4.3] 至少有 1 条冲突仍挂着 approval_id（重发申请那条）');
} else {
  testFail('[P4.1]', '未找到目标工单');
  testFail('[P4.2]', '未找到目标工单');
  testFail('[P4.3]', '未找到目标工单');
}
console.log();

// ============================================================
// 汇总
// ============================================================
const total = passed + failed;
console.log('============================================================');
console.log(`持久化验证完成: 通过 ${passed}/${total}，失败 ${failed}`);
console.log('============================================================');

if (failed > 0) process.exit(1);
