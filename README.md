# 上门工单调度系统

本地上门服务工单调度管理系统，支持技师班表维护、工单全生命周期管理、审批流程、冲突检测和日报导出。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS 3 + Zustand + React Router 7 |
| 后端 | Express 4 + TypeScript + sql.js (SQLite WebAssembly) |
| 数据库 | SQLite（本地文件持久化，`data/database.db`） |
| 认证 | express-session + bcryptjs |

---

## 启动方式

### 1. 安装依赖

```bash
npm install
```

### 2. 启动后端开发服务器

```bash
npm run server:dev
```

后端运行在 `http://localhost:3001`

### 3. 启动前端开发服务器

```bash
npm run client:dev
```

前端运行在 `http://localhost:5173`

### 4. 类型检查

```bash
npx tsc --noEmit
```

### 5. 生产构建

```bash
npm run build
```

### 6. 运行冲突处理中心完整回归测试

```bash
node test-conflict-center-v2.mjs
```

测试通过数预期 35/35，覆盖状态筛选、组合筛选、权限拦截、重叠冲突、审批流程、驳回拦截。

### 7. 验证重启后数据持久化

```bash
# 先跑完整回归测试，记下输出的 UNIQUE_TOKEN
node test-conflict-center-v2.mjs
# 输出：测试数据标记 UNIQUE_TOKEN=XXXXXXXX

# 重启后端服务后，运行持久化验证
node test-conflict-center-persistence.mjs <UNIQUE_TOKEN>
```

### 8. 运行基础回归测试

```bash
node test-regression.mjs
```

---

## 测试账号

| 账号 | 密码 | 角色 | 权限 |
|------|------|------|------|
| admin | 123456 | 系统管理员 | 全部权限（审批、强制派单） |
| dispatcher | 123456 | 张调度（调度员） | 派单、提交申请，无审批权 |

---

## 功能模块

### 1. 技师管理
- 技师增删改查（姓名、电话、技能、状态）
- 按星期设置班表和可服务时段
- 加班自动检测

### 2. 工单全生命周期

状态流转：

```
待分配(pending) → 已分配(assigned) → 已确认(confirmed) → 服务中(in_progress) → 已完成(completed)
                                                          ↓
                                                       已取消(cancelled)
```

支持操作：
- 创建工单
- 分配技师（自动检测时段冲突）
- 确认上门
- 开始服务
- 完成处理
- 取消工单
- 改派（需审批）
- 强制派单（管理员可直接执行，调度员需审批）

### 3. 审批中心
- 改派审批
- 强制派单审批
- 加班审批
- 审批意见和历史记录

### 4. 冲突检测
- 时段重叠冲突（同一技师同一时段不能有两张占用工单）
- 班表外加班检测
- 冲突记录与解决追踪

### 5. 日报导出
- 工单统计（总数、完成、取消、待处理）
- 技师工作量统计
- CSV 格式导出

---

## 核心流程演示

### 主流程：工单从创建到完成

1. **创建工单**：填写客户信息、服务类型、预约时段 → 状态变为 `待分配`
2. **分配技师**：选择合适技师派单 → 状态变为 `已分配`
3. **确认上门**：技师确认接单 → 状态变为 `已确认`
4. **开始服务**：技师到达现场 → 状态变为 `服务中`
5. **完成处理**：填写处理结果 → 状态变为 `已完成`
6. **导出日报**：在日报页面查看统计并导出 CSV

### 强制派单审批流程

1. 调度员创建工单
2. 调度员提交"强制派单申请"，选择目标技师并填写理由
3. 管理员登录，进入"审批中心"
4. 管理员通过或驳回申请
5. 审批通过后，工单自动分配到目标技师名下，状态变为 `已分配`
6. 后续可正常确认、上门、完成

### 失败链路验证

| 场景 | 预期行为 |
|------|----------|
| 结束时间早于开始时间 | 工单无法保存，提示"结束时间必须晚于开始时间" |
| 同一技师重叠时段正常分配 | 第二张被拦截，提示时段冲突 |
| 同一技师重叠时段确认 | 第二张被拦截，提示"该技师在此时段已有其他确认工单" |
| 普通调度员直接强制派单 | 被拒绝，提示权限不足 |
| 普通调度员审批加班/强制派单 | 被拒绝，需要管理员角色 |

---

## 数据持久化

数据库文件：`data/database.db`

