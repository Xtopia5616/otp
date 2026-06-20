# Stage 6 — 客户端 I/O 与浏览器能力层 (api-client/ + webauthn/ + utils/)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 1](./Stage01-领域模型与错误基类.md)（models 错误类 + API 类型）
**关联规格**: [Design.md](../Design.md) §3.4 / §3.5 / §3.6、[Architecture.md](../Architecture.md) §7.5 / §11.1、[StateMachines.md](../StateMachines.md) §3.2

---

## 目标

实现客户端三块叶层能力：① `api-client/` 全局 fetch 拦截器 + 9 端点类型化封装 + 401 吊销 handler 注册（不反向 import `state/`）；② `webauthn/` WebAuthn PRF 仪式封装（create/get + PRF 扩展）；③ `utils/` 时钟漂移检测 + 剪贴板定时清除。三者均为准纯函数 / 客户端 I/O，可独立单测（webauthn 仪式本身需 E2E）。

## 范围

| 文件 | 职责 |
| :--- | :--- |
| `src/lib/api-client/api-client.ts` | `apiFetch` 拦截器（HTTP→类型化错误） |
| `src/lib/api-client/endpoints.ts` | 9 端点类型化封装 |
| `src/lib/api-client/session-revoked-hook.ts` | 401 吊销 handler 注册槽 |
| `src/lib/webauthn/prf.ts` | PRF 仪式 create/get |
| `src/lib/webauthn/support.ts` | PRF 能力检测 |
| `src/lib/webauthn/errors.ts` | WebAuthn 错误类 |
| `src/lib/utils/clock-drift.ts` | 时钟漂移检测 |
| `src/lib/utils/clipboard.ts` | 剪贴板定时清除 |

## 前置依赖

Stage 1 完成（`models/` 错误类 + API 响应类型，`api-client/` 仅依赖 `models/`）。本阶段可与 Stage 4/5 并行（不依赖服务端实现，仅依赖契约类型）。

## 具体任务

- [ ] 6.1 `api-client/api-client.ts`：`apiFetch(input, init?) → Promise<Response>` 拦截器（StateMachines §3.2 伪码），HTTP 状态→类型化错误映射：
  - 401（非 `auth/*`）→ `SessionRevokedError` + `triggerSessionRevoked()`
  - 412 → `OccConflictError`（解析响应体 `{serverVersion, encryptedBlob, wrappedDekByMaster}`，字段无 server 前缀）
  - 429 → `RateLimitError`（读 `Retry-After` 头，默认 60）
  - 403→`ForbiddenError`；404→`NotFoundError`；409→`ConflictError`；5xx→`ServerError`；其余非 2xx→`ApiError`
  - fetch `TypeError` / 超时 → `NetworkError`（携 `cause`）
- [ ] 6.2 `api-client/session-revoked-hook.ts`：`setSessionRevokedHandler(fn: () => void) → void`、`triggerSessionRevoked() → void`（handler 注册解耦，**不 import `state/`**）
- [ ] 6.3 `api-client/endpoints.ts`：类型化封装（均返回类型化响应或抛 `WebOtpError` 子类）：`getAuthParams` / `getVault` / `initVault` / `putVault` / `rotateKey` / `listPasskeyWraps` / `createPasskeyWrap` / `deletePasskeyWrap` / `recoverInit` / `recoverReset` / `revokeSession`
- [ ] 6.4 `webauthn/errors.ts`：`PrfUnsupportedError` / `WebAuthnUserCancelledError` / `PrfOutputMissingError`（均 `extends WebOtpError`）
- [ ] 6.5 `webauthn/support.ts`：`isPrfSupported() → boolean`（特性检测，用于解锁页按钮显隐与降级）
- [ ] 6.6 `webauthn/prf.ts`：
  - `createPasskeyWithPrf({ prfSalt, betterAuthOptions }) → Promise<{ credentialId, prfOut }>`（注入 `extensions.prf.eval`，从 `clientExtensionResults.prf.results.first(prfSalt)` 取 `PRF_out`）
  - `getAssertionWithPrf({ prfSalt, email }) → Promise<{ credentialId, assertion, prfOut }>`
  - 浏览器不支持→`PrfUnsupportedError`；用户取消→`WebAuthnUserCancelledError`；PRF 输出缺失→`PrfOutputMissingError`
