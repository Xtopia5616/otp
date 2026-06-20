# Stage 7 — 客户端状态层 (state/)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 2](./Stage02-密码学原语.md)（crypto/）、[Stage 6](./Stage06-客户端IO与浏览器能力层.md)（api-client/ + webauthn/）
**关联规格**: [Design.md](../Design.md) §4、[Architecture.md](../Architecture.md) §6 / §5.3 / §7.3、[StateMachines.md](../StateMachines.md) §1 / §2 / §4 / §8

---

## 目标

实现 Svelte 5 Runes 三大状态模块（同级 sibling，**禁止互相 import**）：`auth.svelte`（身份/设备/会话）、`crypto.svelte`（KEK/DEK 派生解包、解锁状态机、内存擦除、锁定触发）、`vault.svelte`（单体同步引擎：同步状态机 + 防抖 + 重试 + 3-way 合并纯函数 `mergeAccounts` + Blob/快照离线缓存）。跨模块协作经 `api-client` handler 注册 + IndexedDB store 隔离，不经同层互导。

## 范围

| 文件 | 职责 |
| :--- | :--- |
| `src/lib/state/auth.svelte.ts` | Better Auth 会话/设备/吊销 + auth-params 离线缓存 |
| `src/lib/state/crypto.svelte.ts` | KEK/DEK 派生解包、解锁状态机、内存擦除、锁定触发 |
| `src/lib/state/vault.svelte.ts` | 单体同步引擎 + 导出 `mergeAccounts` 纯函数 |

## 前置依赖

Stage 2（`crypto/` 全部原语）、Stage 6（`api-client/` + `webauthn/`）、Stage 1（`models/`）。`state/` 不依赖 `server/`。

## 具体任务

- [ ] 7.1 `vault.svelte.ts` 导出纯函数 `mergeAccounts(base, local, remote) → Account[]`（Architecture §5.3 全部裁决规则 + base 丢失两方降级）：
  - 墓碑绝对优先（Local/Remote 任一 `deletedAt≠null`→结果删除，取两侧非空较小值，即使另一侧修改字段仍删除）
  - 仅一侧新增且未删除→纳入
  - 字段级三方裁决（仅一侧相对 base 变更→采用该侧；两侧均变更→`updatedAt` 较大者胜；均未变→沿用 base）
  - HOTP `counter` 恒取 `max(Local, Remote)`（不走 updatedAt）
  - 不可变字段 `id`/`createdAt` 永不参与变更
  - base 丢失降级：以 Local 为基准，采纳 Remote 新增/墓碑，两侧均存在按 updatedAt 取大（counter 仍 max）
- [ ] 7.2 `vault.svelte.ts` 模块级 `$state`：`accounts: Account[]`、`baseSnapshot: Account[]`、`syncStatus: 'idle'|'dirty'|'syncing'|'conflict'`、`lastVersion: number`（Architecture §6.3）
- [ ] 7.3 `vault.svelte.ts` 同步编排：`initEmptyBlob(dek)` / `loadVault(dek, remote)` / `addAccount(draft)` / `updateAccount(account)` / `deleteAccount(id)`（软删除置 `deletedAt`）/ `triggerSync(dek)`（防抖入口）/ `encryptAndUpload(dek)` / `handleOccConflict(err, dek)`（解密 Remote→`mergeAccounts`→重 PUT 循环）/ `persistToIndexedDB()` / `loadFromIndexedDB(dek)` / `getCachedPasskeyWraps()`
- [ ] 7.4 `vault.svelte.ts` 重试队列：`calculateBackoff(attempt)`（StateMachines §4.2：`min(2^n × 1000 + random(0,1000), 30000)`）+ `syncWithRetry`（网络/5xx 指数退避 5 次；412 合并不计次重置计数；429 按 `Retry-After`；401 不重试触发锁定）
- [ ] 7.5 `vault.svelte.ts` 防抖：500ms 窗口 / 3000ms 最大等待（StateMachines §8），窗口内再次变更重置计时器
- [ ] 7.6 `vault.svelte.ts` IndexedDB stores（库 `webotp`，Design §8.3）：`vault-cache`（`{encryptedBlob, wrappedDekByMaster, version, updatedAt}`）/ `base-snapshot`（`Account[]`）/ `passkey-wraps`（`PasskeyWrapRow[]`）
- [ ] 7.7 `crypto.svelte.ts` 模块级状态：`isUnlocked: boolean`、`unlockStatus: 'locked'|'unlocking'|'unlocked'|'locking'`、`dekRef: CryptoKey | null`（**不**放入 `$state`——模块级非响应式引用 + `isUnlocked` 响应式标志，Engineering §4.1）
- [ ] 7.8 `crypto.svelte.ts`：`unlockWithMp({mp, authParams, wrappedDekByMaster})` / `unlockWithPasskey()`（经 `webauthn.getAssertionWithPrf` + `api-client.listPasskeyWraps` + `crypto.unwrapDek`）/ `unlockWithRecoveryKey({rk, recoverInitResp})` / `lock()`（擦除 + 重置计时器 + `AbortController.abort()` 取消在途 fetch）/ `rotateMasterPassword({oldMp, newMp})` / `registerSessionRevokedHandler()`（向 `api-client` 注册 `lock`，应用启动时调用）
- [ ] 7.9 `crypto.svelte.ts` 锁定触发：主动 / 5min 无操作（`mousemove`/`keydown`/`touchstart`/`scroll` 重置）/ `visibilitychange→hidden`（StateMachines §2.4：hidden<30s 且非 syncing 立即锁；syncing 中等完成再锁）/ 任意 401（经 handler）
- [ ] 7.10 `crypto.svelte.ts` 内存擦除：`lock()` 对 MP/RK/PRF/KEK 派生字节/base32 解码种子调 `crypto.secureWipe` + `dekRef=null`；解包失败（AEAD）→ `DecryptionError` → `unlocking→locked` + UI `auth.unlock.error.wrongPassword`（不区分密码错/数据损坏）
- [ ] 7.11 `auth.svelte.ts` 模块级 `$state`：`isAuthenticated: boolean`、`sessions: SessionRow[]`、`currentDeviceId: string | null`、`authStatus: 'idle'|'authenticating'|'error'`
- [ ] 7.12 `auth.svelte.ts`：`registerWithLak({email, lak, vaultInitReq})` / `loginWithLak({email, lak})` / `loginWithPasskey(assertion)` / `logout()` / `listSessions()` / `revokeSession(id)` / `sedimentAuthParams(params)` / `getCachedAuthParams()`（IndexedDB `auth-params` store，**不缓存** `loginSalt`/`recoverySalt`，Architecture §7.2）
- [ ] 7.13 `auth.svelte.ts` 登录 401（凭据错）**不触发**吊销 handler，向上抛供登录页显示 `auth.login.error.wrongPassword`
- [ ] 7.14 三大 state 模块同级，**禁止互相 import**（Design §4）；跨模块经 `api-client` handler 注册 + IndexedDB store 隔离；`state/crypto` 读 `auth-params` store 经 idb 直接访问，**不** import `state/auth`
- [ ] 7.15 单测 `tests/unit/merge/three-way.test.ts`（Testing §5 全部矩阵）：墓碑优先 / 新增 / 字段级三方裁决 / HOTP counter max / 不可变字段 / base 丢失两方降级
- [ ] 7.16 集成测试 `tests/integration/state/`：
  - `sync-state-machine.test.ts`：`syncStatus` 四态转换（idle→dirty→syncing→idle/conflict/dirty）、防抖、412→conflict→syncing 循环、网络/5xx 退避、401→idle+锁定
  - `unlock-state-machine.test.ts`：locked→unlocking→unlocked/locked、visibilitychange 处理、401 强制锁定路径（StateMachines §2.5）

