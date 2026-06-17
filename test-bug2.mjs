import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';
let cookie = '';

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookie = setCookie.split(';')[0];
  }

  const data = await response.json();
  return { response, data };
}

async function testBug2() {
  console.log('=== Bug 2 复现：强制派单审批通过后工单状态不更新 ===\n');

  try {
    console.log('1. 登录 dispatcher（调度员）');
    const { data: loginDispatcher } = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'dispatcher', password: '123456' }),
    });
    console.log('   登录:', loginDispatcher.success ? '成功' : '失败', '- 角色:', loginDispatcher.data?.role);

    console.log('\n2. 创建一张工单');
    const { data: order } = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: '测试强制派单审批',
        serviceType: '空调维修',
        description: '测试 Bug2',
        scheduledStartTime: '2026-06-21T10:00:00.000Z',
        scheduledEndTime: '2026-06-21T12:00:00.000Z',
      }),
    });
    console.log('   工单:', order.success ? order.data.order_no : order.error);
    console.log('   状态:', order.data?.status);
    console.log('   技师:', order.data?.technician_name || '未分配');
    const orderId = order.data?.id;

    if (!orderId) {
      console.log('\n❌ 工单创建失败');
      return;
    }

    console.log('\n3. 调度员提交强制派单申请（给技师1）');
    const { data: request } = await apiRequest(`/orders/${orderId}/force-assign-request`, {
      method: 'POST',
      body: JSON.stringify({ technicianId: 1, reason: '紧急工单，需要强制派单' }),
    });
    console.log('   申请结果:', request.success ? '成功' : '失败');
    console.log('   消息:', request.message || '无');
    console.log('   当前状态:', request.data?.status);
    console.log('   当前技师:', request.data?.technician_name || '未分配');

    console.log('\n4. 查询审批列表');
    const { data: approvals } = await apiRequest('/approvals');
    console.log('   审批数量:', approvals.data?.length || 0);
    if (approvals.data?.length > 0) {
      const approval = approvals.data[0];
      console.log('   最新审批:');
      console.log('     - ID:', approval.id);
      console.log('     - 类型:', approval.type);
      console.log('     - 状态:', approval.status);
      console.log('     - 关联工单:', approval.order_no);
      const approvalId = approval.id;

      console.log('\n5. 切换到 admin 账号审批');
      await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: '123456' }),
      });

      console.log('\n6. 管理员通过审批');
      const { data: approveResult } = await apiRequest(`/approvals/${approvalId}/approve`, {
        method: 'PUT',
        body: JSON.stringify({ remark: '同意强制派单' }),
      });
      console.log('   审批结果:', approveResult.success ? '成功' : '失败');
      console.log('   错误:', approveResult.error || '无');
      console.log('   审批状态:', approveResult.data?.status);

      console.log('\n7. 查询审批后工单状态');
      const { data: orderAfter } = await apiRequest(`/orders/${orderId}`);
      console.log('   工单状态:', orderAfter.data?.status);
      console.log('   负责技师:', orderAfter.data?.technician_name || '未分配');
      console.log('   技师ID:', orderAfter.data?.technician_id || '无');

      if (orderAfter.data?.status === 'pending' || !orderAfter.data?.technician_id) {
        console.log('\n❌ BUG 确认：强制派单审批通过后，工单状态还是 pending，技师也没分配上！');
        console.log('   状态应为 assigned，技师应为 李师傅');
      } else if (orderAfter.data?.status === 'assigned' && orderAfter.data?.technician_id) {
        console.log('\n✅ Bug 2 不存在，审批通过后工单状态和技师分配都正确');
      }
    }

  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    console.error(error.stack);
  }
}

testBug2();
