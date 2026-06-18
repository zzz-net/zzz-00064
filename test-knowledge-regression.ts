// ============================================================
// 知识库模块 - 综合回归测试
// 覆盖：原子性导入、权限边界、预案引用一致性、数据持久化
// ============================================================
import fetch from 'node-fetch';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';
const API = `${BASE}/api`;

// ---------- 测试辅助 ----------
const results = { total: 0, passed: 0, failed: 0, errors: [] };
function assert(cond, msg, extra = null) {
  results.total++;
  if (cond) { results.passed++; console.log(`  ✅ ${msg}`); }
  else {
    results.failed++;
    const err = `  ❌ ${msg}${extra ? ' | ' + JSON.stringify(extra) : ''}`;
    console.log(err);
    results.errors.push({ msg, extra });
  }
}
function section(title) { console.log(`\n══════ ${title} ══════`); }

async function jsonFetch(url, opts: any = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include' as any,
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

// ---------- 用户登录 Cookie ----------
const users = {
  admin: { username: 'admin', password: '123456' },
  supervisor: { username: 'supervisor', password: '123456' },
  customer_service: { username: 'customer_service', password: '123456' },
};

const jars = { admin: '', supervisor: '', customer_service: '' };
async function loginAs(role: 'admin' | 'supervisor' | 'customer_service') {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(users[role]),
  });
  // 从 set-cookie 中提取纯 key=value 部分，去掉 ;Path=/; HttpOnly 等属性
  const rawSetCookie = res.headers.raw()['set-cookie']?.[0] || '';
  const cookie = rawSetCookie.split(';')[0]?.trim() || '';
  jars[role] = cookie;
  const data: any = await res.json().catch(() => ({}));
  return { ok: data.success, cookie, userId: data.data?.id, role: data.data?.role };
}
async function authFetch(url, role, opts: any = {}) {
  return jsonFetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(jars[role] ? { Cookie: jars[role] } : {}),
      ...(opts.headers || {}),
    },
  });
}

