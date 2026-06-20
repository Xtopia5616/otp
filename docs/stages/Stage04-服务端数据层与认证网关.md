# Stage 4 — 服务端数据层与认证网关 (server/)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 1](./Stage01-领域模型与错误基类.md)（models 类型）、[Stage 2](./Stage02-密码学原语.md)（错误类可用）
**关联规格**: [Design.md](../Design.md) §5、[Architecture.md](../Architecture.md) §4 / §8、[Engineering.md](../Engineering.md) §8、[DevSetup.md](../DevSetup.md) §6

---

## 目标

实现服务端全部模块：Drizzle schema + 查询（CAS / 事务 / CRUD）、Better Auth 实例 + passkey 插件 + 会话吊销 API、反枚举伪参数派生、限流、常量时间比较。所有模块入口 `import '$server-only'`，客户端禁止导入。关键写操作（rotate-key / recover/reset）必须在单 Drizzle 事务内原子完成。

## 范围

| 文件 | 职责 |
| :--- | :--- |
| `src/lib/server/db/schema/{user,vault,passkey-wrap}.ts` | 三表定义（camelCase ↔ snake_case） |
| `src/lib/server/db/schema/index.ts` | schema 汇总导出 |
| `src/lib/server/db/index.ts` | drizzle 实例 + 连接（`import '$server-only'`） |
| `src/lib/server/db/migrate.ts` | 迁移脚本 |
| `src/lib/server/db/{vault,user,passkey-wrap,recover,session}.ts` | 查询函数（CAS / 事务 / CRUD） |
| `src/lib/server/auth.ts` | Better Auth 实例 + passkey 插件 + 会话吊销 |
| `src/lib/server/anti-enumeration.ts` | 反枚举伪参数派生 |
| `src/lib/server/rate-limit.ts` | IP+email 指数冷却限流 |
| `src/lib/server/constant-time.ts` | recoveryVerifier 常量时间比较 |

## 前置依赖

Stage 1（`models/` API 类型 + `OccConflictError`/`ConflictError`/`NotFoundError`）、Stage 2（`crypto/errors.ts` 错误类）。PostgreSQL 已就绪（Stage 0）。

## 具体任务

- [ ] 4.1 `db/schema/{user,vault,passkey-wrap}.ts`：三表定义，camelCase 字段 ↔ snake_case 列，严格对齐 Architecture §4：
  - `user`：id/email + KDF 参数（kdfAlgo/kdfMemoryKiB/kdfIterations/kdfParallelism）+ 5 盐（loginSalt/kdfSalt/recoverySalt/recoveryVerifierSalt + recoveryVerifier）+ prfSalt 可空
  - `vault`：userId PK（外键 user.id onDelete cascade）+ wrappedDekByMaster/wrappedDekByRecovery + encryptedBlob + version bigint default 1 + updatedAt
  - `passkeyWrap`：id/userId + credentialId unique + wrappedDekByPrf + createdAt
- [ ] 4.2 `db/schema/index.ts` 汇总导出；`db/index.ts`（`import '$server-only'`，`drizzle(client, { schema })`）
- [ ] 4.3 `db/migrate.ts` + `pnpm drizzle-kit generate --name init_schema` → `drizzle/0000_init_schema.sql`；`pnpm drizzle-kit push` 验证 `\dt` 显示 user/vault/passkey_wrap/session
- [ ] 4.4 `db/vault.ts`：
  - `initVault(userId, req: VaultCreateRequest) → Promise<{version:1}>`
  - `getVault(userId) → Promise<VaultResponse>`
  - `updateVaultBlob(userId, expectedVersion, encryptedBlob) → Promise<number>`（**CAS**：`UPDATE SET version=version+1 WHERE version=expectedVersion`；0 行→查当前行抛 `OccConflictError` 携 `serverVersion`/`serverEncryptedBlob`/`serverWrappedDekByMaster`，Engineering §8.3 代码为准）
  - `rotateWrappedDekByMaster(userId, newWrapped) → Promise<void>`
- [ ] 4.5 `db/vault.ts` `rotateMasterPassword` 事务：单 `db.transaction` 内更新 `loginSalt`/`kdfSalt` + `wrappedDekByMaster` + BA 密码哈希（经 `auth.updatePasswordHash`）；**事务提交后**调 `auth.revokeOtherSessions`（非事务内）；Blob/version/wrappedDekByRecovery/passkey 行不动（Architecture §8.2）
- [ ] 4.6 `db/user.ts`：`getAuthParamsByEmail(userId) → AuthParamsResponse`、`updateUserSaltsAndKdf`、`updateRecoveryMaterial`
- [ ] 4.7 `db/passkey-wrap.ts`：`listPasskeyWraps(userId)`、`createPasskeyWrap(userId, req)`（credentialId 唯一冲突→`ConflictError`）、`deletePasskeyWrap(userId, credentialId)`（行不存在→`NotFoundError`）
- [ ] 4.8 `db/recover.ts`：
  - `getRecoverMaterial(email) → RecoverInitResponse`
  - `resetRecovery` 事务：单 `db.transaction` 内更新 BA 密码哈希 + `loginSalt`/`kdfSalt` + `wrappedDekByMaster`/`wrappedDekByRecovery` + `recoverySalt`/`recoveryVerifierSalt`/`recoveryVerifier`；**事务提交后**调 `auth.revokeAllSessions`（Architecture §8.5）