每次写入自动持久化到磁盘。应用重启后，以下数据保持一致：
- 技师信息和班表安排
- 工单状态和技师分配
- 未解决冲突记录
- 审批记录和意见
- 操作历史
- 日报统计数据

**验证方式**：
```bash
# 1. 先跑一遍回归测试
node test-regression.mjs

# 2. 记下输出中的 RUN_ID
# 运行标识: XXXXXXXX

# 3. 重启后端服务

# 4. 验证持久化
node test-persistence-check.mjs <RUN_ID>
```

---

## 回归测试

正式回归入口：`test-regression.mjs`

```bash
node test-regression.mjs
```

包含 3 组测试：

| 测试项 | 验证内容 |
|--------|----------|
| Bug 1 - 重叠时段确认 | 第一张重叠工单可确认，第二张被正确拦截 |
| Bug 2 - 强制派单审批 | 审批通过后工单状态更新、技师分配正确，可继续流转至完成 |
| 回归验证 - 正常分配重叠 | 正常派单的时段重叠检测仍然有效 |

测试使用时间戳运行标识 + 动态隔离日期，在存在历史数据时也能稳定通过。

---

## Bug 修复记录

### Bug 1：同一技师重叠时段工单都确认不了

**现象**：两张重叠工单都处于 `assigned` 状态时，两张都确认失败，而不是"第一张成功，第二张被拦"。

**根因**：`confirm()` 调用冲突检测时，检查范围包含了 `assigned` 状态，导致只要有另一张已分配的重叠工单存在，所有工单都确认不了。

**修复**：
- 文件：`api/services/OrderService.ts`
- `confirm()` 方法调用 `hasTimeOverlap()` 时，只检查 `confirmed` + `in_progress` 状态
- `hasTimeOverlap()` 增加可选 `statuses` 参数，默认值保持 `['assigned', 'confirmed', 'in_progress']`，不影响分配时的检测

**用户可见变化**：第一张重叠工单可正常确认，第二张被清晰提示拦截。

---

### Bug 2：强制派单审批通过后工单原地不动

**现象**：调度员提交强制派单申请，管理员审批通过，接口返回"成功"，但工单状态还是 `pending`，也没挂到技师名下。

**根因（两处缺陷叠加）**：
1. `approvals` 表缺少 `target_technician_id` 字段，审批记录不知道要派给谁
2. `ApprovalService.approve()` 错误地从工单取 `technician_id`，但 `pending` 状态工单没有技师，条件永远不满足，强制派单从未实际执行

**修复**（4 处小改动，不删库）：
1. `api/db/index.ts` — 建表 DDL 新增 `target_technician_id` 字段
2. `api/db/index.ts` — 新增 `migrateDatabase()`，旧库自动 `ALTER TABLE` 迁移
3. `api/services/ApprovalService.ts` — `create()` 接收并保存目标技师，`approve()` 从审批记录取目标技师执行派单
4. `api/routes/orders.ts` — 申请接口把 `technicianId` 传入审批服务

**用户可见变化**：
- 审批通过后，工单立即挂到目标技师名下
- 状态从 `待分配` 变为 `已分配`
- 可继续正常流转（确认 → 开始 → 完成）
- 工单历史完整记录申请和审批全过程

---

## 目录结构

```
├── api/
│   ├── db/index.ts           # 数据库层（sql.js + 持久化 + 迁移）
│   ├── services/             # 业务服务层
│   │   ├── OrderService.ts   # 工单服务
│   │   ├── TechnicianService.ts  # 技师与班表服务
│   │   ├── ApprovalService.ts    # 审批服务
│   │   ├── ConflictService.ts    # 冲突服务
│   │   └── ReportService.ts      # 报表服务
│   ├── routes/               # API 路由
│   ├── middleware/auth.ts    # 认证与权限
│   └── server.ts             # 服务器入口
├── src/
│   ├── pages/                # 页面组件
│   │   ├── ConflictCenter.tsx # 冲突处理中心页面
│   │   └── ...
│   ├── components/           # 通用组件
│   ├── lib/
│   │   └── api.ts            # API 请求封装（含 ApiError）
│   └── store/                # 状态管理
├── shared/types.ts           # 共享 TypeScript 类型
├── data/database.db          # SQLite 数据库文件
├── test-regression.mjs       # 基础回归测试
├── test-conflict-center.mjs  # 冲突处理中心回归测试
├── test-persistence-check.mjs # 持久化验证脚本
└── README.md
```
