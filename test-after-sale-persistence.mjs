import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
const UNIQUE_TOKEN = process.argv[2];

if (!UNIQUE_TOKEN) {
  console.error('用法: node test-after-sale-persistence.mjs <UNIQUE_TOKEN>');
  process.exit(1);
}

console.log(`持久化验证 - 使用 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);

const cookies = {
  admin: '',
  customer_service: '',
  supervisor: '',
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
    customer_service: { username: 'customer_service', password: '123456' },
    supervisor: { username: 'supervisor', password: '123456' },
  };
  const acc = accounts[role];
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(acc),
  }, cookies[role]);
  cookies[role] = res.cookie;
  return res;
}

async function main() {
  console.log('\n=== 售后模块重启后持久化验证 ===\n');

  for (const role of ['admin', 'customer_service', 'supervisor']) {
    const res = await login(role);
    assertTrue(res.ok, `${role} 登录成功`);
  }

  console.log('\n--- 验证组1: 回访记录持久化 ---');

  let res = await apiRequest('/after-sale/visits', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data), '回访列表查询正常');
  const visits = res.data?.data || [];
  assertTrue(visits.length >= 5, `重启后回访记录数量足够（>=5），实际: ${visits.length}`);

  const completedVisits = visits.filter(v => v.status === 'completed' && v.customer_name && v.customer_name.includes(UNIQUE_TOKEN));
  assertTrue(completedVisits.length >= 3, `重启后存在含测试标记的已完成回访（>=3），实际: ${completedVisits.length}`);

  const pendingVisits = visits.filter(v => v.status === 'pending');
  assertTrue(pendingVisits.length >= 1, `重启后有待处理回访，实际: ${pendingVisits.length}`);

  const sampleVisit = completedVisits[0];
  if (sampleVisit) {
    assertTrue(sampleVisit.initiator_name === '李客服' || sampleVisit.result === 'satisfied' || sampleVisit.result === 'dissatisfied',
      '回访记录发起人或结果字段完整保留');
    res = await apiRequest(`/after-sale/visits/${sampleVisit.id}`, { method: 'GET' }, cookies.admin);
    assertTrue(Array.isArray(res.data?.data?.histories), `回访 #${sampleVisit.id} 详情含处理历史（重启后）`);
  }

  console.log('\n--- 验证组2: 申诉记录持久化 ---');

  res = await apiRequest('/after-sale/appeals', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data), '申诉列表查询正常');
  const appeals = res.data?.data || [];
  assertTrue(appeals.length >= 4, `重启后申诉记录数量足够（>=4），实际: ${appeals.length}`);

  const resolvedAppeals = appeals.filter(a => a.status === 'resolved');
  assertTrue(resolvedAppeals.length >= 1, `重启后存在已解决申诉，实际: ${resolvedAppeals.length}`);

  const withdrawnAppeals = appeals.filter(a => a.status === 'withdrawn');
  assertTrue(withdrawnAppeals.length >= 1, `重启后存在已撤回申诉，实际: ${withdrawnAppeals.length}`);

  const rejectedAppeals = appeals.filter(a => a.status === 'rejected');
  assertTrue(rejectedAppeals.length >= 1, `重启后存在已驳回申诉，实际: ${rejectedAppeals.length}`);

  const markedAppeals = appeals.filter(a => a.reason && a.reason.includes(UNIQUE_TOKEN));
  assertTrue(markedAppeals.length >= 4, `重启后申诉理由包含测试标记（>=4条），实际: ${markedAppeals.length}`);

  const sampleAppeal = resolvedAppeals[0] || appeals[0];
  if (sampleAppeal) {
    res = await apiRequest(`/after-sale/appeals/${sampleAppeal.id}`, { method: 'GET' }, cookies.admin);
    assertTrue(Array.isArray(res.data?.data?.histories) && res.data.data.histories.length >= 2,
      `申诉 #${sampleAppeal.id} 详情含处理历史（>=2条，重启后）`);
  }

  console.log('\n--- 验证组3: 配置变更持久化 ---');

  res = await apiRequest('/after-sale/configs', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data), '配置列表查询正常');
  const configs = res.data?.data || [];

  const visitTimeout = configs.find(c => c.config_key === 'visit_timeout_hours');
  assertTrue(visitTimeout, '存在 visit_timeout_hours 配置项');
  assertEq(visitTimeout?.config_value, '48', '重启后回访超时时间保持 48 小时（测试中更新的值）');

  const appealImgReq = configs.find(c => c.config_key === 'appeal_image_required');
  assertTrue(appealImgReq, '存在 appeal_image_required 配置项');

  res = await apiRequest('/after-sale/templates', { method: 'GET' }, cookies.admin);
  const templates = res.data?.data || [];
  const testTpl = templates.find(t => t.name && t.name.includes(UNIQUE_TOKEN));
  assertTrue(testTpl, `重启后存在测试标记的回访模板: ${testTpl?.name || '未找到'}`);
  assertEq(testTpl?.enabled, 0, '重启后模板停用状态保持（测试中设为停用）');

  res = await apiRequest('/after-sale/categories', { method: 'GET' }, cookies.admin);
  const categories = res.data?.data || [];
  const testCat = categories.find(c => c.name && c.name.includes(UNIQUE_TOKEN));
  assertTrue(testCat, `重启后存在测试标记的申诉分类: ${testCat?.name || '未找到'}`);

  console.log('\n--- 验证组4: 操作日志持久化 ---');

  res = await apiRequest('/after-sale/logs?limit=200', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data), '操作日志查询正常');
  const logs = res.data?.data || [];
  assertTrue(logs.length >= 10, `重启后操作日志数量足够（>=10），实际: ${logs.length}`);

  const opTypes = new Set(logs.map(l => l.operation_type));
  assertTrue(opTypes.has('template_created'), '日志含 template_created');
  assertTrue(opTypes.has('config_updated'), '日志含 config_updated');
  assertTrue(opTypes.has('visit_created'), '日志含 visit_created');
  assertTrue(opTypes.has('appeal_created'), '日志含 appeal_created');
  assertTrue(opTypes.has('appeal_accepted'), '日志含 appeal_accepted');
  assertTrue(opTypes.has('appeal_resolved'), '日志含 appeal_resolved');
  assertTrue(opTypes.has('appeal_withdrawn'), '日志含 appeal_withdrawn');
  assertTrue(opTypes.has('import_success') || opTypes.has('import_failure'), '日志含导入记录');

  const markedLogs = logs.filter(l => l.detail && l.detail.includes(UNIQUE_TOKEN));
  assertTrue(markedLogs.length >= 5, `重启后日志详情含测试标记（>=5条），实际: ${markedLogs.length}`);

  console.log('\n--- 验证组5: 导出接口重启后仍可用 ---');

  res = await apiRequest('/after-sale/visits/export', { method: 'GET' }, cookies.admin);
  assertTrue(res.rawContentType.includes('text/csv'), '重启后回访导出 Content-Type 正常');
  const visitCsv = res.data?._rawText || '';
  assertTrue(visitCsv.startsWith('\ufeff'), '重启后回访导出含 UTF-8 BOM');
  assertContains(visitCsv, '回访ID,工单号,客户姓名', '重启后回访导出表头正确');
  assertContains(visitCsv, UNIQUE_TOKEN, '重启后回访导出含测试标记数据');

  res = await apiRequest('/after-sale/appeals/export', { method: 'GET' }, cookies.admin);
  assertTrue(res.rawContentType.includes('text/csv'), '重启后申诉导出 Content-Type 正常');
  const appealCsv = res.data?._rawText || '';
  assertTrue(appealCsv.startsWith('\ufeff'), '重启后申诉导出含 UTF-8 BOM');
  assertContains(appealCsv, '申诉ID,回访ID,工单号', '重启后申诉导出表头正确');
  assertContains(appealCsv, UNIQUE_TOKEN, '重启后申诉导出含测试标记数据');

  console.log('\n=== 持久化验证结果汇总 ===');
  console.log(`通过: ${passed}, 失败: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('持久化验证异常:', err);
  process.exit(1);
});