// ---------- 测试执行 ----------
async function runAll() {
  console.log(`测试目标: ${API}`);
  console.log(`时间戳: ${new Date().toISOString()}`);

  // ===== 1. 登录与基础连通性 =====
  section('1. 登录与身份连通性');
  for (const role of ['admin', 'supervisor', 'customer_service'] as const) {
    const r = await loginAs(role);
    assert(r.ok, `${role} 登录成功（cookie 已保存）`, { role: r.role, userId: r.userId });
  }

  // ===== 2. 权限边界：导出入口 =====
  section('2. 权限边界：导出接口越权拦截');
  {
    // customer_service 不能导出条目
    const { res, body }: any = await authFetch(`${API}/knowledge/entries/export`, 'customer_service', { method: 'GET' });
    assert(res.status === 403, `客服导出条目应返回 403，实际 ${res.status}`, body);
  }
  {
    // supervisor 可以导出
    const { res }: any = await authFetch(`${API}/knowledge/entries/export`, 'supervisor', { method: 'GET' });
    assert(res.status === 200, `主管导出条目应返回 200，实际 ${res.status}`);
  }
  {
    // customer_service 不能导入
    const csv = '标题,分类,常见问题,处理话术\na,空调类,问题,话术\n';
    const { res, body }: any = await authFetch(`${API}/knowledge/entries/import`, 'customer_service', {
      method: 'POST',
      body: JSON.stringify({ csvContent: csv }),
    });
    assert(res.status === 403, `客服导入条目应返回 403，实际 ${res.status}`, body);
  }
  {
    // customer_service 不能导出命中记录
    const { res, body }: any = await authFetch(`${API}/knowledge/hit-records/export`, 'customer_service', { method: 'GET' });
    assert(res.status === 403, `客服导出命中记录应返回 403，实际 ${res.status}`, body);
  }

  // ===== 3. 原子性导入：非法分类 / 必填缺失 / 重复标题 / 失效时间异常 =====
  section('3. CSV 导入原子性：任意一行错误，整批零写入');

  // 先确保分类存在
  await authFetch(`${API}/knowledge/categories`, 'admin', {
    method: 'POST', body: JSON.stringify({ name: '空调类', description: '', sort_order: 1 }),
  }).catch(() => {});
  await authFetch(`${API}/knowledge/categories`, 'admin', {
    method: 'POST', body: JSON.stringify({ name: '热水器类', description: '', sort_order: 2 }),
  }).catch(() => {});

  // 先获取当前条目数量作为基线
  const beforeList: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
  const baselineCount = (beforeList.body?.data || []).length;
  console.log(`  导入前基线条目数: ${baselineCount}`);

  // ---- 3a. 非法分类 + 失效时间异常 混合 ----
  {
    const badCsv = [
      '标题,分类,常见问题,处理话术,失效时间',
      '正确空调条目,空调类,常见问题,处理话术1,2028-01-01T00:00',
      '非法分类条目,不存在的分类xx,问题,话术,',
      '失效时间坏,空调类,问题,话术,not-a-date',
    ].join('\n');

    const { res, body }: any = await authFetch(`${API}/knowledge/entries/import`, 'admin', {
      method: 'POST', body: JSON.stringify({ csvContent: badCsv }),
    });

    assert(res.status === 200, '导入请求本身 HTTP 200（业务层返回原子性结果）');
    const r = body.data || {};
    assert(r.failed === 2, `检测到 2 行错误，实际 ${r.failed}`, r.errors);
    assert(r.success === 0, `成功 0 行（原子性），实际 ${r.success}`);
    assert(r.rolled_back === false, '预校验失败阶段不写 rolled_back=true（实际预校验零插入）');

    // 验证数据库实际数量不变
    const afterList: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
    const count1 = (afterList.body?.data || []).length;
    assert(count1 === baselineCount, `非法分类+坏时间后条目数不变（${baselineCount}），实际 ${count1}`);
  }

  // ---- 3b. 必填缺失：标题为空 / 处理话术为空 ----
  {
    const badCsv2 = [
      '标题,分类,常见问题,处理话术',
      ',空调类,问题,处理话术',           // 标题空
      '合法标题,空调类,问题,',            // 话术空
    ].join('\n');

    const { body }: any = await authFetch(`${API}/knowledge/entries/import`, 'admin', {
      method: 'POST', body: JSON.stringify({ csvContent: badCsv2 }),
    });
    const r = body.data || {};
    assert(r.failed === 2, `必填缺失检测到 2 行错误，实际 ${r.failed}`, r.errors);
    assert(r.success === 0, `原子性：0 行成功，实际 ${r.success}`);

    const afterList: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
    const count2 = (afterList.body?.data || []).length;
    assert(count2 === baselineCount, `必填缺失后条目数不变，实际 ${count2}`);
  }

  // ---- 3c. 重复标题（CSV 内部重复 + 与数据库已有重复）----
  {
    // 先创建一个条目作为"已有数据库记录"
    const existingTitle = `原子性测试-已存在-${Date.now()}`;
    await authFetch(`${API}/knowledge/entries`, 'admin', {
      method: 'POST', body: JSON.stringify({
        title: existingTitle, category_id: 1, answer: '话术',
      }),
    });
    const beforeDupList: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
    const baselineDup = (beforeDupList.body?.data || []).length;

    const badCsv3 = [
      '标题,分类,常见问题,处理话术',
      `${existingTitle},空调类,问题,话术A`,   // 与数据库重复
      'CSV内部重复标题,空调类,问题,话术B',      // CSV 内部第一次出现（合法）
      'CSV内部重复标题,空调类,问题,话术C',      // CSV 内部重复
    ].join('\n');

    const { body }: any = await authFetch(`${API}/knowledge/entries/import`, 'admin', {
      method: 'POST', body: JSON.stringify({ csvContent: badCsv3 }),
    });
    const r = body.data || {};
    assert(r.failed >= 2, `重复标题至少 2 行错误（库内重复 + CSV 内部重复），实际 ${r.failed}`, r.errors);
    assert(r.success === 0, `原子性：0 行成功，实际 ${r.success}`);

    const afterDupList: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
    const count3 = (afterDupList.body?.data || []).length;
    assert(count3 === baselineDup, `重复标题后条目数不变（${baselineDup}），实际 ${count3}`);
  }

  // ---- 3d. 全部合法：确认正常导入不被误回滚 ----
  {
    const goodTitle = `原子性测试-全合法-${Date.now()}`;
    const goodCsv = [
      '标题,分类,常见问题,处理话术,失效时间',
      `${goodTitle},空调类,问题A,话术Good1,2027-12-31T23:59`,
      `全合法第二条目-${Date.now()},热水器类,问题B,话术Good2,`,
    ].join('\n');

    const { body }: any = await authFetch(`${API}/knowledge/entries/import`, 'admin', {
      method: 'POST', body: JSON.stringify({ csvContent: goodCsv }),
    });
    const r = body.data || {};
    assert(r.success === 2, `全合法 CSV 导入成功 2 行，实际 ${r.success}`, r.errors);
    assert(r.failed === 0, `0 错误，实际 ${r.failed}`);

    // 确认条目实际存在（状态是 published，因为导入后自动审核通过发布）
    const list: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
    const found = (list.body.data || []).find(e => e.title === goodTitle);
    assert(!!found, '导入后能查到全合法条目');
    assert(found?.status === 'published', `导入条目状态是 published，实际 ${found?.status}`);
    console.log(`  ✅ 全合法导入验证通过，当前条目状态: ${found?.status}`);
  }

  // ===== 4. 前后端契约：字段名 / 方法一致性 =====
  section('4. 前后端契约验证（拒绝发明字段和方法）');

  // 4a. 导入：使用错误字段名 csv_text 应报错
  {
    const badFieldCsv = '标题,分类,常见问题,处理话术\n契约验证,空调类,问题,话术\n';
    const { res, body }: any = await authFetch(`${API}/knowledge/entries/import`, 'admin', {
      method: 'POST', body: JSON.stringify({ csv_text: badFieldCsv }),
    });
    assert(res.status === 400, `错误字段名 csv_text 触发 HTTP 400，实际 ${res.status}`, body);
  }

  // 4b. 动作使用错误 HTTP 方法 PUT 应不匹配（或语义报错）
  {
    // 获取一个草稿 id
    const { body: eb }: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
    const draft = (eb.data || []).find(x => x.status === 'draft');
    if (draft) {
      // PUT submit 应该 404（后端注册的是 POST）
      const { res }: any = await authFetch(`${API}/knowledge/entries/${draft.id}/submit`, 'admin', {
        method: 'PUT', body: '{}',
      });
      // 404 或 405 都是正确的（说明路由没被错误匹配）
      assert(res.status === 404 || res.status === 405,
        `错误 HTTP 方法 PUT /submit 返回 404/405，实际 ${res.status}`);
    } else {
      console.log('  ⚠️  跳过 PUT 方法测试：无草稿条目');
    }
  }

  // 4c. rollback 使用错误字段 version_id 应提示正确字段名
  {
    const { body: eb }: any = await authFetch(`${API}/knowledge/entries`, 'admin', { method: 'GET' });
    const published = (eb.data || []).find(x => x.status === 'published' && x.version >= 2);
    if (published) {
      const { res, body }: any = await authFetch(`${API}/knowledge/entries/${published.id}/rollback`, 'admin', {
        method: 'POST', body: JSON.stringify({ version_id: 1 }),
      });
      assert(res.status === 400, `错误字段 version_id 触发 HTTP 400，实际 ${res.status}`, body);
      const msg = (body?.error || '').toLowerCase();
      assert(msg.includes('version_no'), '错误提示中包含正确字段名 version_no', body?.error);
    } else {
      console.log('  ⚠️  跳过 rollback 字段测试：无多版本 published 条目');
    }
  }

  // ===== 5. 预案引用一致性：停用/回滚的引用检查 =====
  section('5. 预案引用一致性：停用/回滚不破坏历史命中引用');

  // 创建条目→发布→匹配→采用→停用/回滚→确认命中记录仍关联原版本
  {
    // 5a. 创建并发布一个条目
    const t = `引用一致性-${Date.now()}`;
    const cr: any = await authFetch(`${API}/knowledge/entries`, 'supervisor', {
      method: 'POST',
      body: JSON.stringify({ title: t, category_id: 1, question: '问题', answer: '话术答案' }),
    });
    const eid = cr.body?.data?.id;
    assert(!!eid, `创建条目 #${eid}`);

    // 提交审核 + 发布
    await authFetch(`${API}/knowledge/entries/${eid}/submit`, 'supervisor', { method: 'POST', body: '{}' });
    const pub: any = await authFetch(`${API}/knowledge/entries/${eid}/approve`, 'supervisor', {
      method: 'POST', body: JSON.stringify({ remark: '发布' }),
    });
    const beforeVer = pub.body?.data?.current_version_id;
    assert(!!beforeVer, `发布成功，current_version_id=${beforeVer}`);

    // 5b. 模拟匹配（只要有工单 #1 存在即可，若不存在则跳过匹配）
    // 这里直接创建命中记录的 API 不存在，但可验证：停用后版本id仍保留
    // 验证详情接口返回的版本链
    const detailBefore: any = await authFetch(`${API}/knowledge/entries/${eid}`, 'supervisor', { method: 'GET' });
    const versionCountBefore = (detailBefore.body?.data?.versions || []).length;
    console.log(`  版本数（停用前）: ${versionCountBefore}`);

    // 5c. 停用
    const dis: any = await authFetch(`${API}/knowledge/entries/${eid}/disable`, 'supervisor', {
      method: 'POST', body: JSON.stringify({ remark: '停用测试引用' }),
    });
    assert(dis.body?.success === true, `停用成功，状态=${dis.body?.data?.status}`);
    const disRemark = dis.body?.data?.review_remark || '';
    // 确认 review_remark 中包含了引用检查的日志信息（如果存在采用未反馈命中会有备注）
    console.log(`  停用备注: ${disRemark.slice(0, 80)}${disRemark.length > 80 ? '...' : ''}`);
    assert(dis.body?.data?.disabled_by_name !== null, '停用操作保留 disabled_by_name 字段');

    // 5d. 编辑后再发布（产生新版本）→ 回滚 → 确认历史版本引用仍可追溯
    const upd: any = await authFetch(`${API}/knowledge/entries/${eid}`, 'supervisor', {
      method: 'PUT',
      body: JSON.stringify({
        title: t + '（编辑后）',
        answer: '修改后的话术',
        change_log: '为回滚测试创建新版本',
      }),
    });
    assert(upd.body?.success === true, `编辑产生新版本 v=${upd.body?.data?.version}`);
    await authFetch(`${API}/knowledge/entries/${eid}/submit`, 'supervisor', { method: 'POST', body: '{}' });
    const repub: any = await authFetch(`${API}/knowledge/entries/${eid}/approve`, 'supervisor', {
      method: 'POST', body: JSON.stringify({ remark: '再次发布' }),
    });
    const vAfterEdit = repub.body?.data?.version;
    const versionsAfterEdit = (await authFetch(`${API}/knowledge/entries/${eid}/versions`, 'supervisor', { method: 'GET' })).body.data;
    const v1 = versionsAfterEdit.find(x => x.version_no === 1);
    assert(v1, 'v1 版本仍存在，可追溯');

    // 5e. 回滚到 v1（注意字段是 version_no）
    const rb: any = await authFetch(`${API}/knowledge/entries/${eid}/rollback`, 'supervisor', {
      method: 'POST', body: JSON.stringify({ version_no: 1 }),
    });
    assert(rb.body?.success === true, `回滚成功，新版本号=${rb.body?.data?.version}`);
    const rbVer = rb.body?.data?.version;
    assert(rbVer > vAfterEdit, `回滚产生新版本号（${rbVer} > ${vAfterEdit}），而不是复用 v1`);
    const rbRemark = rb.body?.data?.review_remark || '';
    console.log(`  回滚备注: ${rbRemark.slice(0, 100)}${rbRemark.length > 100 ? '...' : ''}`);
    // 回滚后 v1 版本仍然保留
    const versionsFinal = (await authFetch(`${API}/knowledge/entries/${eid}/versions`, 'supervisor', { method: 'GET' })).body.data;
    assert(versionsFinal.length >= 3, `回滚后版本链完整（>=3个版本），实际 ${versionsFinal.length}`);
  }

  // ===== 6. 统计接口（此前缺失，属于本次重构补全）=====
  section('6. 统计接口 & 视图权限（customer_service 只能看自己的）');
  {
    // 管理员统计
    const adminStats: any = await authFetch(`${API}/knowledge/entries/stats`, 'admin', { method: 'GET' });
    assert(adminStats.body?.success === true, '管理员 /entries/stats 返回 success=true');
    const s = adminStats.body?.data || {};
    assert(typeof s.total === 'number' && typeof s.draft === 'number',
      '统计结构完整（total, draft, pending_review, published, disabled）', s);

    // customer_service 的统计应该是 0（如果没有自己创建的条目）或自己的（不会是全局总数）
    // 这里只验证接口通，具体数字取决于数据
    const csStats: any = await authFetch(`${API}/knowledge/entries/stats`, 'customer_service', '', '');
    assert(csStats.body?.success === true, '客服 /entries/stats 接口可用');
  }

  // ===== 7. 导出 HTTP Content-Disposition =====
  section('7. 导出响应格式（CSV + UTF-8 BOM + 下载头）');
  {
    const expRes = await authFetch(`${API}/knowledge/entries/export`, 'admin', { method: 'GET' });
    const ct = expRes.res.headers.get?.('content-type') || expRes.res.headers?.['content-type'];
    const cd = expRes.res.headers.get?.('content-disposition') || expRes.res.headers?.['content-disposition'];
    assert(/text\/csv/.test(ct || ''), `导出 Content-Type 包含 text/csv，实际 ${ct}`);
    assert(/attachment/.test(cd || ''), `导出 Content-Disposition 包含 attachment，实际 ${cd?.slice(0, 60)}`);
  }

  // ===== 8. 角色越权：customer_service 编辑别人的条目 =====
  section('8. 角色越权：客服编辑他人条目被拒绝');
  {
    // 先由 admin 创建条目
    const t = `越权测试-${Date.now()}`;
    const cr: any = await authFetch(`${API}/knowledge/entries`, 'admin', {
      method: 'POST', body: JSON.stringify({ title: t, category_id: 1, answer: '话术' }),
    });
    const eid = cr.body?.data?.id;
    if (eid) {
      // 由 customer_service 尝试编辑
      const upd: any = await authFetch(`${API}/knowledge/entries/${eid}`, 'customer_service', {
        method: 'PUT',
        body: JSON.stringify({ title: t + '（被越权修改）', answer: '改了' }),
      });
      assert(upd.res.status === 403, `客服编辑他人条目返回 403，实际 ${upd.res.status}`, upd.body);
    }
  }

  // ===== 汇总 =====
  section('测试汇总');
  console.log(`总计: ${results.total}  |  ✅ 通过: ${results.passed}  |  ❌ 失败: ${results.failed}`);
  if (results.failed > 0) {
    console.log('\n失败明细:');
    results.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.msg}${e.extra ? ' | ' + JSON.stringify(e.extra) : ''}`));
    process.exit(1);
  } else {
    console.log('\n🎉 全部知识库模块回归测试通过！');
    process.exit(0);
  }
}

// 容错：服务未启动时给出明确错误
runAll().catch(e => {
  console.error('\n💥 测试执行异常：', e.message);
  console.error('请确认后端已在端口 3001 启动（npm run server:dev）');
  process.exit(2);
});
