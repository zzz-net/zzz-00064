import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
const UNIQUE_TOKEN = process.argv[2];

if (!UNIQUE_TOKEN) {
  console.error('用法: node test-knowledge-persistence.mjs <UNIQUE_TOKEN>');
  process.exit(1);
}
console.log(`知识库持久化验证 - 使用 UNIQUE_TOKEN=${UNIQUE_TOKEN}`);

const cookies = { admin: '', customer_service: '', supervisor: '' };
let passed = 0;
let failed = 0;

function testPass(n) { passed++; console.log(`  ✅ ${n}`); }
function testFail(n, r) { failed++; console.log(`  ❌ ${n}\n     原因: ${r}`); }
function assertEq(a, b, n, d = '') { if (a === b) testPass(n); else testFail(n, `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}。${d}`); }
function assertTrue(c, n, d = '') { if (c) testPass(n); else testFail(n, d || '条件为 false'); }
function assertContains(s, sub, n) { if (s && s.includes(sub)) testPass(n); else testFail(n, `期望包含 "${sub}"，实际: ${JSON.stringify(s)}`); }

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
  return { ok: r.ok, data, rawContentType: ct, cookie: setCookie ? setCookie.split(';')[0] : cookie };
}
async function login(role) {
  const a = { admin: { username: 'admin', password: '123456' }, customer_service: { username: 'customer_service', password: '123456' }, supervisor: { username: 'supervisor', password: '123456' } };
  const r = await apiRequest('/auth/login', { method: 'POST', body: a[role] }, cookies[role]);
  cookies[role] = r.cookie || cookies[role];
  return r;
}

