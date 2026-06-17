import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
const UNIQUE_TOKEN = Date.now().toString().slice(-8);
console.log(`测试数据标记 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);

const BASE_TIMESTAMP = Date.now() + 300 * 24 * 60 * 60 * 1000;
let currentDayOffset = parseInt(UNIQUE_TOKEN) % 500 + 200;
function getTestTime(hourOffset, minuteOffset = 0) {
  const time = new Date(BASE_TIMESTAMP + currentDayOffset * 24 * 60 * 60 * 1000 + hourOffset * 60 * 60 * 1000 + minuteOffset * 60 * 1000);
  return time.toISOString();
}
function nextTestDay() { currentDayOffset++; }

const cookies = {
  admin: '',
  dispatcher: '',
  customer_service: '',
  supervisor: '',
};

const userIds = {
  admin: 0,
  dispatcher: 0,
  customer_service: 0,
  supervisor: 0,
};

let passed = 0;
let failed = 0;

function testPass(name) { passed++; console.log(`  ✅ ${name}`); }
function testFail(name, reason) { failed++; console.log(`  ❌ ${name}\n     原因: ${reason}`); }
function assertEq(actual, expected, testName, detail = '') {
  if (actual === expected) testPass(testName);
  else testFail(testName, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}。${detail}`);
}
function assertTrue(cond, testName, detail = '') {
  if (cond) testPass(testName);
  else testFail(testName, detail || '条件为 false');
}
function assertContains(str, substr, testName) {
  if (str && str.includes(substr)) testPass(testName);
  else testFail(testName, `期望字符串包含 "${substr}"，实际: ${JSON.stringify(str)}`);
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
  return {
    status: response.status,
    ok: response.ok,
    data,
    cookie: setCookie ? setCookie.split(';')[0] : cookie,
    rawContentType: contentType,
  };
}

async function login(role) {
  const accounts = {
    admin: { username: 'admin', password: '123456' },
    dispatcher: { username: 'dispatcher', password: '123456' },
    customer_service: { username: 'customer_service', password: '123456' },
    supervisor: { username: 'supervisor', password: '123456' },
  };
  const acc = accounts[role];
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(acc),
  }, cookies[role]);
  cookies[role] = res.cookie;
  userIds[role] = res.data?.data?.id || 0;
  return res;
}

async function createCompletedOrder(cookie, suffix = '') {
  const createRes = await apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerName: `售后测试客户_${UNIQUE_TOKEN}${suffix}`,
      customerPhone: '13900000000',
      customerAddress: '售后测试地址',
      serviceType: '空调维修',
      description: `售后测试_${UNIQUE_TOKEN}${suffix}`,
      scheduledStartTime: getTestTime(9),
      scheduledEndTime: getTestTime(11),
    }),
  }, cookie);
  const order = createRes.data.data;
  if (!order) return null;

  await apiRequest(`/orders/${order.id}/assign`, {
    method: 'PUT',
    body: JSON.stringify({ technicianId: 1 }),
  }, cookie);

  await apiRequest(`/orders/${order.id}/confirm`, { method: 'PUT' }, cookie);
  await apiRequest(`/orders/${order.id}/start`, { method: 'PUT' }, cookie);
  const completeRes = await apiRequest(`/orders/${order.id}/complete`, {
    method: 'PUT',
    body: JSON.stringify({ remark: '完成测试' }),
  }, cookie);

  return completeRes.data?.data || order;
}