- [ ] 4.9 `db/session.ts`：委托 `auth` 的会话吊销
- [ ] 4.10 `auth.ts`（Design §5.2）：Better Auth 实例 + Drizzle adapter + `@better-auth/passkey` 插件 + user 表扩展字段映射；`revokeOtherSessions(userId, exceptSessionId)` / `revokeAllSessions(userId)` / `updatePasswordHash(userId, newLak)` / `passkeyPluginConfig`（PRF 扩展注入点）
- [ ] 4.11 `anti-enumeration.ts`：`derivePseudoAuthParams(email) → AuthParamsResponse`、`derivePseudoRecoveryMaterial(email) → RecoverInitResponse`（`HMAC(email, SERVER_SECRET)` 确定性派生，字段/base64 长度/类型与真实响应完全一致，Architecture §8.1）
- [ ] 4.12 `rate-limit.ts`：`checkAndConsume({ ip, email, action }) → Promise<{ allowed, retryAfter }>` + `LimitStore` 接口（默认内存 `Map`+TTL，注释标注 serverless 多实例应换 DB/Redis）（Architecture §8.5）
- [ ] 4.13 `constant-time.ts`：`safeEqualVerifier(submitted, stored) → boolean`（`node:crypto.timingSafeEqual`，先比长度再比缓冲，长度不等恒定返回 false）
- [ ] 4.14 集成测试 setup `tests/integration/setup.ts`（testcontainers/postgresql 或 pg-mem，Testing §1.2）
- [ ] 4.15 集成测试 `tests/integration/db/`：
  - `vault-cas.test.ts`：expectedVersion 匹配→version+1；不匹配→`OccConflictError` 携正确三字段；version 单调
  - `rotate-key.test.ts`：事务原子性（注入中途失败验证回滚）；事务后 revokeOtherSessions 被调；Blob/wrappedDekByRecovery 不变
  - `passkey-wrap.test.ts`：credentialId 重复→`ConflictError`；删除不存在→`NotFoundError`；多设备多行共存
  - `recover.test.ts`：reset 事务原子性；事务后 revokeAllSessions 被调；DEK/Blob 不变
  - `anti-enum.test.ts`：伪参数与真实参数逐字段形状/base64 长度一致

## 验收标准

- `pnpm drizzle-kit push` 成功，`\dt` 显示 user/vault/passkey_wrap/session
- `pnpm test:integration` 通过；关键路径 100%、错误路径 ≥ 80%
- CAS 冲突正确抛 `OccConflictError` 且携带 `serverVersion`/`serverEncryptedBlob`/`serverWrappedDekByMaster`
- rotate-key / recover-reset 事务原子（注入失败验证回滚）；事务后吊销会话被调用
- anti-enum 伪响应与真实响应形状逐字段一致（字段名、base64 长度、类型）
- `server/` 全部入口 `import '$server-only'`；客户端 import 会抛运行时错误
- `server/auth` 仅依赖 `schema`，**不 import `db` 查询文件**（防环，Design §2.3）；`db` 查询可调 `auth` 会话 API

## 关键参考

- Design §5（server/ 全部模块契约）、§2.2/§2.3（服务端依赖图与方向规则）
- Architecture §4（数据模型 schema）、§8.1（反枚举）、§8.2（原子轮换）、§8.5（恢复授权 + 限流）
- Engineering §5.2（server-only 约定）、§8（Drizzle schema 组织 / 迁移命名 / 事务使用 + CAS 代码示例）
- DevSetup §6（drizzle.config / 初始化工作流）

## 风险与注意事项

- **OCC 范围限定**：仅 `PUT /api/vault`（Blob 更新）自增 version 并参与 CAS；rotate-key / passkey-wrap / recover-reset 不动 Blob、不增 version、不要求 expectedVersion（Architecture §4 OCC 语义）。本阶段查询函数须如实反映，勿在 rotate/recover 中误碰 version。
- **事务边界**：BA 密码哈希更新（`updatePasswordHash`）须在事务内；会话吊销（`revokeOtherSessions`/`revokeAllSessions`）须在**事务提交后**（非事务内，因 BA API 可能非同一 DB 连接，Engineering §8.3）。
- **防环**：`server/auth` 依赖 `schema` 与 `db/index`（连接实例配置 adapter），但**不 import 查询文件**；查询文件可调 `auth` 会话 API（Design §2.3）。
- **限流存储**：默认内存 `Map` 在 serverless 多实例下不可靠，须以 `LimitStore` 接口注入抽象，注释指引生产换 DB/Redis（Design §5.4）。
- **常量时间比较**：`safeEqualVerifier` 不得在长度不等时早退暴露信息；先比较长度再 `timingSafeEqual`。
