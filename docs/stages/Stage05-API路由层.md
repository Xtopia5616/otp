# Stage 5 — API 路由层 (routes/api/*)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 4](./Stage04-服务端数据层与认证网关.md)
**关联规格**: [Design.md](../Design.md) §6、[Architecture.md](../Architecture.md) §9、[StateMachines.md](../StateMachines.md) §3

---

## 目标

实现 9 个 API 端点的 `+server.ts` 处理器：鉴权 + 参数校验 + 调 `server/*` + 返回 Architecture §9.1 schema + 按 StateMachines §3.1 矩阵返回错误码。每个处理器薄而纯，业务在 `server/db` 查询层，路由层只做编排与错误码映射。

## 范围

| 处理器文件 | 方法 | 鉴权 |
| :--- | :--- | :--- |
| `routes/api/auth-params/+server.ts` | GET | 公开 |
| `routes/api/auth/[...path]/+server.ts` | POST/GET/DELETE | 公开（BA 自管） |
| `routes/api/vault/+server.ts` | GET / POST / PUT | BA 会话 |
| `routes/api/vault/rotate-key/+server.ts` | POST | BA 会话 |
| `routes/api/passkey-wraps/+server.ts` | GET / POST | BA 会话 |
| `routes/api/passkey-wraps/[credentialId]/+server.ts` | DELETE | BA 会话 |
| `routes/api/vault/recover/init/+server.ts` | POST | 无会话 + 限流 |
| `routes/api/vault/recover/reset/+server.ts` | POST | 无会话 + 限流 |
| `routes/api/session/[id]/+server.ts` | DELETE | BA 会话 |

## 前置依赖

Stage 4 完成（`server/db` 查询、`server/auth`、`server/anti-enumeration`、`server/rate-limit`、`server/constant-time` 全部可用）。

## 具体任务

- [ ] 5.1 `auth-params/+server.ts`（GET，公开）：存在邮箱→`getAuthParamsByEmail`；不存在→`derivePseudoAuthParams`；返回 200 `AuthParamsResponse`
- [ ] 5.2 `auth/[...path]/+server.ts`：委托 `betterAuth.handler`（POST/GET/DELETE 全方法透传）
- [ ] 5.3 `vault/+server.ts`（GET）：BA 会话鉴权→`getVault`→200 `VaultResponse`；无会话→401
- [ ] 5.4 `vault/+server.ts`（POST）：BA 鉴权 + `VaultCreateRequest`→`initVault`→201 `{version:1}`；已存在→409
- [ ] 5.5 `vault/+server.ts`（PUT）：BA 鉴权 + `{expectedVersion, encryptedBlob}`→`updateVaultBlob` CAS→200 `{version}`；捕 `OccConflictError`→412 `VaultConflictResponse`（**仅** `{serverVersion, encryptedBlob, wrappedDekByMaster}`，不含 `wrappedDekByRecovery`/passkey 行，Architecture §9.1）
- [ ] 5.6 `vault/rotate-key/+server.ts`（POST）：BA 鉴权 + `RotateKeyRequest`→`rotateMasterPassword` 事务→事务后 `revokeOtherSessions`→200；无会话→401
- [ ] 5.7 `passkey-wraps/+server.ts`（GET/POST）：GET→`listPasskeyWraps`→200 `PasskeyWrapRow[]`；POST→`createPasskeyWrap`→201 / credentialId 重复→409
- [ ] 5.8 `passkey-wraps/[credentialId]/+server.ts`（DELETE）：`deletePasskeyWrap` + 吊销 BA 凭证→200；行不存在→404
- [ ] 5.9 `vault/recover/init/+server.ts`（POST，无会话 + 限流）：`checkAndConsume`→存在邮箱返回真实 `RecoverInitResponse` / 不存在返回 `derivePseudoRecoveryMaterial`→200；超限→429 + `Retry-After` 头
- [ ] 5.10 `vault/recover/reset/+server.ts`（POST，无会话 + 限流）：`checkAndConsume`→`safeEqualVerifier(提交 recoveryVerifier, 存储)`（失败→403）→`resetRecovery` 事务 + `revokeAllSessions`→200；403 / 429
- [ ] 5.11 `session/[id]/+server.ts`（DELETE）：BA 鉴权→吊销指定会话→200；不存在→404
- [ ] 5.12 错误码映射统一：捕模块错误→StateMachines §3.1 矩阵对应 HTTP 码 + 响应体（`OccConflictError`→412、`ConflictError`→409、`NotFoundError`→404、`ForbiddenError`→403、限流→429+Retry-After、无会话→401）
- [ ] 5.13 集成测试 `tests/integration/api/`：
  - `auth-params.test.ts`：存在/不存在邮箱响应形状一致；耗时对齐
  - `vault.test.ts`：GET/POST/PUT 成功路径 + 412 冲突响应体字段裁剪 + 409 重复 + 401 无会话
  - `rotate-key.test.ts`：成功 200 + 401；事务后他设备会话吊销
  - `passkey-wraps.test.ts`：GET/POST/DELETE 成功 + 409 重复 + 404 不存在
  - `recover.test.ts`：init 成功 + 429 限流 + 伪材料形状一致；reset 成功 + 403 verifier 失败 + 429；reset 后旧会话全吊销

## 验收标准

- `pnpm test:integration` 通过；9 端点成功路径 100%、StateMachines §3.1 错误码矩阵全覆盖
- 412 响应体严格为 `{serverVersion, encryptedBlob, wrappedDekByMaster}`，无多余字段
- `recover/init` 对不存在邮箱返回形状/耗时一致伪材料 + 限流 429 + `Retry-After`
- `recover/reset` recoveryVerifier 校验失败→403；常量时间比较（无时序侧信道）
- 所有需鉴权端点无会话→401；`auth/*` 登录凭据错 401 不触发吊销（凭据错 vs 会话吊销区分，StateMachines §3.1）
- 处理器薄：业务逻辑在 `server/db`，路由层只编排 + 错误码映射

## 关键参考

- Design §6（API 路由层 + 端点处理器清单 + 三个复杂处理器约定）
- Architecture §9（API 契约表 + §9.1 全部 Schema）
- StateMachines §3.1（HTTP 错误码 → UI 行为映射完整矩阵）、§3.2（拦截器架构，客户端侧）
- Engineering §8.3（事务使用 + CAS 代码示例）

## 风险与注意事项

- **412 响应体裁剪**：`VaultConflictResponse` **不含** `wrappedDekByRecovery`（恒定，仅重置才变）与 passkey 行（独立表，按需 GET `/api/passkey-wraps`）（Architecture §9.1）。路由层须显式只取三字段。
- **recover 端点无会话**：`recover/init` / `recover/reset` 不要求 BA 会话，靠 `recoveryVerifier` + 限流授权；须确保不误用会话中间件。
- **限流维度**：IP + email 双维度指数冷却（Architecture §8.5）；429 必带 `Retry-After` 头（秒）。
- **事务后吊销**：rotate-key 的 `revokeOtherSessions` 与 recover-reset 的 `revokeAllSessions` 须在**事务提交后**调用，不在事务内（Stage 4 已实现，路由层只编排顺序）。
- **`auth/*` 401 区分**：登录凭据错误 401 由登录页处理，不触发全局吊销 handler；其余端点 401 才触发（StateMachines §3.1）。