async function main() {
  console.log('\n=== 售后回访与申诉处理模块 回归测试 ===\n');

  console.log('步骤1: 登录所有角色账号');
  for (const role of ['admin', 'dispatcher', 'customer_service', 'supervisor']) {
    const res = await login(role);
    assertTrue(res.ok && res.data?.data?.role === role, `${role} 登录成功，角色正确`);
  }

  nextTestDay();

  console.log('\n--- 测试组1: 权限边界测试 ---');

  let res;
  res = await apiRequest('/after-sale/configs', { method: 'PUT', body: JSON.stringify({ config_key: 'test', config_value: '1' }) }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能修改售后配置（403）');

  res = await apiRequest('/after-sale/visits/import', { method: 'POST', body: JSON.stringify({ csvContent: '' }) }, cookies.supervisor);
  assertEq(res.status, 403, '主管不能导入回访名单（403）');

  res = await apiRequest('/after-sale/templates', { method: 'POST', body: JSON.stringify({ name: 't', content: 'c' }) }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能创建回访模板（403）');

  res = await apiRequest('/after-sale/categories', { method: 'POST', body: JSON.stringify({ name: 't' }) }, cookies.supervisor);
  assertEq(res.status, 403, '主管不能创建申诉分类（403）');

  res = await apiRequest('/after-sale/appeals/99999/accept', { method: 'POST', body: JSON.stringify({ remark: 'x' }) }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能受理申诉（403）');

  res = await apiRequest('/after-sale/visits/99999/cancel', { method: 'POST', body: JSON.stringify({ remark: 'x' }) }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能取消回访（403）');

  nextTestDay();

  console.log('\n--- 测试组2: 配置管理测试（管理员）---');

  res = await apiRequest('/after-sale/templates', {
    method: 'POST',
    body: JSON.stringify({ name: `测试模板_${UNIQUE_TOKEN}`, content: '测试回访话术内容' }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员创建回访模板成功');
  const tplId = res.data?.data?.id;
  assertTrue(tplId > 0, '创建模板返回有效ID');

  res = await apiRequest('/after-sale/templates', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data) && res.data.data.length >= 1, '模板列表查询正常');

  res = await apiRequest(`/after-sale/templates/${tplId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: `测试模板_更新_${UNIQUE_TOKEN}`, content: '更新后内容' }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员更新回访模板成功');

  res = await apiRequest(`/after-sale/templates/${tplId}/enabled`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: 0 }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员停用模板成功');
  assertEq(res.data?.data?.enabled, 0, '模板状态为停用');

  res = await apiRequest('/after-sale/categories', {
    method: 'POST',
    body: JSON.stringify({ name: `测试分类_${UNIQUE_TOKEN}`, description: '测试申诉分类' }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员创建申诉分类成功');
  const catId = res.data?.data?.id;

  res = await apiRequest('/after-sale/categories', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data) && res.data.data.length >= 1, '分类列表查询正常');

  res = await apiRequest('/after-sale/configs', {
    method: 'PUT',
    body: JSON.stringify({ config_key: 'visit_timeout_hours', config_value: '48', description: '测试更新' }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员更新参数配置成功');
  assertEq(res.data?.data?.config_value, '48', '超时时间更新为48小时');

  nextTestDay();

  console.log('\n--- 测试组3: 回访全流程测试 ---');

  const order1 = await createCompletedOrder(cookies.admin, '_A');
  assertTrue(order1?.status === 'completed', '创建已完成工单成功');

  res = await apiRequest('/after-sale/visits', {
    method: 'POST',
    body: JSON.stringify({ order_id: order1.id, template_id: tplId }),
  }, cookies.customer_service);
  assertEq(res.ok, true, '客服对已完成工单发起回访成功');
  const visitId = res.data?.data?.id;
  assertTrue(visitId > 0, '回访记录ID有效');
  assertEq(res.data?.data?.status, 'pending', '回访初始状态为 pending');
  assertEq(res.data?.data?.initiator_id, userIds.customer_service, '回访发起人正确');

  res = await apiRequest('/after-sale/visits', {
    method: 'POST',
    body: JSON.stringify({ order_id: order1.id }),
  }, cookies.customer_service);
  assertEq(res.ok, false, '同一工单重复发起回访被拦截');
  assertContains(res.data?.error || '', '已有未完成的回访', '重复回访提示正确');

  res = await apiRequest(`/after-sale/visits/${visitId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ result: 'satisfied', remark: `测试满意_${UNIQUE_TOKEN}` }),
  }, cookies.customer_service);
  assertEq(res.ok, true, '客服登记回访结果（满意）成功');
  assertEq(res.data?.data?.status, 'completed', '回访状态变为 completed');
  assertEq(res.data?.data?.result, 'satisfied', '回访结果正确');

  res = await apiRequest(`/after-sale/visits/${visitId}`, { method: 'GET' }, cookies.customer_service);
  assertEq(res.ok, true, '客服查看自己的回访详情成功');
  assertTrue(Array.isArray(res.data?.data?.histories), '回访详情包含处理历史');
  assertTrue(res.data?.data?.available_actions?.can_submit_appeal === true, '已完成回访可提交申诉');

  res = await apiRequest('/after-sale/visits', { method: 'GET' }, cookies.supervisor);
  assertTrue(Array.isArray(res.data?.data) && res.data.data.length >= 1, '主管可查看所有回访记录');

  nextTestDay();

  console.log('\n--- 测试组4: 申诉全流程测试 ---');

  const order2 = await createCompletedOrder(cookies.admin, '_B');
  res = await apiRequest('/after-sale/visits', {
    method: 'POST',
    body: JSON.stringify({ order_id: order2.id }),
  }, cookies.customer_service);
  const visitId2 = res.data?.data?.id;

  res = await apiRequest(`/after-sale/visits/${visitId2}/complete`, {
    method: 'POST',
    body: JSON.stringify({ result: 'dissatisfied', remark: '客户不满意' }),
  }, cookies.customer_service);

  res = await apiRequest('/after-sale/appeals', {
    method: 'POST',
    body: JSON.stringify({
      visit_id: visitId2,
      category_id: catId,
      reason: `服务态度很差，强烈投诉_${UNIQUE_TOKEN}`,
    }),
  }, cookies.customer_service);
  assertEq(res.ok, true, '客服提交申诉成功');
  const appealId = res.data?.data?.id;
  assertTrue(appealId > 0, '申诉ID有效');
  assertEq(res.data?.data?.status, 'pending', '申诉初始状态为 pending');
  assertEq(res.data?.data?.submitter_id, userIds.customer_service, '申诉提交人正确');

  res = await apiRequest('/after-sale/appeals', {
    method: 'POST',
    body: JSON.stringify({ visit_id: visitId2, category_id: catId, reason: '重复提交测试' }),
  }, cookies.customer_service);
  assertEq(res.ok, false, '同一回访重复提交申诉被拦截');
  assertContains(res.data?.error || '', '已有处理中的申诉', '重复申诉提示正确');

  res = await apiRequest(`/after-sale/appeals/${appealId}`, { method: 'GET' }, cookies.admin);
  assertTrue(res.data?.data?.available_actions?.can_accept === true, '管理员详情页可受理');

  res = await apiRequest(`/after-sale/appeals/${appealId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ remark: '已受理，正在核实' }),
  }, cookies.supervisor);
  assertEq(res.ok, true, '主管受理申诉成功');
  assertEq(res.data?.data?.status, 'accepted', '申诉状态变为 accepted');
  assertEq(res.data?.data?.handler_name, '王主管', '处理人为主管');

  res = await apiRequest(`/after-sale/appeals/${appealId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ remark: `已妥善解决，客户表示满意_${UNIQUE_TOKEN}` }),
  }, cookies.supervisor);
  assertEq(res.ok, true, '主管标记申诉解决成功');
  assertEq(res.data?.data?.status, 'resolved', '申诉状态变为 resolved');

  res = await apiRequest(`/after-sale/appeals/${appealId}`, { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data?.histories) && res.data.data.histories.length >= 3, '申诉历史包含提交+受理+解决');

  nextTestDay();

  console.log('\n--- 测试组5: 申诉驳回、转派与撤回测试 ---');

  const order3 = await createCompletedOrder(cookies.admin, '_C');
  res = await apiRequest('/after-sale/visits', { method: 'POST', body: JSON.stringify({ order_id: order3.id }) }, cookies.customer_service);
  const visitId3 = res.data?.data?.id;
  await apiRequest(`/after-sale/visits/${visitId3}/complete`, {
    method: 'POST',
    body: JSON.stringify({ result: 'dissatisfied' }),
  }, cookies.customer_service);

  res = await apiRequest('/after-sale/appeals', {
    method: 'POST',
    body: JSON.stringify({ visit_id: visitId3, category_id: catId, reason: `驳回测试申诉_${UNIQUE_TOKEN}` }),
  }, cookies.customer_service);
  const appealId2 = res.data?.data?.id;

  res = await apiRequest(`/after-sale/appeals/${appealId2}/reject`, {
    method: 'POST',
    body: JSON.stringify({ remark: '证据不足，驳回申诉' }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员驳回申诉成功');
  assertEq(res.data?.data?.status, 'rejected', '申诉状态变为 rejected');

  res = await apiRequest(`/after-sale/appeals/${appealId2}/withdraw`, {
    method: 'POST',
    body: JSON.stringify({ remark: '尝试撤回' }),
  }, cookies.customer_service);
  assertEq(res.ok, false, '已驳回申诉禁止撤回');
  assertContains(res.data?.error || '', '已驳回', '撤回提示正确');

  const order4 = await createCompletedOrder(cookies.admin, '_D');
  res = await apiRequest('/after-sale/visits', { method: 'POST', body: JSON.stringify({ order_id: order4.id }) }, cookies.customer_service);
  const visitId4 = res.data?.data?.id;
  await apiRequest(`/after-sale/visits/${visitId4}/complete`, {
    method: 'POST',
    body: JSON.stringify({ result: 'dissatisfied' }),
  }, cookies.customer_service);

  res = await apiRequest('/after-sale/appeals', {
    method: 'POST',
    body: JSON.stringify({ visit_id: visitId4, category_id: catId, reason: `撤回测试申诉_${UNIQUE_TOKEN}` }),
  }, cookies.customer_service);
  const appealId3 = res.data?.data?.id;

  res = await apiRequest(`/after-sale/appeals/${appealId3}/withdraw`, {
    method: 'POST',
    body: JSON.stringify({ remark: '客户主动撤诉' }),
  }, cookies.customer_service);
  assertEq(res.ok, true, '提交人撤回待受理申诉成功');
  assertEq(res.data?.data?.status, 'withdrawn', '申诉状态变为 withdrawn');

  res = await apiRequest(`/after-sale/appeals/${appealId3}/withdraw`, {
    method: 'POST',
  }, cookies.admin);
  assertEq(res.ok, false, '非提交人不能撤回申诉');
  assertContains(res.data?.error || '', '只有申诉提交人', '撤回权限提示正确');

  const order5 = await createCompletedOrder(cookies.admin, '_E');
  res = await apiRequest('/after-sale/visits', { method: 'POST', body: JSON.stringify({ order_id: order5.id }) }, cookies.customer_service);
  const visitId5 = res.data?.data?.id;
  await apiRequest(`/after-sale/visits/${visitId5}/complete`, {
    method: 'POST',
    body: JSON.stringify({ result: 'dissatisfied' }),
  }, cookies.customer_service);

  res = await apiRequest('/after-sale/appeals', {
    method: 'POST',
    body: JSON.stringify({ visit_id: visitId5, category_id: catId, reason: `转派测试申诉_${UNIQUE_TOKEN}` }),
  }, cookies.customer_service);
  const appealId4 = res.data?.data?.id;

  res = await apiRequest(`/after-sale/appeals/${appealId4}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ target_handler_id: 1, remark: '请管理员处理' }),
  }, cookies.supervisor);
  assertEq(res.ok, true, '主管转派申诉成功');
  assertEq(res.data?.data?.status, 'reassigned', '申诉状态变为 reassigned');

  nextTestDay();

  console.log('\n--- 测试组6: CSV 导入校验测试 ---');

  const order6 = await createCompletedOrder(cookies.admin, '_F');

  let badCsv1 = '回访模板ID,预约回访时间\n1,2025-01-01 10:00';
  res = await apiRequest('/after-sale/visits/import', {
    method: 'POST',
    body: JSON.stringify({ csvContent: badCsv1 }),
  }, cookies.admin);
  assertEq(res.ok, true, '导入接口调用成功');
  assertEq(res.data?.data?.failed > 0, true, '缺少必填列时导入失败');
  assertTrue(res.data?.data?.errors.some(e => e.reason.includes('缺少必需列')), '错误信息包含缺少必需列');

  let badCsv2 = `工单号,回访模板ID,预约回访时间\nINVALID_NO,1,2025-01-01 10:00`;
  res = await apiRequest('/after-sale/visits/import', {
    method: 'POST',
    body: JSON.stringify({ csvContent: badCsv2 }),
  }, cookies.admin);
  assertEq(res.data?.data?.failed > 0, true, '不存在工单号时导入失败');

  let badCsv3 = `工单号,回访模板ID,预约回访时间\n${order6.order_no},1,INVALID_TIME`;
  res = await apiRequest('/after-sale/visits/import', {
    method: 'POST',
    body: JSON.stringify({ csvContent: badCsv3 }),
  }, cookies.admin);
  assertEq(res.data?.data?.failed > 0, true, '无效时间格式时导入失败');

  const order7 = await createCompletedOrder(cookies.admin, '_G');
  const order8 = await createCompletedOrder(cookies.admin, '_H');

  let goodCsv = `工单号,回访模板ID,预约回访时间\n${order7.order_no},,${getTestTime(10)}\n${order8.order_no},,${getTestTime(14)}`;
  res = await apiRequest('/after-sale/visits/import', {
    method: 'POST',
    body: JSON.stringify({ csvContent: goodCsv }),
  }, cookies.admin);
  assertEq(res.data?.data?.total, 2, '导入总数正确（2条）');
  assertEq(res.data?.data?.success, 2, '两条数据导入全部成功');
  assertEq(res.data?.data?.failed, 0, '导入无失败');

  let dupCsv = `工单号,回访模板ID,预约回访时间\n${order7.order_no},,${getTestTime(10)}\n${order7.order_no},,${getTestTime(11)}`;
  res = await apiRequest('/after-sale/visits/import', {
    method: 'POST',
    body: JSON.stringify({ csvContent: dupCsv }),
  }, cookies.admin);
  assertEq(res.data?.data?.failed >= 1, true, 'CSV内重复工单号被检测');

  nextTestDay();

  console.log('\n--- 测试组7: CSV 导入原子性测试 ---');

  const order9 = await createCompletedOrder(cookies.admin, '_I');
  const order10 = await createCompletedOrder(cookies.admin, '_J');

  const prevVisits = await apiRequest('/after-sale/visits', { method: 'GET' }, cookies.admin);
  const prevCount = prevVisits.data?.data?.length || 0;

  let partialBadCsv = `工单号,回访模板ID,预约回访时间\n${order9.order_no},,${getTestTime(10)}\nBAD_ORDER,,${getTestTime(11)}\n${order10.order_no},,${getTestTime(12)}`;
  res = await apiRequest('/after-sale/visits/import', {
    method: 'POST',
    body: JSON.stringify({ csvContent: partialBadCsv }),
  }, cookies.admin);
  assertEq(res.data?.data?.success, 2, '有效行导入成功（2条）');
  assertEq(res.data?.data?.failed, 1, '无效行导入失败（1条）');

  const afterVisits = await apiRequest('/after-sale/visits', { method: 'GET' }, cookies.admin);
  const afterCount = afterVisits.data?.data?.length || 0;
  assertEq(afterCount - prevCount, 2, '只写入了2条有效数据，失败的1条未写入半截数据');

  nextTestDay();

  console.log('\n--- 测试组8: CSV 导出内容测试 ---');

  res = await apiRequest('/after-sale/visits/export', { method: 'GET' }, cookies.admin);
  assertTrue(res.rawContentType.includes('text/csv'), '回访导出 Content-Type 为 text/csv');
  const visitCsv = res.data?._rawText || '';
  assertTrue(visitCsv.startsWith('\ufeff'), '回访导出 CSV 包含 UTF-8 BOM');
  assertContains(visitCsv, '回访ID,工单号,客户姓名', '回访导出表头正确');
  assertContains(visitCsv, UNIQUE_TOKEN, '回访导出内容包含测试标记');

  res = await apiRequest('/after-sale/visits/export?status=completed', { method: 'GET' }, cookies.admin);
  const completedCsv = res.data?._rawText || '';
  assertContains(completedCsv, '已完成', '按状态筛选导出包含已完成记录');

  res = await apiRequest('/after-sale/appeals/export', { method: 'GET' }, cookies.admin);
  assertTrue(res.rawContentType.includes('text/csv'), '申诉导出 Content-Type 为 text/csv');
  const appealCsv = res.data?._rawText || '';
  assertTrue(appealCsv.startsWith('\ufeff'), '申诉导出 CSV 包含 UTF-8 BOM');
  assertContains(appealCsv, '申诉ID,回访ID,工单号', '申诉导出表头正确');
  assertContains(appealCsv, UNIQUE_TOKEN, '申诉导出内容包含测试标记');

  nextTestDay();

  console.log('\n--- 测试组9: 操作日志记录测试 ---');

  res = await apiRequest('/after-sale/logs?limit=50', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data), '操作日志列表正常返回');
  const logs = res.data?.data || [];
  assertTrue(logs.some(l => l.operation_type === 'template_created'), '日志包含创建模板记录');
  assertTrue(logs.some(l => l.operation_type === 'config_updated'), '日志包含更新配置记录');
  assertTrue(logs.some(l => l.operation_type === 'appeal_accepted'), '日志包含受理申诉记录');
  assertTrue(logs.some(l => l.operation_type === 'appeal_withdrawn'), '日志包含撤回申诉记录');
  assertTrue(logs.some(l => l.operation_type === 'import_failure' || l.operation_type === 'import_success'), '日志包含导入记录');
  assertTrue(logs.some(l => l.operation_type === 'visit_completed'), '日志包含完成回访记录');
  assertTrue(logs.some(l => l.detail && l.detail.includes(UNIQUE_TOKEN)), '日志详情包含测试标记');

  console.log('\n=== 测试结果汇总 ===');
  console.log(`通过: ${passed}, 失败: ${failed}`);
  console.log(`\n测试数据标记 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