## 验收标准

- `pnpm test:unit` 通过；`mergeAccounts` 全部矩阵用例通过（Testing §5）
- `mergeAccounts` 为纯函数（导入模块会初始化响应式 state，但函数本身纯；Testing §1.2 注）
- `pnpm test:integration` 通过；`syncStatus` 状态转换符合 StateMachines §1.2 / §1.3；解锁状态机符合 §2.2 / §2.3 / §2.4 / §2.5
- 三大 state 模块**无互相 import**（`madge --circular src/lib/` 校验）
- `crypto.svelte` 的 `dekRef` 不放入 `$state`（避免代理包装干扰 `secureWipe` 覆写语义，Engineering §4.1）
- 重试退避公式 `min(2^n × 1000 + jitter, 30000)` 与 StateMachines §4.2 表一致；412 合并不计次
- IndexedDB 三 store 隔离：`state/auth` 只写 `auth-params`、`state/vault` 只写 `vault-cache`/`base-snapshot`/`passkey-wraps`、`state/crypto` 只读 `auth-params`（Design §8.3）

## 关键参考

- Design §4（state/ 三模块契约 + 单体 vault 决策）、§8.3（IndexedDB store 隔离）、§8.4（handler 注册解耦）
- Architecture §6（前端状态管理）、§5.3（三方合并语义 + base 丢失降级）、§7.3（并发同步 OCC）
- StateMachines §1（syncStatus 状态机）、§2（解锁状态机 + visibilitychange + 401 路径）、§4（重试退避）、§8（防抖）
- Engineering §4.1（`$state` 敏感状态边界）、§4.3（`$effect` 规则）
- Testing §5（三方合并测试矩阵）

## 风险与注意事项

- **单体 `vault.svelte.ts`**：同步/3-way 合并/防抖/重试/离线缓存全部内置，**不**外拆 sync/storage/merge 子模块（Design §0.3 决策）；`mergeAccounts` 作为该模块导出的纯函数。
- **`dekRef` 不入 `$state`**：`$state` 的代理包装会干扰 `getRandomValues()` 覆写语义；用模块级非响应式引用 + `isUnlocked` 响应式标志（Engineering §4.1）。
- **`$effect` 不直接赋值其他 `$state`**：防无限循环；同步触发经事件处理器或显式函数调用（Engineering §4.3）。
- **401 强制锁定路径**：`AbortController.abort()` 取消在途 fetch + `syncStatus→idle`（丢弃未同步变更）+ `unlocked→locking→locked` + 跳 `/login`（StateMachines §2.5）。
- **合并期间不阻断编辑**：`conflict` 态 UI 显示"正在合并…"但用户可继续编辑，变更叠加到下一轮 Local 侧（StateMachines §1.3）。
- **诚实定界**：`lock()` 无法清除 `CryptoKey` 内部不可导出状态与 JS 不可变字符串（MP 作为 string 的 UTF-16 副本）；敏感根因子应尽量以 `Uint8Array` 短暂持有并立即覆写（Architecture §6.2）。
