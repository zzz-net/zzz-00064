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

const cookies = { admin: '', dispatcher: '', customer_service: '', supervisor: '' };
const userIds = { admin: 0, dispatcher: 0, customer_service: 0, supervisor: 0 };

let passed = 0;
let failed = 0;

function testPass(name) { passed++; console.log(`  ✅ ${name}`); }
function testFail(name, reason) { failed++; console.log(`  ❌ ${name}\n     原因: ${reason}`); }
function assertEq(a, b, n, d = '') { if (a === b) testPass(n); else testFail(n, `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}。${d}`); }
function assertTrue(cond, n, d = '') { if (cond) testPass(n); else testFail(n, d || '条件为 false'); }
function assertContains(str, sub, n) { if (str && str.includes(sub)) testPass(n); else testFail(n, `期望包含 "${sub}"，实际: ${JSON.stringify(str)}`); }

async function apiRequest(path, options = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (cookie) headers.Cookie = cookie;
  let body = options.body;
  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof Buffer) && !(body instanceof Uint8Array)) {
    body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE_URL}${path}`, { ...options, headers, body });
  const setCookie = r.headers.get('set-cookie');
  const ct = r.headers.get('content-type') || '';
  let data;
  if (ct.includes('application/json')) data = await r.json();
  else data = { _rawText: await r.text(), _contentType: ct };
  return { status: r.status, ok: r.ok, data, cookie: setCookie ? setCookie.split(';')[0] : cookie, rawContentType: ct };
}

async function login(role) {
  const accounts = { admin: { username: 'admin', password: '123456' }, dispatcher: { username: 'dispatcher', password: '123456' }, customer_service: { username: 'customer_service', password: '123456' }, supervisor: { username: 'supervisor', password: '123456' } };
  const a = accounts[role];
  const r = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(a) }, cookies[role]);
  cookies[role] = r.cookie;
  userIds[role] = r.data?.data?.id || 0;
  return r;
}

async function createCompletedOrder(cookie, suffix = '') {
  const c = await apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerName: `知识库测试客户_${UNIQUE_TOKEN}${suffix}`,
      customerPhone: '13900000000', customerAddress: 'KB测试地址',
      serviceType: '空调维修',
      description: `知识库测试_${UNIQUE_TOKEN}${suffix} 空调不制冷 制冷效果差`,
      scheduledStartTime: getTestTime(9), scheduledEndTime: getTestTime(11),
    }),
  }, cookie);
  const order = c.data?.data;
  if (!order) return null;
  await apiRequest(`/orders/${order.id}/assign`, { method: 'PUT', body: JSON.stringify({ technicianId: 1 }) }, cookie);
  await apiRequest(`/orders/${order.id}/confirm`, { method: 'PUT' }, cookie);
  await apiRequest(`/orders/${order.id}/start`, { method: 'PUT' }, cookie);
  const cp = await apiRequest(`/orders/${order.id}/complete`, { method: 'PUT', body: JSON.stringify({ remark: '完成' }) }, cookie);
  return cp.data?.data || order;
}

async function main() {
  console.log('\n=== 售后知识库模块 回归测试 ===\n');

  console.log('步骤1: 登录所有角色账号');
  for (const role of ['admin', 'dispatcher', 'customer_service', 'supervisor']) {
    const r = await login(role);
    assertTrue(r.ok && r.data?.data?.role === role, `${role} 登录成功，角色正确`);
  }
  nextTestDay();

  console.log('\n--- 测试组1: 权限边界测试 ---');

  let res;
  res = await apiRequest('/knowledge/configs', { method: 'PUT', body: JSON.stringify({ config_key: 'a', config_value: '1' }) }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能修改知识库配置（403）');

  res = await apiRequest('/knowledge/categories', { method: 'POST', body: JSON.stringify({ name: 't' }) }, cookies.supervisor);
  assertEq(res.status, 403, '主管不能创建分类（403）');

  res = await apiRequest('/knowledge/entries/import', { method: 'POST', body: JSON.stringify({ csvContent: '' }) }, cookies.supervisor);
  assertEq(res.status, 403, '主管不能导入知识条目（403）');

  res = await apiRequest('/knowledge/entries/99999/disable', { method: 'POST', body: {} }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能停用条目（403）');

  res = await apiRequest('/knowledge/entries/99999/approve', { method: 'POST', body: {} }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能审核发布（403）');

  res = await apiRequest('/knowledge/entries/99999/rollback', { method: 'POST', body: {} }, cookies.customer_service);
  assertEq(res.status, 403, '客服不能回滚版本（403）');

  nextTestDay();

  console.log('\n--- 测试组2: 分类与配置管理 ---');
  const catBefore = await apiRequest('/knowledge/categories', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(catBefore.data?.data) && catBefore.data.data.length >= 5, '默认分类已正确初始化（>=5个）');

  res = await apiRequest('/knowledge/categories', {
    method: 'POST',
    body: JSON.stringify({ name: `测试分类_${UNIQUE_TOKEN}`, description: 'KB测试', sort_order: 99 }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员创建分类成功');
  const catId = res.data?.data?.id;
  assertTrue(catId > 0, '分类ID有效');

  res = await apiRequest('/knowledge/categories', {
    method: 'POST',
    body: JSON.stringify({ name: `测试分类_${UNIQUE_TOKEN}` }),
  }, cookies.admin);
  assertEq(res.ok, false, '重名分类创建被拦截');

  res = await apiRequest(`/knowledge/categories/${catId}/enabled`, {
    method: 'PUT', body: JSON.stringify({ enabled: 0 }),
  }, cookies.admin);
  assertEq(res.ok && res.data?.data?.enabled === 0, true, '管理员停用分类成功');
  res = await apiRequest(`/knowledge/categories/${catId}/enabled`, {
    method: 'PUT', body: JSON.stringify({ enabled: 1 }),
  }, cookies.admin);
  assertEq(res.ok && res.data?.data?.enabled === 1, true, '管理员重新启用分类成功');

  res = await apiRequest('/knowledge/configs', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data) && res.data.data.length >= 3, '知识库配置项正确初始化（>=3个）');

  res = await apiRequest('/knowledge/configs', {
    method: 'PUT',
    body: JSON.stringify({ config_key: 'knowledge_match_threshold', config_value: '55', description: '测试更新' }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员更新匹配阈值成功');
  assertEq(res.data?.data?.config_value, '55', '阈值已更新为55');

  nextTestDay();

  console.log('\n--- 测试组3: 知识条目全流程（创建→审核→发布→停用→回滚）---');

  res = await apiRequest('/knowledge/entries', {
    method: 'POST',
    body: JSON.stringify({
      title: `空调制冷差快速排查_${UNIQUE_TOKEN}`,
      question: '客户反馈空调制冷效果差，常见原因有哪些？',
      answer: `1. 过滤网积灰堵塞\n2. 室外机被遮挡\n3. 氟利昂泄漏（压力<4.5kg）\n4. 设定温度过高\n5. 门窗未关紧_${UNIQUE_TOKEN}`,
      applicable_products: '家用挂机、柜机 1-5匹',
      escalation_condition: '连续3台同型号出现同样症状',
      escalation_threshold: 3,
      category_id: 1,
      tags: '空调,制冷,氟利昂',
      expires_at: getTestTime(24 * 60),
    }),
  }, cookies.customer_service);
  assertEq(res.ok, true, '客服创建草稿条目成功');
  const entryId = res.data?.data?.id;
  assertTrue(entryId > 0, '条目ID有效');
  assertEq(res.data?.data?.status, 'draft', '初始状态为草稿（draft）');
  assertEq(res.data?.data?.version, 1, '初始版本号为 1');

  res = await apiRequest('/knowledge/entries', {
    method: 'POST',
    body: JSON.stringify({ title: `空调制冷差快速排查_${UNIQUE_TOKEN}`, category_id: 1 }),
  }, cookies.customer_service);
  assertEq(res.ok, false, '重复标题创建被拦截');
  assertContains(res.data?.error || '', '标题已存在', '重复标题提示正确');

  res = await apiRequest(`/knowledge/entries/${entryId}`, { method: 'GET' }, cookies.customer_service);
  assertTrue(res.data?.data?.available_actions?.can_submit === true, '创建者详情页可提交审核');
  assertTrue(res.data?.data?.available_actions?.can_edit === true, '创建者详情页可编辑');

  res = await apiRequest(`/knowledge/entries/${entryId}/submit`, { method: 'POST' }, cookies.customer_service);
  assertEq(res.ok, true, '客服提交审核成功');
  assertEq(res.data?.data?.status, 'pending_review', '状态变为待审核');

  res = await apiRequest(`/knowledge/entries/${entryId}`, { method: 'GET' }, cookies.customer_service);
  assertTrue(res.data?.data?.available_actions?.can_edit === false, '审核中不可编辑');
  assertTrue(res.data?.data?.available_actions?.can_submit === false, '审核中不可重复提交');

  res = await apiRequest(`/knowledge/entries/${entryId}`, { method: 'GET' }, cookies.supervisor);
  assertTrue(res.data?.data?.available_actions?.can_approve === true, '主管详情页可审核通过');
  assertTrue(res.data?.data?.available_actions?.can_reject === true, '主管详情页可驳回');

  res = await apiRequest(`/knowledge/entries/${entryId}/approve`, {
    method: 'POST', body: JSON.stringify({ remark: `审核通过，发布启用_${UNIQUE_TOKEN}` }),
  }, cookies.supervisor);
  assertEq(res.ok, true, '主管审核通过并发布成功');
  assertEq(res.data?.data?.status, 'published', '状态变为已发布（published）');
  assertEq(res.data?.data?.published_by_name, '王主管', '发布人为王主管');

  res = await apiRequest('/knowledge/entries?status=published', { method: 'GET' }, cookies.customer_service);
  assertTrue(Array.isArray(res.data?.data) && res.data.data.some(e => e.title && e.title.includes(UNIQUE_TOKEN)),
    '客服可见已发布条目（客服数据隔离正确）');

  res = await apiRequest(`/knowledge/entries/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: `空调制冷差快速排查_${UNIQUE_TOKEN}`,
      answer: `1. 先洗过滤网_${UNIQUE_TOKEN}\n2. 再测氟压\n3. 最后排查其他`,
      change_log: `v2：优化处理话术结构_${UNIQUE_TOKEN}`,
    }),
  }, cookies.customer_service);
  assertEq(res.ok, true, '客服编辑已发布条目，生成草稿 v2 成功');
  assertEq(res.data?.data?.version, 2, '条目版本号变为 2');
  assertEq(res.data?.data?.status, 'draft', '新版本 v2 状态为 draft（旧 v1 仍保留已发布）');

  res = await apiRequest(`/knowledge/entries/${entryId}/submit`, { method: 'POST' }, cookies.customer_service);
  assertEq(res.ok, true, '客服提交 v2 审核成功');
  assertEq(res.data?.data?.status, 'pending_review', 'v2 状态变为待审核');

  res = await apiRequest(`/knowledge/entries/${entryId}/approve`, {
    method: 'POST', body: JSON.stringify({ remark: `v2 审核通过_${UNIQUE_TOKEN}` }),
  }, cookies.supervisor);
  assertEq(res.ok, true, '主管审核通过 v2 并发布成功');
  assertEq(res.data?.data?.status, 'published', 'v2 状态变为 published');
  assertEq(res.data?.data?.version, 2, '已发布版本为 v2');

  res = await apiRequest(`/knowledge/entries/${entryId}/disable`, {
    method: 'POST', body: JSON.stringify({ remark: `暂时停用_${UNIQUE_TOKEN}` }),
  }, cookies.supervisor);
  assertEq(res.ok, true, '主管停用已发布条目（v2）成功');
  assertEq(res.data?.data?.status, 'disabled', '状态变为已停用（disabled）');

  res = await apiRequest(`/knowledge/entries/${entryId}`, { method: 'GET' }, cookies.admin);
  const detailAfterDisable = res.data?.data;
  assertTrue(detailAfterDisable?.versions?.length >= 2, '条目详情含>=2个版本历史（v1和v2）');
  assertEq(detailAfterDisable?.available_actions?.can_rollback, true, '停用后可以回滚（有历史版本）');

  res = await apiRequest(`/knowledge/entries/${entryId}/rollback`, {
    method: 'POST', body: JSON.stringify({ version_no: 1 }),
  }, cookies.admin);
  assertEq(res.ok, true, '管理员回滚到 v1 并重新发布成功');
  assertEq(res.data?.data?.status, 'published', '回滚后重新发布为 published');
  assertEq(res.data?.data?.version, 3, '回滚产生新版本号 3（基于 v1 内容创建 v3）');
  assertContains(res.data?.data?.answer || '', '门窗未关紧', '回滚后内容恢复为 v1 的答案（含"门窗未关紧"）');

  nextTestDay();

  console.log('\n--- 测试组4: 驳回流程冲突测试 ---');

  res = await apiRequest('/knowledge/entries', {
    method: 'POST',
    body: JSON.stringify({ title: `驳回测试_${UNIQUE_TOKEN}`, question: 'q', answer: 'a', category_id: 2 }),
  }, cookies.customer_service);
  const e2 = res.data?.data?.id;
  await apiRequest(`/knowledge/entries/${e2}/submit`, { method: 'POST' }, cookies.customer_service);

  res = await apiRequest(`/knowledge/entries/${e2}/reject`, {
    method: 'POST', body: JSON.stringify({ remark: `描述不够详细，请补充检查步骤_${UNIQUE_TOKEN}` }),
  }, cookies.supervisor);
  assertEq(res.ok, true, '主管驳回成功（必填备注）');
  assertEq(res.data?.data?.status, 'draft', '驳回后回到草稿');
  assertContains(res.data?.data?.review_remark || '', '不够详细', '驳回备注已保存（含"不够详细"）');

  res = await apiRequest(`/knowledge/entries/${e2}/reject`, { method: 'POST', body: {} }, cookies.supervisor);
  assertEq(res.ok, false, '二次驳回报错（状态已为草稿）');

  res = await apiRequest(`/knowledge/entries/${e2}/disable`, { method: 'POST', body: {} }, cookies.supervisor);
  assertEq(res.ok, false, '草稿不能直接停用');

  nextTestDay();

  console.log('\n--- 测试组5: 匹配与命中记录 ---');

  const order1 = await createCompletedOrder(cookies.admin, '_KB1');
  assertTrue(order1?.status === 'completed', '创建空调维修测试工单成功');

  res = await apiRequest(`/knowledge/match/${order1.id}`, { method: 'POST' }, cookies.customer_service);
  assertEq(res.ok, true, '客服按工单ID匹配知识库成功');
  assertTrue(Array.isArray(res.data?.data), '匹配结果返回数组');
  console.log(`    匹配到 ${res.data?.data?.length || 0} 条结果`);
  if (res.data?.data?.length > 0) {
    const match0 = res.data.data[0];
    assertTrue(match0.entry && match0.score > 0, '单条结果含条目和匹配分数');
    assertTrue(match0.matched_by && match0.matched_keywords, '结果含匹配方式和关键词');
  }

  res = await apiRequest('/knowledge/hit-records', { method: 'GET' }, cookies.customer_service);
  const hits = res.data?.data || [];
  assertTrue(hits.length >= 1, '命中记录已写入（客服可见自己的）');
  const firstHit = hits[0];
  assertTrue(firstHit?.entry_title, '命中记录含条目标题');
  assertEq(firstHit.operator_id, userIds.customer_service, '命中记录操作人正确');

  const hitId = firstHit?.id;
  if (hitId) {
    res = await apiRequest(`/knowledge/hit-records/${hitId}/used`, {
      method: 'POST', body: JSON.stringify({ used: true }),
    }, cookies.customer_service);
    assertEq(res.ok, true, '客服标记采用命中条目成功');
    assertEq(res.data?.data?.used, 1, '采用状态为1');

    res = await apiRequest(`/knowledge/hit-records/${hitId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ effectiveness: 'helpful', feedback: `按此方案解决了问题_${UNIQUE_TOKEN}` }),
    }, cookies.customer_service);
    assertEq(res.ok, true, '客服反馈效果（很有帮助）成功');
    assertEq(res.data?.data?.effectiveness, 'helpful', '效果反馈正确');
  }

  nextTestDay();

  console.log('\n--- 测试组6: CSV导入校验测试 ---');

  let bad1 = '标题,分类,常见问题,处理话术\n测试,不存在分类,常见问题内容,话术内容';
  res = await apiRequest('/knowledge/entries/import', {
    method: 'POST', body: JSON.stringify({ csvContent: bad1 }),
  }, cookies.admin);
  assertTrue(res.ok && res.data?.data?.failed > 0, '非法分类时导入失败');
  assertTrue(res.data?.data?.errors.some(e => e.reason && e.reason.includes('非法分类')), '错误信息含"非法分类"');

  let bad2 = '分类,常见问题\n空调类,问题内容';
  res = await apiRequest('/knowledge/entries/import', {
    method: 'POST', body: JSON.stringify({ csvContent: bad2 }),
  }, cookies.admin);
  assertTrue(res.data?.data?.failed > 0, '缺少必填列（标题/处理话术）时导入失败');
  assertTrue(res.data?.data?.errors.some(e => e.reason && e.reason.includes('缺少必需列')), '错误信息含"缺少必需列"');

  let bad3 = `标题,分类,常见问题,处理话术,失效时间\n重复测试_${UNIQUE_TOKEN},空调类,问题,内容,INVALID_DATETIME`;
  res = await apiRequest('/knowledge/entries/import', {
    method: 'POST', body: JSON.stringify({ csvContent: bad3 }),
  }, cookies.admin);
  assertTrue(res.data?.data?.failed > 0, '无效时间格式导入失败');

  let bad4 = `标题,分类,常见问题,处理话术\n空调制冷差快速排查_${UNIQUE_TOKEN},空调类,问题,内容1\n空调制冷差快速排查_${UNIQUE_TOKEN},空调类,问题,内容2`;
  res = await apiRequest('/knowledge/entries/import', {
    method: 'POST', body: JSON.stringify({ csvContent: bad4 }),
  }, cookies.admin);
  assertTrue(res.data?.data?.failed >= 1, 'CSV内部重复标题被检测');

  const goodCsv = `标题,分类,常见问题,处理话术,适用商品,标签\n导入测试_A_${UNIQUE_TOKEN},空调类,客户说不凉,1.洗滤网 2.加氟,挂机1.5匹,导入,制冷\n导入测试_B_${UNIQUE_TOKEN},水电类,水龙头关不紧,1.换阀芯,厨房龙头,水龙头,漏水`;
  res = await apiRequest('/knowledge/entries/import', {
    method: 'POST', body: JSON.stringify({ csvContent: goodCsv }),
  }, cookies.admin);
  assertEq(res.data?.data?.total, 2, '导入总数=2');
  assertEq(res.data?.data?.success, 2, '导入成功=2（已自动审核发布）');
  assertEq(res.data?.data?.failed, 0, '导入失败=0');

  nextTestDay();

  console.log('\n--- 测试组7: 导入原子性（部分错误不写半截数据）---');

  const beforeList = await apiRequest('/knowledge/entries', { method: 'GET' }, cookies.admin);
  const beforeCount = beforeList.data?.data?.length || 0;

  const partialCsv = `标题,分类,常见问题,处理话术\n原子测试_好1_${UNIQUE_TOKEN},空调类,问题,内容A\n原子测试_坏_${UNIQUE_TOKEN},无效分类,问题,内容B\n原子测试_好2_${UNIQUE_TOKEN},水电类,问题,内容C`;
  res = await apiRequest('/knowledge/entries/import', {
    method: 'POST', body: JSON.stringify({ csvContent: partialCsv }),
  }, cookies.admin);
  assertEq(res.data?.data?.success, 2, '2条有效成功导入');
  assertEq(res.data?.data?.failed, 1, '1条无效分类被拒绝');

  const afterList = await apiRequest('/knowledge/entries', { method: 'GET' }, cookies.admin);
  const afterCount = afterList.data?.data?.length || 0;
  assertEq(afterCount - beforeCount, 2, '最终只新增2条有效数据，失败的1条未写入半截数据');

  nextTestDay();

  console.log('\n--- 测试组8: CSV导出内容测试 ---');

  res = await apiRequest('/knowledge/entries/export', { method: 'GET' }, cookies.admin);
  assertTrue(res.rawContentType.includes('text/csv'), '条目导出 Content-Type 为 text/csv');
  const exp1 = res.data?._rawText || '';
  assertTrue(exp1.startsWith('\ufeff'), '条目导出 CSV 含 UTF-8 BOM');
  assertContains(exp1, '条目ID,标题,分类,状态,版本', '条目导出表头正确');
  assertContains(exp1, UNIQUE_TOKEN, '条目导出内容含测试标记');

  res = await apiRequest('/knowledge/hit-records/export', { method: 'GET' }, cookies.admin);
  assertTrue(res.rawContentType.includes('text/csv'), '命中记录导出 Content-Type 为 text/csv');
  const exp2 = res.data?._rawText || '';
  assertTrue(exp2.startsWith('\ufeff'), '命中记录导出 CSV 含 UTF-8 BOM');
  assertContains(exp2, '记录ID,条目ID,条目标题,版本,工单号', '命中记录导出表头正确');

  nextTestDay();

  console.log('\n--- 测试组9: 操作日志记录 ---');

  res = await apiRequest('/knowledge/logs?limit=100', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(res.data?.data), '知识库操作日志正常返回');
  const logs = res.data?.data || [];
  const opTypes = new Set(logs.map(l => l.operation_type));
  assertTrue(opTypes.has('category_created'), '日志含分类创建');
  assertTrue(opTypes.has('config_updated'), '日志含配置更新');
  assertTrue(opTypes.has('knowledge_created'), '日志含条目创建');
  assertTrue(opTypes.has('knowledge_submitted'), '日志含提交审核');
  assertTrue(opTypes.has('knowledge_approved'), '日志含审核通过');
  assertTrue(opTypes.has('knowledge_published'), '日志含发布');
  assertTrue(opTypes.has('knowledge_rejected'), '日志含驳回');
  assertTrue(opTypes.has('knowledge_disabled'), '日志含停用');
  assertTrue(opTypes.has('knowledge_rollback'), '日志含版本回滚');
  assertTrue(opTypes.has('hit_recorded'), '日志含命中记录');
  assertTrue(opTypes.has('feedback_submitted'), '日志含效果反馈');
  assertTrue(opTypes.has('import_success') || opTypes.has('import_failure'), '日志含导入结果');
  assertTrue(logs.some(l => l.detail && l.detail.includes(UNIQUE_TOKEN)), '日志详情含测试标记');

  console.log('\n=== 测试结果汇总 ===');
  console.log(`通过: ${passed}, 失败: ${failed}`);
  console.log(`\n测试数据标记 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('测试执行异常:', err); process.exit(1); });