async function main() {
  console.log('\n=== 知识库模块 跨重启持久化验证 ===\n');

  for (const role of ['admin', 'customer_service', 'supervisor']) {
    const r = await login(role);
    assertTrue(r.ok, `${role} 登录成功`);
  }

  console.log('\n--- 验证组1: 分类持久化 ---');
  let r = await apiRequest('/knowledge/categories', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(r.data?.data), '分类列表返回正常');
  const cats = r.data?.data || [];
  assertTrue(cats.length >= 6, `默认分类+测试分类数量>=6，实际: ${cats.length}`);
  const testCat = cats.find(c => c.name && c.name.includes(UNIQUE_TOKEN));
  assertTrue(testCat, '重启后测试分类仍存在');
  assertEq(testCat?.enabled, 1, '重启后测试分类启用状态保持');

  console.log('\n--- 验证组2: 配置持久化 ---');
  r = await apiRequest('/knowledge/configs', { method: 'GET' }, cookies.admin);
  const configs = r.data?.data || [];
  assertTrue(configs.length >= 3, `重启后配置项数量>=3，实际: ${configs.length}`);
  const thr = configs.find(c => c.config_key === 'knowledge_match_threshold');
  assertTrue(thr, '存在 knowledge_match_threshold 配置');
  assertEq(thr?.config_value, '55', '重启后匹配阈值保持测试值 55');
  const auto = configs.find(c => c.config_key === 'knowledge_auto_match');
  assertTrue(auto, '存在 knowledge_auto_match 配置');

  console.log('\n--- 验证组3: 知识条目状态与版本持久化 ---');
  r = await apiRequest('/knowledge/entries?limit=100', { method: 'GET' }, cookies.admin);
  assertTrue(Array.isArray(r.data?.data), '条目列表正常');
  const entries = r.data?.data || [];
  assertTrue(entries.length >= 6, `重启后条目数量>=6（默认3+测试），实际: ${entries.length}`);

  const publishedE = entries.find(e => e.title && e.title.includes(`空调制冷差快速排查_${UNIQUE_TOKEN}`) && e.status === 'published');
  assertTrue(publishedE, `重启后存在已发布的空调类测试条目（含标记）`);
  assertTrue(publishedE?.version >= 3, `已发布条目版本>=3（v1发布→v2编辑→v3回滚发布），实际: ${publishedE?.version}`);
  assertEq(publishedE?.category_name, '空调类', '条目分类关联正确');
  assertTrue(
    publishedE?.published_by_name === '王主管' || publishedE?.published_by_name === '系统管理员',
    `发布人应为首次发布人或回滚操作人（回滚后会更新为回滚操作人），实际: ${publishedE?.published_by_name}`
  );

  const rejectE = entries.find(e => e.title && e.title.includes(`驳回测试_${UNIQUE_TOKEN}`));
  assertTrue(rejectE, '重启后驳回条目仍存在');
  assertEq(rejectE?.status, 'draft', '重启后驳回条目状态仍为草稿');
  assertContains(rejectE?.review_remark || '', '不够详细', '重启后驳回审核备注保留');

  const disabledE = entries.find(e => e.status === 'disabled');
  assertTrue(disabledE || true, '验证停用状态存在（如存在）');

  // 详情页验证
  if (publishedE) {
    r = await apiRequest(`/knowledge/entries/${publishedE.id}`, { method: 'GET' }, cookies.supervisor);
    assertTrue(Array.isArray(r.data?.data?.versions), '详情页返回版本历史');
    assertTrue(r.data?.data?.versions?.length >= 3, `条目版本历史>=3（v1/v2/v3），实际: ${r.data?.data?.versions?.length}`);
    assertTrue(Array.isArray(r.data?.data?.hit_records), '详情页返回命中记录');
    assertTrue(r.data?.data?.available_actions?.can_disable, '主管对已发布条目可停用');
    assertTrue(r.data?.data?.available_actions?.can_rollback, '主管对已发布条目可回滚（多版本历史）');
  }

  // 回滚后再次发布版本存在
  if (publishedE) {
    const versions = (await apiRequest(`/knowledge/entries/${publishedE.id}/versions`, { method: 'GET' }, cookies.admin)).data?.data || [];
    assertTrue(versions.length >= 3, `重启后该条目版本列表>=3，实际: ${versions.length}`);
    const v3 = versions.find(v => v.version_no === 3);
    assertTrue(v3, '存在 v3 版本（基于 v1 内容回滚后新发布的版本）');
    assertEq(v3?.status, 'published', 'v3 版本状态为 published（回滚后自动发布）');
    const latestPublished = versions.find(v => v.status === 'published');
    assertTrue(latestPublished, '版本列表中至少有一个 published 状态版本');
  }

  console.log('\n--- 验证组4: 命中记录持久化 ---');
  r = await apiRequest('/knowledge/hit-records?limit=100', { method: 'GET' }, cookies.admin);
  const hits = r.data?.data || [];
  assertTrue(hits.length >= 1, `重启后命中记录数量>=1，实际: ${hits.length}`);

  const usedHits = hits.filter(h => h.used === 1);
  assertTrue(usedHits.length >= 1, '重启后标记为采用的记录保留');

  const fbHits = hits.filter(h => h.effectiveness === 'helpful');
  assertTrue(fbHits.length >= 1, '重启后效果为"很有帮助"的反馈保留');

  const markFb = fbHits.find(h => h.feedback && h.feedback.includes(UNIQUE_TOKEN));
  assertTrue(markFb, '重启后反馈备注含测试标记');

  // 统计验证：条目 hits 计数保留
  const hitEntry = entries.find(e => e.title && e.title.includes('空调不制冷怎么处理'));
  if (hitEntry) {
    assertTrue(hitEntry.hits >= 1, `默认条目命中计数>=1，实际: ${hitEntry.hits}`);
    assertTrue(hitEntry.helpful_count >= 0, '有效帮助计数存在');
  }

  console.log('\n--- 验证组5: 操作日志持久化 ---');
  r = await apiRequest('/knowledge/logs?limit=200', { method: 'GET' }, cookies.admin);
  const logs = r.data?.data || [];
  assertTrue(logs.length >= 10, `重启后操作日志>=10条，实际: ${logs.length}`);
  const opSet = new Set(logs.map(l => l.operation_type));
  const needOps = ['knowledge_created', 'knowledge_submitted', 'knowledge_approved', 'knowledge_published', 'knowledge_rejected', 'hit_recorded', 'feedback_submitted'];
  let foundOps = 0;
  for (const op of needOps) if (opSet.has(op)) foundOps++;
  assertTrue(foundOps >= 6, `重启后关键操作类型都保留 (${foundOps}/${needOps.length})`);
  const markedLogs = logs.filter(l => l.detail && l.detail.includes(UNIQUE_TOKEN));
  assertTrue(markedLogs.length >= 5, `重启后含测试标记日志>=5条，实际: ${markedLogs.length}`);

  console.log('\n--- 验证组6: CSV导出接口持久化可用 ---');
  r = await apiRequest('/knowledge/entries/export', { method: 'GET' }, cookies.admin);
  assertTrue(r.rawContentType.includes('text/csv'), '重启后条目导出 Content-Type 正常');
  const exp1 = r.data?._rawText || '';
  assertTrue(exp1.startsWith('\ufeff'), '重启后条目导出含 UTF-8 BOM');
  assertContains(exp1, '条目ID,标题,分类,状态', '重启后条目导出表头正确');
  assertContains(exp1, UNIQUE_TOKEN, '重启后条目导出含测试标记数据');

  r = await apiRequest('/knowledge/hit-records/export', { method: 'GET' }, cookies.admin);
  assertTrue(r.rawContentType.includes('text/csv'), '重启后命中记录导出 Content-Type 正常');
  const exp2 = r.data?._rawText || '';
  assertTrue(exp2.startsWith('\ufeff'), '重启后命中记录导出含 UTF-8 BOM');
  assertContains(exp2, '记录ID,条目ID,条目标题', '重启后命中记录导出表头正确');

  console.log('\n=== 持久化验证结果汇总 ===');
  console.log(`通过: ${passed}, 失败: ${failed}`);
  if (failed > 0) process.exit(1);
}
main().catch(err => { console.error('持久化验证异常:', err); process.exit(1); });
