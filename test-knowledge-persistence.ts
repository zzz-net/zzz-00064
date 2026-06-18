// ============================================================
// 知识库 - 跨重启数据保持测试
// 两阶段执行：
//   阶段 1 (prepare): 创建带唯一标记的测试数据，写入 checkpoint 文件
//   阶段 2 (verify):  读取 checkpoint，验证跨重启后数据仍在且状态一致
// ============================================================
import fetch from 'node-fetch';
import * as fs from 'fs';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';
const API = `${BASE}/api`;
const CHECKPOINT = './.persist-checkpoint.json';
const PHASE = process.argv[2] || 'prepare';

type Checkpoint = {
  createdAt: string;
  cookie: string;
  entry: {
    id: number;
    title: string;
    category_id: number;
    current_version_id: number;
    version_no: number;
    status: string;
    answer_md5: string;
  };
  hitRecordId?: number;
};

// ---------- 辅助 ----------
async function loginAdmin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  const raw = res.headers.raw()['set-cookie']?.[0] || '';
  const cookie = raw.split(';')[0]?.trim() || '';
  if (!cookie) throw new Error('登录失败，无法获取 cookie');
  return cookie;
}
function jar(cookie: string) {
  return { 'Content-Type': 'application/json', Cookie: cookie };
}
async function req(path: string, cookie: string, opts: any = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...jar(cookie), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}
function md5ish(s: string): string {
  // 简单哈希，用于比对内容是否相同
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

// ---------- 阶段 1：准备数据 ----------
async function phasePrepare() {
  console.log('=== [阶段 1/2] 创建可识别的测试数据 ===');
  const cookie = await loginAdmin();
  const marker = `PERSIST-${Date.now()}`;
  const answer = `跨重启持久化测试话术-${marker}`;

  // 1. 创建条目
  let r = await req('/knowledge/entries', cookie, {
    method: 'POST',
    body: JSON.stringify({ title: marker, category_id: 1, answer }),
  });
  if (!r.body.success) throw new Error('创建条目失败: ' + JSON.stringify(r.body));
  const entryId = r.body.data.id;
  console.log(`  ✅ 创建条目 #${entryId}（标题: ${marker}）`);

  // 2. submit
  r = await req(`/knowledge/entries/${entryId}/submit`, cookie, { method: 'POST', body: '{}' });
  if (!r.body.success) throw new Error('submit 失败: ' + JSON.stringify(r.body));

  // 3. approve + publish
  r = await req(`/knowledge/entries/${entryId}/approve`, cookie, {
    method: 'POST',
    body: JSON.stringify({ review_remark: '持久化测试自动通过' }),
  });
  if (!r.body.success) throw new Error('approve 失败: ' + JSON.stringify(r.body));
  console.log('  ✅ 已发布（published）');

  // 4. 从列表接口读取条目（返回扁平结构，直接取 data[0]）
  r = await req(`/knowledge/entries?id=${entryId}`, cookie, { method: 'GET' });
  const list = r.body?.data || [];
  const entryFlat = list.find((e: any) => e.id === entryId);
  if (!entryFlat) throw new Error('创建后无法从列表查到条目');
  const ckpt: Checkpoint = {
    createdAt: new Date().toISOString(),
    cookie,
    entry: {
      id: entryFlat.id,
      title: entryFlat.title,
      category_id: entryFlat.category_id,
      current_version_id: entryFlat.current_version_id,
      version_no: entryFlat.version,
      status: entryFlat.status,
      answer_md5: md5ish(entryFlat.answer || ''),
    },
  };

  // 5. 顺便写一条命中记录，验证持久化
  const orders = await req('/orders?limit=1', cookie, { method: 'GET' });
  const firstOrderId = orders.body?.data?.[0]?.id;
  if (firstOrderId) {
    const matchR = await req(`/knowledge/match/${firstOrderId}`, cookie, { method: 'POST', body: '{}' });
    if (matchR.body?.data?.hit_records?.length > 0) {
      ckpt.hitRecordId = matchR.body.data.hit_records[0].id;
      console.log(`  ✅ 额外创建命中记录 #${ckpt.hitRecordId}（用于持久化验证）`);
    }
  }

  fs.writeFileSync(CHECKPOINT, JSON.stringify(ckpt, null, 2), 'utf-8');
  console.log(`\n💾 Checkpoint 已写入 ${CHECKPOINT}`);
  console.log('🔔 现在请手动重启后端（单 PID 方式），然后执行:');
  console.log('      npx tsx test-knowledge-persistence.ts verify');
  console.log('   或让此脚本自动等待 10 秒后直接检测重启结果。');
}

// ---------- 阶段 2：验证数据 ----------
async function phaseVerify() {
  console.log('=== [阶段 2/2] 验证跨重启后数据保持 ===');
  if (!fs.existsSync(CHECKPOINT)) throw new Error('未找到 checkpoint，请先执行 prepare 阶段');
  const ckpt: Checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf-8'));
  console.log(`  📌 Checkpoint 创建时间: ${ckpt.createdAt}`);
  console.log(`  📌 目标条目: #${ckpt.entry.id}  标题: ${ckpt.entry.title}`);

  // 重新登录（原 session 可能因重启而失效，取决于 session store）
  let cookie = ckpt.cookie;
  let probe = await req(`/knowledge/entries?id=${ckpt.entry.id}`, cookie, { method: 'GET' });
  if (probe.res.status === 401) {
    console.log('  ℹ️  原 session 已失效，重新登录...');
    cookie = await loginAdmin();
    probe = await req(`/knowledge/entries?id=${ckpt.entry.id}`, cookie, { method: 'GET' });
  }
  if (probe.res.status !== 200) throw new Error(`查询条目列表失败 HTTP ${probe.res.status}`);

  const list = probe.body?.data || [];
  const detail = list.find((e: any) => e.id === ckpt.entry.id);
  if (!detail) throw new Error(`条目 #${ckpt.entry.id} 在重启后丢失（跨重启未持久化）`);
  const fail: string[] = [];
  const pass: string[] = [];

  const check = (name: string, exp: any, act: any) => {
    if (String(exp) === String(act)) pass.push(`✅ ${name}: ${act}`);
    else fail.push(`❌ ${name}: 期望 ${exp}，实际 ${act}`);
  };

  check('条目存在(id)', ckpt.entry.id, detail.id);
  check('标题一致', ckpt.entry.title, detail.title);
  check('分类一致', ckpt.entry.category_id, detail.category_id);
  check('状态保持', ckpt.entry.status, detail.status);
  check('当前版本 id', ckpt.entry.current_version_id, detail.current_version_id);
  check('当前版本 no', ckpt.entry.version_no, detail.version);
  check('内容哈希一致', ckpt.entry.answer_md5, md5ish(detail.answer || ''));

  // 命中记录持久化
  if (ckpt.hitRecordId) {
    const hr = await req(`/knowledge/hit-records?id=${ckpt.hitRecordId}`, cookie, { method: 'GET' });
    const list = hr.body?.data || [];
    const found = list.find((x: any) => x.id === ckpt.hitRecordId);
    if (found) pass.push(`✅ 命中记录 #${ckpt.hitRecordId} 仍然存在`);
    else fail.push(`❌ 命中记录 #${ckpt.hitRecordId} 丢失`);
  }

  // 版本链完整
  const v = await req(`/knowledge/entries/${ckpt.entry.id}/versions`, cookie, { method: 'GET' });
  const versions = v.body?.data || [];
  if (versions.length >= 1) pass.push(`✅ 版本链完整（${versions.length} 个版本）`);
  else fail.push(`❌ 版本链丢失（期望 >=1，实际 ${versions.length}）`);

  console.log('\n' + pass.join('\n'));
  if (fail.length) {
    console.log('\n' + fail.join('\n'));
    console.error(`\n💥 持久化验证失败：${fail.length} 项不一致`);
    process.exit(1);
  } else {
    console.log(`\n🎉 跨重启持久化验证全部通过（${pass.length} 项）`);
    fs.rmSync(CHECKPOINT, { force: true });
    console.log(`🧹 已清理 checkpoint 文件`);
    process.exit(0);
  }
}

// ---------- 入口 ----------
(async () => {
  try {
    if (PHASE === 'verify') await phaseVerify();
    else await phasePrepare();
  } catch (e: any) {
    console.error('\n💥 执行异常:', e.message);
    process.exit(2);
  }
})();
