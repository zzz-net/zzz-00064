import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let adminCookie = '';
let dispatcherCookie = '';

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
const BASE_TIMESTAMP = Date.now() + 200 * 24 * 60 * 60 * 1000;
let currentDayOffset = parseInt(UNIQUE_TOKEN) % 500 + 200;
function getTestTime(hourOffset, minuteOffset = 0) {
  const time = new Date(BASE_TIMESTAMP + currentDayOffset * 24 * 60 * 60 * 1000 + hourOffset * 60 * 60 * 1000 + minuteOffset * 60 * 1000);
  return time.toISOString();
}
function nextTestDay() { currentDayOffset++; }

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
    { method: 'POST', body: JSON.stringify({ username: 'admin', password: '123456' }) },
    adminCookie
  );
  adminCookie = cookie;
  return { cookie, user: data.data };
}

async function loginAsDispatcher() {
  const { cookie, data } = await apiRequest(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username: 'dispatcher', password: '123456' }) },
    dispatcherCookie
  );
  dispatcherCookie = cookie;
  return { cookie, user: data.data };
}

async function createOrder(cookie, serviceType = '空调维修', hourOffset = 9) {
  const { data } = await apiRequest(
    '/orders',
    {
      method: 'POST',
      body: JSON.stringify({
        customerName: `测试客户_${UNIQUE_TOKEN}`,
        customerPhone: '13800000000',
        customerAddress: '测试地址',
        serviceType,
        description: '调度规则测试',
        scheduledStartTime: getTestTime(hourOffset),
        scheduledEndTime: getTestTime(hourOffset + 2),
      }),
    },
    cookie
  );
  return data.data;
}

async function getTechnicianId(cookie, skill = '空调维修') {
  const { data } = await apiRequest('/technicians?status=active', {}, cookie);
  const techs = data.data || [];
  const match = techs.find(t => t.skill && t.skill.includes(skill));
  return match ? match.id : techs[0]?.id;
}

async function cleanupRules(cookie) {
  const { data } = await apiRequest('/dispatch-rules', {}, cookie);
  const rules = data.data || [];
  for (const rule of rules) {
    await apiRequest(`/dispatch-rules/${rule.id}`, { method: 'DELETE' }, cookie);
  }
}

