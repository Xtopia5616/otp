# Stage 9 — 端到端集成与关键用户流 (E2E)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 5](./Stage05-API路由层.md)（API 端点）、[Stage 8](./Stage08-UI层与国际化.md)（UI 页面）
**关联规格**: [Testing.md](../Testing.md) §1.3、[Architecture.md](../Architecture.md) §7

---

## 目标

用 Playwright（chromium + 虚拟 WebAuthn）覆盖全部关键用户流的端到端闭环：注册→解锁→加账户→同步、多设备冲突合并、PRF 绑定+免密解锁、灾难恢复、密码轮换会话吊销、离线编辑恢复。E2E 是分层推进策略的集成风险兜底，验证各层模块在真实链路下协同正确。

## 范围

| 文件 | 覆盖流 |
| :--- | :--- |
| `tests/e2e/registration-flow.spec.ts` | 注册→解锁→加账户→同步 |
| `tests/e2e/conflict-merge.spec.ts` | 多设备并发冲突合并 + 墓碑 |
| `tests/e2e/prf-unlock.spec.ts` | PRF 绑定+免密解锁+降级 |
| `tests/e2e/disaster-recovery.spec.ts` | 灾难恢复全流程 |

## 前置依赖

Stage 5（API 端点可调）、Stage 8（UI 页面可交互）。Playwright 已配置（Stage 0），虚拟 WebAuthn authenticator 已启用。

## 具体任务

- [ ] 9.1 `registration-flow.spec.ts`（Architecture §7.1 / §7.2）：
  - 注册：输入 email+MP → 客户端生成 DEK/RK/盐 → 包装 → BA 注册（LAK）→ `POST /api/vault` version=1 → 展示 RK 抄写确认 → 跳转 /app
  - 解锁：登出 → /unlock → 输入 MP → 派生 KEK_MP → 解包 DEK → 解密 Blob → 渲染空列表
  - 加账户：AddAccountDialog 输入 otpauth URI → 解析 → addAccount → syncStatus dirty→syncing→idle
  - 同步验证：DB `vault.version` 自增；IndexedDB `webotp` 库沉淀 `vault-cache`/`base-snapshot`/`auth-params`
- [ ] 9.2 `conflict-merge.spec.ts`（Architecture §7.3 / §5.3）：
  - 双设备并发：设备 A/B 各加不同账户 → A 先同步 → B `PUT` 收 412 → 三方合并 → 两账户均保留
  - 墓碑场景：设备 A 删账户 X，设备 B 离线改 X 后同步 → 合并结果 X 仍标记删除（僵尸数据不复活）
  - 字段冲突：两侧改同一字段 → `updatedAt` 较大者胜
  - HOTP counter：两侧各自递增 → 合并取 max
  - base 丢失降级：清空 IndexedDB `base-snapshot` → 两方合并 → 一次性 Toast `sync.merge.degraded`
- [ ] 9.3 `prf-unlock.spec.ts`（Architecture §7.5，Playwright 虚拟 WebAuthn）：
  - 绑定：已登录 → settings/passkeys → `navigator.credentials.create`（prf.eval）→ KEK_PRF 派生 → 包装 DEK → `POST /api/passkey-wraps` 新行
  - 免密解锁：登出 → /login → Passkey 按钮 → `navigator.credentials.get`（PRF）→ (a) BA 验证建立会话 (b) PRF_out 解包 DEK → 解密 Blob → /app，全程无 MP
  - 撤销：DELETE passkey-wraps/:credentialId + 吊销 BA 凭证 → 该设备无法再免密
  - 降级：模拟 PRF 不支持/取消 → 回退 MP 解锁
- [ ] 9.4 `disaster-recovery.spec.ts`（Architecture §7.6 / §3.6 / §8.5）：
  - `recover/init` 取材料（限流验证）→ 输入旧 RK → 派生 KEK_RK → 解包 wrappedDekByRecovery → 解密 Blob 恢复
  - `recover/reset`：设置新 MP + 生成新 RK + 配新盐 → 校验旧 recoveryVerifier 通过 → 单事务更新全部字段 + 吊销所有会话 → 展示新 RK 抄写
  - 旧 RK 失效：再用旧 RK `recover/reset` → 403
  - 旧会话失效：恢复前活动会话全部吊销
  - DEK/Blob 不变：恢复后原离线数据与各 Passkey 包装仍可解密
- [ ] 9.5 密码轮换 E2E（Architecture §7.4 / §8.2，并入 conflict-merge 或独立 spec）：
  - 设备 A 轮换 MP → 吊销其他会话 → 设备 B 上线 `PUT` 401 → 强制锁定 → 跳 /login → 旧 MP 登录失败 → 新 MP 登录成功 → 派生新 KEK_MP → 解包云端新 wrappedDekByMaster → 合并离线数据 → 重新加密上传
  - 阻断式合并 UI（StateMachines §5.2）："会话已失效"对话框 → "使用新密码登录" / "使用恢复密钥"
- [ ] 9.6 离线场景（Architecture §7.2 / §7.3）：断网 → 编辑账户 → IndexedDB 持久化 → 恢复在线 → 后台 syncing 合并上传
- [ ] 9.7 时钟漂移警告（Architecture §11.1）：模拟偏差 >15s → `ClockDriftWarning` Alert 显示
- [ ] 9.8 复制清除（utils/clipboard）：点击复制 → Toast → 30s 后剪贴板清除（Playwright 读剪贴板验证）

## 验收标准

- `pnpm test:e2e` 通过（chromium，Testing §1.3）；关键用户流 100% 覆盖
- 注册→解锁→加账户→同步全链路绿；DB version 自增、IndexedDB 沉淀
- 双设备冲突合并收敛：墓碑优先、新增保留、字段 `updatedAt` 仲裁、HOTP counter max、base 丢失降级 Toast
- PRF 绑定+免密解锁+撤销+降级路径均通过
- 灾难恢复后旧 RK 重置→403、旧会话失效、DEK/Blob 不变
- 密码轮换后他设备 401→新 MP 登录→合并；阻断式 UI 文案正确
- 离线编辑恢复在线后合并上传；时钟漂移 >15s 警告显示

## 关键参考

- Testing §1.3（Playwright 配置 + E2E 目录约定）
- Architecture §7（核心工作流：注册/登录/并发同步/密码轮换冲突/PRF/灾难恢复）、§5.3（合并语义）、§8.2/§8.5（轮换/恢复）
- StateMachines §5（冲突解决 UI 流程 + 阻断式文案）、§2.5（401 强制锁定路径）
- UIInventory §6（解锁页交互）、§7（OTP 列表交互）

## 风险与注意事项

- **虚拟 WebAuthn**：PRF 测试需 Playwright Chromium 虚拟 authenticator（支持 `prf` 扩展）；Firefox/Safari 不支持 PRF，E2E 仅跑 chromium（Testing §1.3）。
- **多设备模拟**：用两个 browser context（独立 IndexedDB/会话）模拟设备 A/B；注意会话隔离。
- **限流干扰**：`recover/init`/`reset` E2E 须考虑限流计数，测试间重置 rate-limit store 或用不同 IP/email。
- **Argon2id 耗时**：E2E 用真实生产参数（m=65536/t=3/p=4）派生约 1–3s，`timeout: 60_000` 已设（Testing §1.3）；勿误用降速参数。
- **IndexedDB 隔离**：每个 browser context 独立 IndexedDB；base 丢失降级测试须显式清空 `base-snapshot` store。
- **OCC 重试**：合并循环可能多轮 412，E2E 须等待 `syncStatus→idle` 而非固定 sleep。
