# Stage 10 — 安全加固与验收

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 9](./Stage09-端到端集成与关键用户流.md)（全链路 E2E 通过）
**关联规格**: [Architecture.md](../Architecture.md) §8 / §10、[Engineering.md](../Engineering.md) §7.3、[CryptoSpec.md](../CryptoSpec.md) §1.2 / §9、[DevSetup.md](../DevSetup.md) §4

---

## 目标

在全功能实现之上执行集中的安全收尾：逐项对照 Architecture §10 威胁防御矩阵复核防御代码到位、CSP 渗透、侧信道审计、依赖审计、零知识边界复核、覆盖率与规范验收。本阶段不新增功能，只验证与修补安全缺口，确保 ZK 加密系统的军工级防御承诺兑现。

## 范围

| 类别 | 内容 |
| :--- | :--- |
| 威胁模型复核 | Architecture §10 全部威胁向量 |
| 渗透 | CSP 注入、XSS、WebAuthn 仪式 |
| 侧信道审计 | 反枚举时序、常量时间比较、Blob 大小 |
| 依赖审计 | `pnpm audit`、版本一致性 |
| 覆盖率验收 | crypto/otp/集成/E2E 阈值 |
| 规范验收 | typecheck/lint/format/madge |

## 前置依赖

Stage 9 完成（全部 E2E 关键流通过）。

## 具体任务

- [ ] 10.1 **威胁模型复核**：逐项对照 Architecture §10 威胁防御矩阵，验证防御代码到位且有测试/E2E 覆盖：
  - 服务器完全泄露 → 零知识绝对防御（DB 仅 LAK 哈希/wrappedDek 密文/AES-GCM Blob）
  - JS 内存驻留窃取 → `extractable:false` CryptoKey + `secureWipe` 覆写（诚实定界文档化）
  - 恶意插件/XSS → 严格 CSP + 禁 `{@html}`
  - 设备丢失 → IndexedDB 仅密文 + 远程 Revoke 会话
  - 暴力撞库 → Better Auth Rate Limiting
  - 账户枚举 → `auth-params` 伪参数形状/耗时一致
  - 恢复滥用/DoS → recoveryVerifier 校验 + 限流 + 强制轮换 RK
  - 密码轮换后恢复/Passkey 失效 → 信封加密 DEK 恒定
  - 多设备并发写入风暴 → OCC + 三方合并 + 墓碑优先
  - Blob 大小侧信道 → 已知残留（账户数量量级），未来固定块填充（本版不强制，记录为已知风险）
