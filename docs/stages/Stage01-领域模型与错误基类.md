# Stage 1 — 领域模型与错误基类 (models/)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 0](./Stage00-项目脚手架与开发环境.md)
**关联规格**: [Design.md](../Design.md) §3.1、[Architecture.md](../Architecture.md) §4 / §5.1 / §9.1、[Engineering.md](../Engineering.md) §6.1

---

## 目标

定义全栈共享的领域类型、API 请求/响应契约、UI Props 类型与错误类基类。本模块为**纯类型 + 错误类**层，零运行时业务代码、零依赖，是所有上游模块（crypto/otp/state/server）的契约源头。错误类物理位置约定见 Engineering §6.1。

## 范围

| 文件 | 内容 |
| :--- | :--- |
| `src/lib/models/account.ts` | `Account`、`AccountDraft`、`OtpauthParsed` |
| `src/lib/models/vault.ts` | Vault 相关 API 类型 |
| `src/lib/models/api.ts` | 其余 API 请求/响应类型 + `KdfParams` |
| `src/lib/models/ui.ts` | UIInventory 附录 A 全部组件 Props 类型 |
| `src/lib/models/errors.ts` | `WebOtpError` 基类 + 非 crypto 子类 |

## 前置依赖

Stage 0 完成（tsconfig `verbatimModuleSyntax` 已生效，目录骨架已建）。

## 具体任务

- [ ] 1.1 `account.ts`：定义 `Account` 接口，逐字段对齐 Architecture §5.1（`id`/`type:'totp'|'hotp'`/`issuer`/`label`/`secret`/`algorithm:'SHA1'|'SHA256'|'SHA512'`/`digits:6|8`/`period`/`counter:string\|null`/`icon`/`createdAt`/`updatedAt`/`deletedAt:number\|null`）；定义 `AccountDraft`（otpauth 解析产物，待调用方补 `id`/`createdAt`/`updatedAt`）、`OtpauthParsed`
- [ ] 1.2 `vault.ts`：`VaultResponse` / `VaultPutRequest` / `VaultPutResponse` / `VaultConflictResponse`（412，仅 `{serverVersion, encryptedBlob, wrappedDekByMaster}`）/ `VaultCreateRequest` / `VaultCreateResponse`（Architecture §9.1 字段为准）
- [ ] 1.3 `api.ts`：`AuthParamsResponse` / `RotateKeyRequest` / `PasskeyWrapCreateRequest` / `PasskeyWrapRow` / `RecoverInitRequest` / `RecoverInitResponse` / `RecoverResetRequest` / `KdfParams`（Architecture §9.1 + CryptoSpec §2.3）
- [ ] 1.4 `ui.ts`：UIInventory 附录 A 列出的全部组件 Props 类型（`SensitiveInput`/`OtpCodeDisplay`/`AccountItem`/`AddAccountDialog`/`RecoveryKeyDisplay` 等）
- [ ] 1.5 `errors.ts`：按 Engineering §6.1 签名**逐字**实现：
  - `WebOtpError`（abstract，`abstract readonly code: string`，构造设 `this.name = this.constructor.name`）
  - `CryptoError`（`code='CRYPTO_ERROR'`，`operation: 'encrypt'|'decrypt'|'kdf'|'wrap'|'unwrap'|'decode'`）
  - `OccConflictError`（`code='OCC_CONFLICT'`，携带 `serverVersion`/`serverEncryptedBlob`/`serverWrappedDekByMaster`）
  - `NetworkError`（`code='NETWORK_ERROR'`，`cause?`/`statusCode?`）
  - `SessionRevokedError`（`code='SESSION_REVOKED'`，默认消息）
  - `ApiError`（`code='API_ERROR'`，`response`/`status`）及其子类 `RateLimitError`(`retryAfter`)/`ForbiddenError`/`NotFoundError`/`ConflictError`/`ServerError`
- [ ] 1.6 验证 `models/` 零运行时依赖：所有跨文件 import 均为 `import type`；`models/` 不 import 任何其他 `src/lib/*` 模块
- [ ] 1.7 错误类单测 `tests/unit/models/errors.test.ts`：各子类可实例化、`code` 字段正确、`instanceof WebOtpError` 成立、`OccConflictError` 三字段可读、`SessionRevokedError` 默认消息、`ApiError` 子类携带 `response`/`status`

## 验收标准

- `pnpm check` 通过；`models/` 在 `verbatimModuleSyntax` 下全部 type-only import 显式标注
- `models/` 不 import 任何其他 `src/lib` 模块（`madge` 与 grep 双重验证）
- 各错误类构造签名与 Engineering §6.1 完全一致（`code` 常量、`operation` 枚举、携带字段）
- `pnpm test:unit` 通过；errors 单测覆盖全部子类
- `Account` 字段集与 Architecture §5.1 一一对应（含 `counter: string | null` 的 bigint 安全约定）

## 关键参考

- Design §3.1（models/ 模块契约）
- Architecture §4（数据模型）、§5.1（Account 结构）、§9.1（API Schema）
- Engineering §6.1（错误类权威签名 + 物理位置约定）、§3.3（接口/类型别名约定）
- UIInventory 附录 A（Props 清单）

## 风险与注意事项

- **错误类物理位置**：`CryptoError` 子类（`DecryptionError`/`KdfError`/`EncodingError`/`FormatError`）归 `crypto/errors.ts`（Stage 2），**不在本阶段**；本阶段只产 `models/errors.ts` 的基类与非 crypto 子类。`crypto/errors.ts` 将 `import { CryptoError } from '$lib/models/errors'`，形成 `crypto/ → models/` 单向边（Design §2.3 / §10.2）。
- **`VaultConflictResponse` 字段裁剪**：412 响应体**不含** `wrappedDekByRecovery` 与 passkey 行（Architecture §9.1 注），本阶段类型定义须如实反映，避免后续 Stage 5 多返回字段。
- **`counter` 用 string**：HOTP 计数器以字符串承载 bigint，避免 JSON `number` 精度丢失（Architecture §5.1）。
- **零运行时**：`models/` 不得含任何函数实现（错误类构造除外），不得 import `crypto/`/`state/`/`server/`。