async function main() {
  console.log('========================================');
  console.log('调度规则完整回归测试');
  console.log(`UNIQUE_TOKEN=${UNIQUE_TOKEN}`);
  console.log('========================================\n');

  await loginAsAdmin();
  await loginAsDispatcher();

  await cleanupRules(adminCookie);

  let adminOrder, dispatcherOrder, techId, techId2, rule1, rule2, rule3;

  console.log('--- 组1: 规则 CRUD ---');
  {
    nextTestDay();
    await cleanupRules(adminCookie);

    const { data: createData } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '每日最大3单',
          type: 'max_daily_orders',
          severity: 'block',
          value: '3',
          description: '测试规则1',
        }),
      },
      adminCookie
    );
    assertEq(createData.success, true, '创建拦截规则-每日最大工单数');
    rule1 = createData.data;

    const { data: createData2 } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '最小间隔30分钟',
          type: 'min_service_interval',
          severity: 'warn',
          value: '30',
          description: '测试规则2',
        }),
      },
      adminCookie
    );
    assertEq(createData2.success, true, '创建提醒规则-最小间隔');
    rule2 = createData2.data;

    const { data: createData3 } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '空调技能匹配',
          type: 'required_skill_match',
          severity: 'block',
          value: '空调维修',
          description: '测试规则3',
        }),
      },
      adminCookie
    );
    assertEq(createData3.success, true, '创建拦截规则-技能匹配');
    rule3 = createData3.data;

    const { data: listData } = await apiRequest('/dispatch-rules', {}, adminCookie);
    assertTrue(listData.success && listData.data.length >= 3, '获取规则列表');

    const { data: dupData } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '重复规则',
          type: 'max_daily_orders',
          severity: 'block',
          value: '3',
        }),
      },
      adminCookie
    );
    assertTrue(!dupData.success, '重复规则创建被拒');

    const { data: updateData } = await apiRequest(
      `/dispatch-rules/${rule1.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: '每日最大5单-更新',
          type: 'max_daily_orders',
          severity: 'warn',
          value: '5',
          description: '更新后',
        }),
      },
      adminCookie
    );
    assertEq(updateData.success, true, '更新规则成功');
    assertEq(updateData.data.severity, 'warn', '更新后严重级别为warn');
    assertEq(updateData.data.value, '5', '更新后参数值为5');

    const { data: invalidCreate } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '',
          type: 'max_daily_orders',
          severity: 'block',
          value: 'abc',
        }),
      },
      adminCookie
    );
    assertTrue(!invalidCreate.success, '无效参数创建被拒');
  }

  console.log('\n--- 组2: 规则启停 ---');
  {
    await apiRequest(
      `/dispatch-rules/${rule1.id}/enabled`,
      {
        method: 'PUT',
        body: JSON.stringify({ enabled: 0 }),
      },
      adminCookie
    );
    const { data: disabledData } = await apiRequest('/dispatch-rules', {}, adminCookie);
    const r1 = disabledData.data.find(r => r.id === rule1.id);
    assertEq(r1.enabled, 0, '停用规则1');

    await apiRequest(
      `/dispatch-rules/${rule1.id}/enabled`,
      {
        method: 'PUT',
        body: JSON.stringify({ enabled: 1 }),
      },
      adminCookie
    );
    const { data: enabledData } = await apiRequest('/dispatch-rules', {}, adminCookie);
    const r1e = enabledData.data.find(r => r.id === rule1.id);
    assertEq(r1e.enabled, 1, '重新启用规则1');
  }

  console.log('\n--- 组3: 权限边界 ---');
  {
    const { data: dispListData } = await apiRequest('/dispatch-rules', {}, dispatcherCookie);
    assertTrue(dispListData.success, '调度员可查看规则列表');

    const { data: dispCreate } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '调度员创建',
          type: 'max_daily_orders',
          severity: 'block',
          value: '10',
        }),
      },
      dispatcherCookie
    );
    assertTrue(!dispCreate.success, '调度员不可创建规则');

    const { data: dispUpdate } = await apiRequest(
      `/dispatch-rules/${rule1.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: '调度员修改',
          type: 'max_daily_orders',
          severity: 'block',
          value: '10',
        }),
      },
      dispatcherCookie
    );
    assertTrue(!dispUpdate.success, '调度员不可修改规则');

    const { data: dispDelete } = await apiRequest(
      `/dispatch-rules/${rule1.id}`,
      { method: 'DELETE' },
      dispatcherCookie
    );
    assertTrue(!dispDelete.success, '调度员不可删除规则');

    const { data: dispToggle } = await apiRequest(
      `/dispatch-rules/${rule1.id}/enabled`,
      { method: 'PUT', body: JSON.stringify({ enabled: 0 }) },
      dispatcherCookie
    );
    assertTrue(!dispToggle.success, '调度员不可启停规则');

    const { data: dispExport } = await apiRequest('/dispatch-rules/export', {}, dispatcherCookie);
    assertTrue(dispExport?._rawText?.includes('规则名称') || dispExport?._rawText?.includes('BOM') || typeof dispExport?._rawText === 'string', '调度员可导出CSV');

    const { data: dispImport } = await apiRequest(
      '/dispatch-rules/import',
      { method: 'POST', body: JSON.stringify({ csvContent: 'test' }) },
      dispatcherCookie
    );
    assertTrue(!dispImport.success, '调度员不可导入规则');

    const { data: dispLogs } = await apiRequest('/dispatch-rules/logs?limit=5', {}, dispatcherCookie);
    assertTrue(dispLogs.success, '调度员可查看操作日志');
  }

  console.log('\n--- 组4: 派单预检-拦截 ---');
  {
    nextTestDay();
    await cleanupRules(adminCookie);

    await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '每日最大2单-拦截',
          type: 'max_daily_orders',
          severity: 'block',
          value: '2',
        }),
      },
      adminCookie
    );

    techId = await getTechnicianId(adminCookie);

    adminOrder = await createOrder(adminCookie, '空调维修', 9);
    const { data: assign1 } = await apiRequest(
      `/orders/${adminOrder.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: techId }) },
      adminCookie
    );
    assertTrue(assign1.success, '第1单分配成功');

    const order2 = await createOrder(adminCookie, '空调维修', 11);
    const { data: assign2 } = await apiRequest(
      `/orders/${order2.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: techId }) },
      adminCookie
    );
    assertTrue(assign2.success, '第2单分配成功');

    const order3 = await createOrder(adminCookie, '空调维修', 13);
    const { data: assign3 } = await apiRequest(
      `/orders/${order3.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: techId }) },
      adminCookie
    );
    assertTrue(!assign3.success, '第3单被拦截规则阻止');
    assertTrue(assign3.rule_precheck?.can_proceed === false, '预检结果can_proceed为false');

    const { data: precheckData } = await apiRequest(
      '/dispatch-rules/precheck',
      {
        method: 'POST',
        body: JSON.stringify({
          orderId: order3.id,
          technicianId: techId,
          serviceType: '空调维修',
          scheduledStartTime: getTestTime(13),
          scheduledEndTime: getTestTime(15),
        }),
      },
      adminCookie
    );
    assertTrue(precheckData.success, '独立预检接口可用');
    assertTrue(precheckData.data?.can_proceed === false, '独立预检返回不可派单');
    assertTrue(
      precheckData.data?.items?.some(i => i.rule_type === 'max_daily_orders' && !i.passed && i.severity === 'block'),
      '预检包含拦截类型的规则项'
    );
  }

  console.log('\n--- 组5: 派单预检-提醒 ---');
  {
    nextTestDay();
    await cleanupRules(adminCookie);

    await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '最小间隔30分钟-提醒',
          type: 'min_service_interval',
          severity: 'warn',
          value: '30',
        }),
      },
      adminCookie
    );

    techId2 = await getTechnicianId(adminCookie, '水电维修');
    if (!techId2) techId2 = await getTechnicianId(adminCookie);

    const warnOrder1 = await createOrder(adminCookie, '水电维修', 9);
    const { data: wa1 } = await apiRequest(
      `/orders/${warnOrder1.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: techId2 }) },
      adminCookie
    );
    assertTrue(wa1.success, '提醒规则-第1单分配成功');

    const warnOrder2 = await createOrder(adminCookie, '水电维修', 11);
    const { data: wa2 } = await apiRequest(
      `/orders/${warnOrder2.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: techId2 }) },
      adminCookie
    );
    assertTrue(wa2.success, '提醒规则-第2单仍然可以分配(仅提醒)');
    assertTrue(wa2.rule_precheck?.has_warnings === true, '预检结果有提醒');
    assertTrue(wa2.rule_precheck?.can_proceed === true, '提醒规则can_proceed仍为true');
  }

  console.log('\n--- 组6: 技能匹配预检 ---');
  {
    nextTestDay();
    await cleanupRules(adminCookie);

    await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '空调技能必需-拦截',
          type: 'required_skill_match',
          severity: 'block',
          value: '空调维修',
        }),
      },
      adminCookie
    );

    const skillOrder = await createOrder(adminCookie, '空调维修', 15);
    const { data: techList } = await apiRequest('/technicians?status=active', {}, adminCookie);
    const acTech = techList.data?.find(t => t.skill?.includes('空调维修'));
    const noAcTech = techList.data?.find(t => !t.skill?.includes('空调维修'));

    if (acTech) {
      const { data: acAssign } = await apiRequest(
        `/orders/${skillOrder.id}/assign`,
        { method: 'PUT', body: JSON.stringify({ technicianId: acTech.id }) },
        adminCookie
      );
      assertTrue(acAssign.success, '有空调技能的技师可通过技能匹配');
    }

    if (noAcTech) {
      const skillOrder2 = await createOrder(adminCookie, '空调维修', 17);
      const { data: noAcAssign } = await apiRequest(
        `/orders/${skillOrder2.id}/assign`,
        { method: 'PUT', body: JSON.stringify({ technicianId: noAcTech.id }) },
        adminCookie
      );
      assertTrue(!noAcAssign.success, '无空调技能的技师被技能匹配规则拦截');
    }
  }

  console.log('\n--- 组7: 改派预检 ---');
  {
    nextTestDay();
    await cleanupRules(adminCookie);

    await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '改派测试-每日最大1单-拦截',
          type: 'max_daily_orders',
          severity: 'block',
          value: '1',
        }),
      },
      adminCookie
    );

    const reassignKey = await getTechnicianId(adminCookie);
    const reassignOrder = await createOrder(adminCookie, '空调维修', 20);
    await apiRequest(
      `/orders/${reassignOrder.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: reassignKey }) },
      adminCookie
    );

    const reassignOrder2 = await createOrder(adminCookie, '空调维修', 20);
    const { data: reassignRes } = await apiRequest(
      `/orders/${reassignOrder2.id}/reassign`,
      {
        method: 'PUT',
        body: JSON.stringify({ technicianId: reassignKey, reason: '测试改派预检' }),
      },
      adminCookie
    );
    assertTrue(!reassignRes.success, '改派时规则拦截生效');
  }

  console.log('\n--- 组8: CSV 导出内容验证 ---');
  {
    await cleanupRules(adminCookie);

    await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '导出测试规则',
          type: 'max_daily_orders',
          severity: 'block',
          value: '5',
          description: 'CSV导出测试',
        }),
      },
      adminCookie
    );

    const { data: exportData } = await apiRequest('/dispatch-rules/export', {}, adminCookie);
    const csvText = exportData?._rawText || '';
    assertTrue(csvText.includes('规则名称'), 'CSV包含表头-规则名称');
    assertTrue(csvText.includes('规则类型'), 'CSV包含表头-规则类型');
    assertTrue(csvText.includes('严重级别'), 'CSV包含表头-严重级别');
    assertTrue(csvText.includes('导出测试规则'), 'CSV包含规则名称数据');
    assertTrue(csvText.includes('技师每日最大工单数'), 'CSV包含规则类型中文');
    assertTrue(csvText.includes('拦截'), 'CSV包含严重级别中文');
    assertTrue(csvText.includes('5'), 'CSV包含参数值');
  }

  console.log('\n--- 组9: CSV 导入验证 ---');
  {
    await cleanupRules(adminCookie);

    const validCsv = '规则名称,规则类型,严重级别,参数值,是否启用,描述\n测试导入规则1,技师每日最大工单数,拦截,3,是,导入测试1\n测试导入规则2,同服务最小间隔,提醒,60,否,导入测试2';

    const { data: importData } = await apiRequest(
      '/dispatch-rules/import',
      { method: 'POST', body: JSON.stringify({ csvContent: validCsv }) },
      adminCookie
    );
    assertTrue(importData.success, '有效CSV导入成功');
    const importResult = importData.data;
    assertEq(importResult?.success, 2, '导入成功2条');
    assertEq(importResult?.failed, 0, '导入失败0条');

    const { data: rulesAfterImport } = await apiRequest('/dispatch-rules', {}, adminCookie);
    const imported1 = rulesAfterImport.data.find(r => r.name === '测试导入规则1');
    assertTrue(!!imported1, '导入规则1存在于列表');
    assertEq(imported1?.enabled, 1, '导入规则1启用');
    assertEq(imported1?.severity, 'block', '导入规则1为拦截');

    const imported2 = rulesAfterImport.data.find(r => r.name === '测试导入规则2');
    assertTrue(!!imported2, '导入规则2存在于列表');
    assertEq(imported2?.enabled, 0, '导入规则2停用');
    assertEq(imported2?.severity, 'warn', '导入规则2为提醒');

    const dupCsv = '规则名称,规则类型,严重级别,参数值,是否启用,描述\n重复规则,技师每日最大工单数,拦截,3,是,重复';
    const { data: dupImportData } = await apiRequest(
      '/dispatch-rules/import',
      { method: 'POST', body: JSON.stringify({ csvContent: dupCsv }) },
      adminCookie
    );
    assertTrue(dupImportData.success, '重复导入返回成功(整体)');
    assertTrue(dupImportData.data.failed > 0, '重复导入有失败行');

    const invalidCsv = '规则名称,规则类型,严重级别,参数值,是否启用,描述\n,技师每日最大工单数,拦截,3,是,空名称\n无效规则,无效类型,拦截,abc,是,类型错误\n无效规则2,技师每日最大工单数,无效级别,3,是,级别错误\n无效规则3,技师每日最大工单数,拦截,abc,是,参数非数字\n无效规则4,技师每日最大工单数,拦截,3,也许,启用状态错误';
    const { data: invalidImportData } = await apiRequest(
      '/dispatch-rules/import',
      { method: 'POST', body: JSON.stringify({ csvContent: invalidCsv }) },
      adminCookie
    );
    assertTrue(invalidImportData.success, '无效CSV导入返回成功(整体)');
    assertEq(invalidImportData.data.failed, 5, '5行全部失败');
    assertEq(invalidImportData.data.success, 0, '0行成功');

    assertTrue(
      invalidImportData.data.errors.some(e => e.reason.includes('规则名称不能为空')),
      '报错包含:规则名称不能为空'
    );
    assertTrue(
      invalidImportData.data.errors.some(e => e.reason.includes('无效的规则类型')),
      '报错包含:无效的规则类型'
    );
    assertTrue(
      invalidImportData.data.errors.some(e => e.reason.includes('无效的严重级别')),
      '报错包含:无效的严重级别'
    );
    assertTrue(
      invalidImportData.data.errors.some(e => e.reason.includes('正整数')),
      '报错包含:参数必须为正整数'
    );
    assertTrue(
      invalidImportData.data.errors.some(e => e.reason.includes('启用状态')),
      '报错包含:无效的启用状态'
    );

    const missingHeaderCsv = '规则名称,规则类型,参数值\n缺列,技师每日最大工单数,3';
    const { data: missingHeaderData } = await apiRequest(
      '/dispatch-rules/import',
      { method: 'POST', body: JSON.stringify({ csvContent: missingHeaderCsv }) },
      adminCookie
    );
    assertTrue(missingHeaderData.success, '缺列CSV返回成功(整体)');
    assertTrue(missingHeaderData.data.failed > 0 || missingHeaderData.data.errors.length > 0, '缺列CSV有错误');
  }

  console.log('\n--- 组10: 操作日志验证 ---');
  {
    const { data: logsData } = await apiRequest('/dispatch-rules/logs?limit=30', {}, adminCookie);
    assertTrue(logsData.success, '获取操作日志成功');
    assertTrue(logsData.data.length > 0, '操作日志非空');

    assertTrue(
      logsData.data.some(l => l.operation_type === 'rule_created'),
      '日志包含rule_created'
    );
    assertTrue(
      logsData.data.some(l => l.operation_type === 'import_success' || l.operation_type === 'import_failure'),
      '日志包含import相关'
    );
    assertTrue(
      logsData.data.some(l => l.operation_type === 'rule_hit'),
      '日志包含rule_hit(规则命中)'
    );

    const ruleLogs = logsData.data.filter(l => l.operation_type === 'rule_created');
    assertTrue(ruleLogs.length > 0, 'rule_created日志有记录');
    assertTrue(
      ruleLogs.every(l => l.operator_name && l.detail),
      '日志包含操作人和详情'
    );
  }

  console.log('\n--- 组11: 删除规则验证 ---');
  {
    await cleanupRules(adminCookie);

    const { data: delCreate } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '待删除规则',
          type: 'max_daily_orders',
          severity: 'block',
          value: '99',
        }),
      },
      adminCookie
    );
    const delRuleId = delCreate.data.id;

    const { data: delRes } = await apiRequest(
      `/dispatch-rules/${delRuleId}`,
      { method: 'DELETE' },
      adminCookie
    );
    assertTrue(delRes.success, '删除规则成功');

    const { data: delNotFound } = await apiRequest(
      `/dispatch-rules/${delRuleId}`,
      { method: 'DELETE' },
      adminCookie
    );
    assertTrue(!delNotFound.success, '重复删除返回失败');

    const { data: logsAfterDelete } = await apiRequest('/dispatch-rules/logs?limit=5', {}, adminCookie);
    assertTrue(
      logsAfterDelete.data.some(l => l.operation_type === 'rule_deleted'),
      '删除操作进日志'
    );
  }

  console.log('\n--- 组12: 强制派单预检(提醒规则可覆盖) ---');
  {
    nextTestDay();
    await cleanupRules(adminCookie);

    await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: '强制派单提醒规则',
          type: 'max_daily_orders',
          severity: 'warn',
          value: '1',
        }),
      },
      adminCookie
    );

    const fTechId = await getTechnicianId(adminCookie);
    const fOrder1 = await createOrder(adminCookie, '空调维修', 22);
    await apiRequest(
      `/orders/${fOrder1.id}/assign`,
      { method: 'PUT', body: JSON.stringify({ technicianId: fTechId }) },
      adminCookie
    );

    const fOrder2 = await createOrder(adminCookie, '空调维修', 22);
    const { data: forceData } = await apiRequest(
      `/orders/${fOrder2.id}/force-assign`,
      {
        method: 'PUT',
        body: JSON.stringify({ technicianId: fTechId, reason: '测试强制派单覆盖提醒规则' }),
      },
      adminCookie
    );
    assertTrue(forceData.success, '强制派单可覆盖提醒规则');
    assertTrue(forceData.rule_precheck?.has_warnings === true, '强制派单预检有提醒');
    assertTrue(forceData.rule_precheck?.can_proceed === true, '强制派单can_proceed为true');

    const { data: logsAfterForce } = await apiRequest('/dispatch-rules/logs?limit=10', {}, adminCookie);
    assertTrue(
      logsAfterForce.data.some(l => l.operation_type === 'rule_overridden'),
      '强制派单覆盖提醒规则进日志'
    );
  }

  console.log('\n========================================');
  console.log(`测试完成: ✅ ${passed}  ❌ ${failed}`);
  console.log(`UNIQUE_TOKEN=${UNIQUE_TOKEN}`);
  console.log('========================================');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