- [ ] 10.2 **CSP 渗透**：生产构建 (`pnpm build` + `preview`) 验证 CSP 响应头（`script-src self + wasm-unsafe-eval`，无 `unsafe-inline`/`unsafe-eval`）；尝试内联脚本/`eval()`/`new Function()` 注入被拦；Wasm 仅静态 `.wasm` 资源加载
- [ ] 10.3 **内存擦除审计**：`lock()` 后确认 `$state` 置空 + 敏感 `Uint8Array` 覆写（DevTools 内存快照或单测覆写断言）；诚实定界文档化（CryptoKey 内部状态/JS 字符串不可擦，Architecture §6.2）
- [ ] 10.4 **反枚举审计**：`auth-params`/`recover-init` 对不存在邮箱响应与真实响应逐字段形状/base64 长度/类型一致；耗时对齐（必要时恒定延迟）；时序不泄露邮箱存在性
- [ ] 10.5 **常量时间比较审计**：`safeEqualVerifier` 无早退；长度不等时恒定返回 false；`recover/reset` 无时序侧信道
- [ ] 10.6 **限流审计**：`recover/init`/`reset` IP+email 双维度指数冷却；429 + `Retry-After` 头；多实例存储抽象到位
- [ ] 10.7 **依赖审计**：`pnpm audit` 零高危漏洞；`hash-wasm`/`better-auth`/`@better-auth/passkey`/`drizzle-orm`/`pg`/`idb` 版本与 DevSetup §3 一致；无架构未提及依赖
- [ ] 10.8 **密钥隔离审计**：5 盐互不复用（kdf/login/recovery/recovery_verifier/prf）；KEK 不接触 Blob；DEK 恒定；IV 不复用（Stage 2 单测已覆盖，复核生产代码路径无显式 IV 传入）
- [ ] 10.9 **覆盖率验收**：`pnpm test:unit --coverage` 达 `crypto/**`/`otp/**` lines ≥95% / branches ≥90%（Testing §1.2）；集成关键路径 100% / 错误路径 ≥80%；E2E 关键流 100%
- [ ] 10.10 **规范验收**：`pnpm check` / `pnpm lint` / `pnpm format:check` 零错误；`madge --circular src/lib/` 无环；Engineering §7.3 PR 检查清单全过（typecheck/lint/test/test:e2e/format:check）
- [ ] 10.11 **零知识边界复核**：逐项对照 Architecture §8.4 服务器可知性边界表——服务器无误持有 MP/RK/PRF_out/DEK/各 KEK；LAK 仅提交瞬间经 TLS；Blob 仅密文；账户级 `updatedAt`/`deletedAt` 仅客户端合并
- [ ] 10.12 **文档同步**：实现与 Architecture/Design/CryptoSpec/Engineering/StateMachines/Testing/UIInventory/DevSetup 任何偏差已反向传播到对应规格或在本阶段记录为已知差异
- [ ] 10.13 **RK 强制轮换验证**：`recover/reset` 后旧 RK 立即失效（再用旧 RK reset→403）；新 RK 配新 `recovery_salt`/`recovery_verifier_salt`/`recoveryVerifier`（Architecture §3.6）
- [ ] 10.14 **OCC 范围复核**：仅 `PUT /api/vault` 自增 version 参与 CAS；rotate-key/passkey-wrap/recover-reset 不动 Blob/version（Architecture §4 OCC 语义）

## 验收标准

- Architecture §10 威胁矩阵每项有对应防御代码且测试/E2E 验证通过
- 生产 CSP 头符合 DevSetup §4.2；内联脚本/`eval`/`new Function` 注入被拦
- `pnpm audit` 零高危
- 覆盖率达标：crypto/otp lines 95 / branches 90；集成关键路径 100；E2E 关键流 100
- `pnpm check` / `lint` / `format:check` / `madge --circular` 全绿
- 零知识边界复核无越界（服务器可知性边界表逐项）
- RK 强制轮换后旧 RK 失效；OCC 范围限定正确
- 已知残留（Blob 大小侧信道）记录在案，不静默

## 关键参考

- Architecture §8（后端控制与会话安全：反枚举/原子轮换/会话校验/可知性边界/恢复授权）、§10（安全防御体系汇总）
- CryptoSpec §1.2（关键不变量）、§9（内存擦除诚实定界）
- Engineering §7.3（PR 检查清单）、§9.2（madge 循环依赖）
- DevSetup §4（CSP 配置）、§3（依赖版本一致性）
- StateMachines §6（错误类层级与 UI 映射）

## 风险与注意事项

- **诚实定界**：内存擦除是 best-effort 纵深防御，非对内存转储的绝对保证（Architecture §6.2）；本阶段须确认诚实定界已文档化，不夸大擦除能力。
- **Blob 大小侧信道**：泄露账户数量量级是 Architecture §8.4 明示的已知残留；本版不强制固定块填充，但须记录为已知风险，不得静默。
- **限流多实例**：默认内存 `Map` 在 serverless 多实例下不可靠；本阶段须确认 `LimitStore` 抽象到位、生产部署文档指引换 DB/Redis。
- **CSP 生产验证**：开发环境与生产构建 CSP 可能差异（Vite dev 注入），须用 `pnpm build` + `preview` 验证生产 CSP 头。
- **依赖版本漂移**：实现过程中可能升级 patch 版本；本阶段复核与 DevSetup §3 版本范围一致，无架构未提及依赖。
- **反向传播偏差**：实现若与规格有合理偏差（如 StateMachines 旧路径 `server/api-client.ts` 已在 Design §10.2 纠正为客户端 `api-client/`），须确认已反向传播到所有相关文档。