- [ ] 6.7 `utils/clock-drift.ts`：`detectClockDrift() → Promise<number>`（比对 HTTP `Date` 响应头与 `Date.now()`，返回偏差秒；失败返回 0）
- [ ] 6.8 `utils/clipboard.ts`：`copyAndClearAfter(text, clearMs = 30_000) → Promise<void>`（写入剪贴板，`clearMs` 后条件清除；API 被拒静默忽略）
- [ ] 6.9 单测 `tests/unit/api-client/`（MSW mock fetch）：
  - `interceptor.test.ts`：全部状态码映射（200 放行 / 401 非 auth→`SessionRevokedError`+触发 / 401 auth→不触发 / 412 解析三字段 / 429 读 Retry-After 无头默认 60 / 403/404/409/5xx / fetch TypeError→`NetworkError`）
  - `endpoints.test.ts`：9 端点成功路径类型化返回
  - `session-revoked-hook.test.ts`：注册 / 触发纯逻辑
- [ ] 6.10 单测 `tests/unit/webauthn/support.test.ts`（mock `navigator`：有 prf→true / 无→false）
- [ ] 6.11 单测 `tests/unit/utils/`：`clock-drift.test.ts`（mock Date 头）、`clipboard.test.ts`（mock navigator.clipboard，被拒静默）
- [ ] 6.12 `webauthn/prf.ts` 标注需 E2E（Playwright 虚拟 WebAuthn）覆盖，留待 Stage 9

## 验收标准

- `pnpm test:unit` 通过；`api-client` 拦截器全部状态码映射断言通过
- 412 解析后 `OccConflictError` 携正确 `serverVersion`/`serverEncryptedBlob`/`serverWrappedDekByMaster`；429 读 `Retry-After`（无头默认 60）
- `session-revoked-hook` 注册 / 触发纯逻辑单测通过；`api-client/` 不 import `state/`（依赖方向 `state → api-client` 单向，Design §2.3）
- `isPrfSupported` 在 mock 环境返回正确布尔
- `api-client/` 仅依赖 `models/`（类型与错误）；`webauthn/` 仅依赖 `models/`；`utils/` 无内部依赖
- `webauthn/prf.ts` 的 `PRF_out` 以 `Uint8Array` 短暂持有，派生 `KEK_PRF` 后由调用方 `secureWipe`（不变量，CryptoSpec §9.2）

## 关键参考

- Design §3.4（webauthn/）、§3.5（utils/）、§3.6（api-client/ 含文档对齐说明）、§8.4（handler 注册解耦）
- Architecture §7.5（PRF 免密解锁多设备多 Passkey）、§11.1（时钟漂移）、§8.3（会话吊销）
- StateMachines §3.2（拦截器架构 + 伪码）、§3.1（429 Retry-After 默认 60）
- Engineering §6.1（错误类构造约定：`OccConflictError` 从无 server 前缀响应体解析）

## 风险与注意事项

- **`api-client` 路径修正**：拦截器运行于**客户端**（触发锁定、用响应式状态），路径为 `src/lib/api-client/`，**非** `src/lib/server/api-client.ts`（Design §3.6 / §10.2 已纠正 StateMachines 旧路径）。
- **handler 注册解耦**：`api-client` 通过 `setSessionRevokedHandler` 接收回调，`state/crypto.svelte` 在应用启动时注册 `lock`；`api-client` 永不 import `state/`（Design §8.4）。
- **`auth/*` 401 不触发吊销**：登录凭据错误由登录页处理，拦截器须判断 `isAuthEndpoint(input)` 跳过 handler（StateMachines §3.2）。
- **PRF 降级**：浏览器/设备不支持 PRF、`prf.eval` 失败或用户取消时，调用方回退 MP 路径（Architecture §7.5）；本模块只抛对应错误，降级编排归 Stage 7/8。
- **剪贴板被拒静默**：`navigator.clipboard` 权限拒绝时不抛错，静默忽略（UIInventory §7.3）。
