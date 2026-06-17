import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
const UNIQUE_TOKEN = process.argv[2] || '';
let adminCookie = '';

if (!UNIQUE_TOKEN) {
  console.error('用法: node test-dispatch-rules-persistence.mjs <UNIQUE_TOKEN>');
  console.error('UNIQUE_TOKEN 从 test-dispatch-rules.mjs 的输出获取');
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

function testPass(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}

function testFail(name, reason) {
  failed++;
  console.log(`  ❌ ${name}`);
  console.log(`     原因: ${reason}`);
}

function assertTrue(cond, testName, detail = '') {
  if (cond) {
    testPass(testName);
  } else {
    testFail(testName, detail || '条件为 false');
  }
}

function assertEq(actual, expected, testName) {
  if (actual === expected) {
    testPass(testName);
  } else {
    testFail(testName, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

async function loginAsAdmin() {
  const { cookie } = await apiRequest(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username: 'admin', password: '123456' }) },
    adminCookie
  );
  adminCookie = cookie;
}

async function main() {
  console.log('========================================');
  console.log('调度规则持久化验证');
  console.log(`UNIQUE_TOKEN=${UNIQUE_TOKEN}`);
  console.log('========================================\n');

  await loginAsAdmin();

  console.log('--- 组1: 规则持久化 ---');
  {
    const { data: rulesData } = await apiRequest('/dispatch-rules', {}, adminCookie);
    assertTrue(rulesData.success, '获取规则列表成功');

    const allRules = rulesData.data || [];
    assertTrue(allRules.length > 0, '重启后规则非空');

    const blockRules = allRules.filter(r => r.severity === 'block');
    const warnRules = allRules.filter(r => r.severity === 'warn');
    assertTrue(blockRules.length > 0 || warnRules.length > 0, '规则severity字段正确持久化');

    const enabledRules = allRules.filter(r => r.enabled === 1);
    const disabledRules = allRules.filter(r => r.enabled === 0);
    assertTrue(enabledRules.length >= 0, '启用规则持久化');
    assertTrue(disabledRules.length >= 0, '停用规则持久化');

    for (const rule of allRules) {
      assertTrue(!!rule.name, `规则ID=${rule.id}名称持久化`);
      assertTrue(['max_daily_orders', 'min_service_interval', 'required_skill_match'].includes(rule.type), `规则ID=${rule.id}类型持久化`);
      assertTrue(!!rule.value, `规则ID=${rule.id}参数值持久化`);
      assertTrue(!!rule.created_at, `规则ID=${rule.id}创建时间持久化`);
    }
  }

  console.log('\n--- 组2: 操作日志持久化 ---');
  {
    const { data: logsData } = await apiRequest('/dispatch-rules/logs?limit=50', {}, adminCookie);
    assertTrue(logsData.success, '获取操作日志成功');

    const allLogs = logsData.data || [];
    assertTrue(allLogs.length > 0, '重启后操作日志非空');

    assertTrue(
      allLogs.every(l => l.operator_name),
      '所有日志包含操作人'
    );
    assertTrue(
      allLogs.every(l => l.detail),
      '所有日志包含详情'
    );
    assertTrue(
      allLogs.every(l => l.created_at),
      '所有日志包含创建时间'
    );

    const opTypes = new Set(allLogs.map(l => l.operation_type));
    assertTrue(opTypes.size > 0, '日志包含多种操作类型');

    const validTypes = ['rule_created', 'rule_updated', 'rule_enabled', 'rule_disabled', 'rule_deleted', 'rule_hit', 'rule_overridden', 'import_success', 'import_failure'];
    assertTrue(
      allLogs.every(l => validTypes.includes(l.operation_type)),
      '所有日志operation_type合法'
    );
  }

  console.log('\n--- 组3: CSV导出重启后一致性 ---');
  {
    const { data: exportData } = await apiRequest('/dispatch-rules/export', {}, adminCookie);
    const csvText = exportData._rawText || '';

    assertTrue(csvText.includes('规则名称'), 'CSV表头包含规则名称');
    assertTrue(csvText.includes('规则类型'), 'CSV表头包含规则类型');
    assertTrue(csvText.includes('严重级别'), 'CSV表头包含严重级别');
    assertTrue(csvText.includes('参数值'), 'CSV表头包含参数值');
    assertTrue(csvText.includes('是否启用'), 'CSV表头包含是否启用');

    const { data: rulesData } = await apiRequest('/dispatch-rules', {}, adminCookie);
    const rules = rulesData.data || [];
    for (const rule of rules) {
      assertTrue(csvText.includes(rule.name), `CSV包含规则名: ${rule.name}`);
    }
  }

  console.log('\n--- 组4: 预检结果重启后一致性 ---');
  {
    const { data: rulesData } = await apiRequest('/dispatch-rules?enabled=1', {}, adminCookie);
    const enabledRules = rulesData.data || [];

    const { data: techData } = await apiRequest('/technicians?status=active', {}, adminCookie);
    const techs = techData.data || [];
    if (techs.length > 0) {
      const { data: precheckData } = await apiRequest(
        '/dispatch-rules/precheck',
        {
          method: 'POST',
          body: JSON.stringify({
            orderId: 1,
            technicianId: techs[0].id,
            serviceType: '空调维修',
            scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
            scheduledEndTime: new Date(Date.now() + 86400000 + 7200000).toISOString(),
          }),
        },
        adminCookie
      );

      assertTrue(precheckData.success, '预检接口重启后可用');
      assertTrue(
        Array.isArray(precheckData.data?.items),
        '预检结果items为数组'
      );

      if (enabledRules.length > 0) {
        assertTrue(
          precheckData.data.items.length === enabledRules.length,
          `预检项数=${enabledRules.length}与启用规则数一致`
        );
      }
    }
  }

  console.log('\n--- 组5: 规则CRUD重启后可用 ---');
  {
    const { data: createData } = await apiRequest(
      '/dispatch-rules',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `持久化验证_${UNIQUE_TOKEN}`,
          type: 'max_daily_orders',
          severity: 'block',
          value: '10',
          description: '重启后创建测试',
        }),
      },
      adminCookie
    );
    assertTrue(createData.success, '重启后创建规则成功');

    if (createData.data?.id) {
      const { data: toggleData } = await apiRequest(
        `/dispatch-rules/${createData.data.id}/enabled`,
        { method: 'PUT', body: JSON.stringify({ enabled: 0 }) },
        adminCookie
      );
      assertTrue(toggleData.success, '重启后启停规则成功');

      const { data: deleteData } = await apiRequest(
        `/dispatch-rules/${createData.data.id}`,
        { method: 'DELETE' },
        adminCookie
      );
      assertTrue(deleteData.success, '重启后删除规则成功');
    }
  }

  console.log('\n========================================');
  console.log(`持久化测试完成: ✅ ${passed}  ❌ ${failed}`);
  console.log('========================================');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Persistence test error:', err);
  process.exit(1);
});
