# WebOTP 开发进度总览 (Progress)

**文档版本**: 1.0
**更新日期**: 2026-06-21
**阶段策略**: 分层完整推进（自底向上，按 [Design.md](./Design.md) §2 模块依赖图）+ Stage 0 脚手架 + 末尾单列安全加固验收阶段
**阶段文件**: `./docs/stages/StageXX-*.md`

---

## 反向传播记录（2026-06-26）

此前各阶段注记中标注「待 Stage 10 反向传播」的实现偏差，已应要求提前于本轮完成反向传播（Stage 10.12 文档同步的主体工作提前完成）。**源代码为权威，文档已校正为与实现一致**：

| 偏差 | 反向传播目标 | 校正内容 |
| :--- | :--- | :--- |
| `ApiError`/`CryptoError.code` 字面量推断致 TS2416 | Engineering §6.1 | 基类 `readonly code: string = '...'` 显式标注 + TS2416 说明块 |
| DEK `extractable:true`（`wrapKey` 内部 `exportKey`，不可导出密钥抛 `InvalidAccessError`） | CryptoSpec §3.3/§3.4 | `generateDEK`/`unwrapDek` extractable:true + 对比表/结论校正 + 实现校正说明 |
| `parseBlob` 解析层从严 `version !== 1` | CryptoSpec §4.3 | `version < 1` → `version !== 1` + 从严说明 |
| base32 空串抛 `EncodingError`（非返回空数组） | CryptoSpec §7.3/§7.4 | 空串抛错 + 失败处理说明校正 |
| `generateHOTP`/`generateTOTP` `secret: Uint8Array`（非 base32 字符串） | CryptoSpec §10.4 | secret 类型 Uint8Array + base32 解码上移调用方 + 不 `secureWipe` 输入 |
| Testing §4 样例早期草案 API 名/签名/模块路径 | Testing §4 | §4 头部加偏差说明 + 草案→实际 API 映射表（实际测试文件为权威） |
| `getAuthParamsByEmail(email) → Promise<AuthParamsResponse \| null>` | Design §5.1 / Stage04 4.6 / 4.8 | 入参 email、返回 null 契约校正；`resetRecovery(userId, req)` 校正 |
| BA 会话吊销经 Drizzle 直删 `session` 行（非 BA 端点，后者 `requireHeaders`）+ `hashPassword`+tx 直写密码哈希 + rotate/reset 内部吊销 | Design §5.2/§6.2、Architecture §8.2、Engineering §8.3、Stage04 4.5 | revoke* 机制说明 + 端点依赖/处理器契约校正 + rotate 事务示例校正 |
| `anti-enumeration.ts` 死代码（`void _tse` 未用导入）+ 重复 JSDoc 块 | 源码修复（非文档） | 删除未用 `timingSafeEqual` 导入与 `void _tse`；合并重复 `/**` 块 |

**残留关闭**：`drizzle-kit push` 连通 PG 验证——已对远程 PG 的 throwaway schema 执行 `drizzle-kit push`（成功，"No changes detected" = schema 同步），public schema 含 `user`/`vault`/`passkey_wrap`/`session` 等 7 表；Stage 4 验收的 push 项已满足。

> 注：各阶段行内仍保留「待 Stage 10 反向传播」字样为**历史上下文**（记录偏差发现时刻），其状态以上表「已完成」为准。

---

## 阶段总览

WebOTP 按 Design.md 模块依赖图自底向上划分为 11 个阶段（Stage 0–10）。每个阶段对应一个或多个完整模块（含其全部测试），阶段间依赖单向、无环；集成风险由 Stage 9 E2E 统一兜底，安全收尾由 Stage 10 集中验收。依赖链：

```mermaid
graph LR
    S0["Stage 0<br/>脚手架"] --> S1["Stage 1<br/>models"]
    S1 --> S2["Stage 2<br/>crypto"]
    S2 --> S3["Stage 3<br/>otp"]
    S1 --> S4["Stage 4<br/>server"]
    S2 --> S4
    S4 --> S5["Stage 5<br/>API 路由"]
    S1 --> S6["Stage 6<br/>api-client<br/>+webauthn+utils"]
    S2 --> S7["Stage 7<br/>state"]
    S6 --> S7
    S3 --> S8["Stage 8<br/>UI+i18n"]
    S6 --> S8
    S7 --> S8
    S5 --> S9["Stage 9<br/>E2E"]
    S8 --> S9
    S9 --> S10["Stage 10<br/>安全加固"]
```

---

## 各阶段完成情况

### Stage 0 — 项目脚手架与开发环境

从零搭建 SvelteKit 工程基座：依赖、tsconfig/Prettier/ESLint/CSP/Drizzle/vitest/playwright 配置、目录骨架、CI 工作流。本阶段不写业务逻辑，确保 `pnpm dev` 可启动、`check/lint/test` 已接通、PostgreSQL 可连接。

- [x] 0.1 `pnpm create svelte@latest` → 实际用 `sv create`（Svelte CLI 替代 create-svelte），SvelteKit minimal + TS strict ✓
- [x] 0.2 安装运行时依赖（DevSetup §2.2 / §3.1）✓ — 注：`@paraglide-js/paraglide-sveltekit` 为文档笔误（404），改用 `@inlang/paraglide-js@2.20.0`（v2 无需独立 sveltekit adapter）
- [x] 0.3 安装开发依赖 + `playwright install chromium`（DevSetup §2.3 / §3.2）✓
- [x] 0.4 `shadcn-svelte init`（New York / Zinc / CSS variables）✓ — 注：CLI 在非 TTY 环境无法交互选择 preset，改用[手动安装](https://shadcn-svelte.com/docs/installation/manual)：`components.json` + `src/lib/utils.ts`（`cn`）+ `src/app.css`（zinc 主题 CSS 变量）+ `clsx`/`tailwind-merge`/`tailwind-variants`/`tw-animate-css`/`@lucide/svelte`
- [x] 0.5 配置 `tsconfig.json`（Engineering §1.2：strict + noUncheckedIndexedAccess + verbatimModuleSyntax）✓ — 注：路径别名由 SvelteKit `kit.alias` 提供（svelte.config.js），不在 tsconfig 声明 `paths`（避免与生成的 tsconfig 冲突）
- [x] 0.6 配置 `.prettierrc` + `eslint.config.js` flat config（Engineering §2.1 / §2.2）✓ — 注：`recommendedTypeChecked` 需 `projectService` + `ts.config()` wrapper；type-checked 规则限定 `**/*.ts`，`.svelte`/`.js`/`.d.ts`/`*.config.ts` 用 `disableTypeChecked`
- [x] 0.7 配置 `svelte.config.js`：adapter-node + CSP（DevSetup §4.2）✓ — 注：`vite.config.ts` 中 `sveltekit()` 不传参以确保 `svelte.config.js` 生效；runes 编译选项移至 `compilerOptions`
- [x] 0.8 创建 `.env` / `.env.example`（DevSetup §5.1）✓ — `DATABASE_URL` 用 `127.0.0.1` 避免 IPv6 `ECONNREFUSED`
- [x] 0.9 配置 `drizzle.config.ts` ✓ — `createdb`/DB 连通性验证延后（环境无 PostgreSQL，开发者自备后运行 `pnpm db:push`）
- [x] 0.10 配置 `vitest.config.ts`（Testing §1.2）✓ — 注：Vitest 4 移除 `workspace`，改用 `projects` API；加 `passWithNoTests: true` 满足"无测试时退出 0"
- [x] 0.11 配置 `playwright.config.ts`（Testing §1.3）✓
- [x] 0.12 创建目录骨架（Design 附录 A / DevSetup §8）✓
- [x] 0.13 配置 `package.json` scripts（DevSetup §9）✓ — 含 `typecheck`/`madge`/`db:*` 等
- [x] 0.14 CI 工作流 `.github/workflows/ci.yml`（含 `madge --circular`）✓ — 含 PostgreSQL 16 service container
- [x] 0.15 安装 `madge` devDependency ✓
- [x] 0.16 空应用冒烟：`pnpm dev` 启动（HTTP 200）+ `check/lint/format:check` 零错误 ✓

**验收**: `pnpm dev` 返回 200 ✓；`check/lint/format:check` 零错误 ✓；`test` 退出 0 ✓；`madge --circular` 无环 ✓；`drizzle-kit push` 连通 PG — **延后**（环境无 PostgreSQL，开发者自备后运行 `pnpm db:push`）。详见 [Stage00](./stages/Stage00-项目脚手架与开发环境.md)

---

### Stage 1 — 领域模型与错误基类 (models/)

纯类型 + 错误类层，零运行时业务代码、零依赖。定义 Account、API 请求/响应契约、UI Props、`WebOtpError` 基类与非 crypto 子类。

- [x] 1.1 `account.ts`：`Account`/`AccountDraft`/`OtpauthParsed`（Architecture §5.1）✓ — `AccountDraft`/`OtpauthParsed` 均为 `Omit<Account,'id'|'createdAt'|'updatedAt'|'deletedAt'>`（生命周期字段由调用方补齐；新建 `deletedAt` 恒 null 故不纳入草稿；`OtpauthParsed` 为 `AccountDraft` 别名，形状一致）
- [x] 1.2 `vault.ts`：Vault API 类型（§9.1，412 响应体裁剪）✓ — `VaultConflictResponse` 仅 `{serverVersion, encryptedBlob, wrappedDekByMaster}` 三字段
- [x] 1.3 `api.ts`：`AuthParamsResponse`/`RotateKeyRequest`/`PasskeyWrap*`/`Recover*`/`KdfParams` ✓ — `KdfParams`（CryptoSpec §2.3 短名 `algo/memoryKiB/...`）与 `AuthParamsResponse`/`RecoverInitResponse`（§9.1 `kdf` 前缀名 `kdfAlgo/kdfMemoryKiB/...`）按各自文档分别定义，未合并
- [x] 1.4 `ui.ts`：UIInventory 附录 A 全部 Props ✓ — 8 个 Props interface，跨文件仅 `import type { Account } from './account'`
- [x] 1.5 `errors.ts`：`WebOtpError`/`CryptoError`/`OccConflictError`/`NetworkError`/`SessionRevokedError`/`ApiError`+子类（Engineering §6.1 签名逐字）✓ — 注：§6.1 原文 `ApiError` 的 `readonly code = 'API_ERROR'` 推断为字面量类型，致子类以各自字面量覆写时 TS2416；已加 `: string` 显式标注（运行时值不变），属文档偏差，待 Stage 10 反向传播至 Engineering §6.1
- [x] 1.6 验证 `models/` 零运行时依赖（全 type-only import）✓ — grep 确认 `models/` 仅 `ui.ts` 一处 `import type './account'`，无 `$lib`/跨模块 import；另修复 Stage 0 遗留：`madge` 脚本缺 `--extensions ts` 致扫描 0 文件，已补（CI `pnpm madge` 现实际校验 TS，19 文件无环）
- [x] 1.7 错误类单测 `tests/unit/models/errors.test.ts` ✓ — 15 用例覆盖全子类（code/operation/三字段/默认消息/response+status/instanceof）；另修复 Stage 0 遗留：Vitest 4 `projects` 不继承根级 Vite plugins，`$lib` 别名在 unit 项目无法解析，已将 `sveltekit()` 移入各 project 声明

**验收**: `pnpm check` 通过（0 错误 0 警告）✓；`models/` 不 import 其他 `src/lib`（madge + grep 双重验证）✓；错误类签名与 Engineering §6.1 一致（`ApiError.code` 加 `: string` 标注方可编译，详见 1.5 注）✓；`pnpm test:unit` 15/15 通过 ✓；`Account` 字段集与 Architecture §5.1 一一对应（含 `counter: string | null`）✓。详见 [Stage01](./stages/Stage01-领域模型与错误基类.md)

---

### Stage 2 — 密码学原语 (crypto/)

信封加密全部密码学原语：Argon2id、AES-GCM-256、HKDF-SHA256、base32/base64、Blob 封装、RK 生成、内存擦除。纯函数、无状态、100% 单测。AEAD 失败绝不静默降级。

- [x] 2.1 `errors.ts`：`DecryptionError`/`KdfError`/`EncodingError`/`FormatError`（extends CryptoError）✓ — 注：`CryptoError.code` 同 Stage 1 `ApiError` 的 TS2416 问题（基类 `readonly code = 'CRYPTO_ERROR'` 推断字面量致子类覆写报错），已在 `models/errors.ts` 加 `: string` 显式标注（运行时值不变），属 Engineering §6.1 偏差，待 Stage 10 反向传播
- [x] 2.2 `encoding.ts`：base32/base64 + `serializeBlob`/`parseBlob`（v=1;iv=;ct= 封装）✓ — 注：`parseBlob` 按 Stage02 2.2 在解析层即拒绝 `v≠1`（CryptoSpec §4.3 原 `parseEncryptedPayload` 接受 v≥1 再由调用方校验，此处从严）；空串抛 `EncodingError`（CryptoSpec §7.3 原返回空数组，Stage02 2.2 覆盖为抛错）
- [x] 2.3 `argon2.ts`：`deriveKEK`/`deriveLAK`/`deriveRecoveryVerifier`（hash-wasm）✓ — 注：参数校验仅 salt=16、各参数≥1（结构合法性）；CryptoSpec §2.5 的生产阈值 `memoryKiB≥8192` 不在原语层强制（否则测试降速参数 m=4096 被拒），生产阈值由注册层（Stage 4）策略强制
- [x] 2.4 `aes-gcm.ts`：`generateIV`/`encryptAesGcm`/`decryptAesGcm` + `encryptAesGcmRandomIv` ✓ — `encryptAesGcmRandomIv` 返回 `{iv, ciphertext}` 供调用方序列化
- [x] 2.5 `envelope.ts`：`importKEK`/`generateDEK`/`wrapDek`/`unwrapDek`/`encryptBlob`/`decryptBlob` ✓ — ⚠️ 关键偏差（CryptoSpec §3.3/§3.4）：实测 `wrapKey('raw', dek, kek)` 无法包装 `extractable:false` 密钥（SubtleCrypto 内部调用 exportKey，抛 InvalidAccessError），而『DEK 恒定 + 可被新 KEK 重新包装』（rotate-key/PRF 绑定）依赖 wrapKey。经确认：DEK `extractable:true`（`generateDEK` 与 `unwrapDek` 均如此），raw 字节不暴露给 JS（wrapKey 原子完成导出+加密，代码从不显式 exportKey）；KEK 仍 `extractable:false`。待 Stage 10 反向传播至 CryptoSpec §3.3/§3.4
- [x] 2.6 `hkdf.ts`：`deriveKEKPrf`（info=`WebOTP/KEK-PRF/v1`）✓ — info 硬编码常量，调用方不可控；HKDF 合法输入永不失败，故不包 try/catch（编程错误以原生 DOMException 传播，与 `importKEK` 一致）
- [x] 2.7 `recovery-key.ts`：`generateRecoveryKey`/`parseRecoveryKey`（96 位/20 字符 4-4-4-4-4）✓ — `generateRecoveryKey()→string`（展示串），调用方经 `parseRecoveryKey` 取 12 字节用于派生。注：原 `fullB32.match(/.{4}/g) ?? []` 的 `?? []` 空数组分支在数学上不可达（`base32Encode(12 字节)` 恒返回 20 字符，`match` 恒返回 5 元素数组），后续度量退化至 50% 分支覆盖；已改用确定性 `slice(i,i+4)` 循环分组，消除不可达分支，恢复 100% 分支覆盖（Stage 3 收尾时处理）
- [x] 2.8 `secure-wipe.ts`：`secureWipe` ✓ — 随机覆写 + `fill(0)`（CryptoSpec §9.1）
- [x] 2.9 测试 fixtures（Testing §2.1/§2.2/§2.3）✓ — 注：`ARGON2ID_TEST_PARAMS` 采用 `KdfParams` 形状（algo/memoryKiB/iterations/parallelism），非 Testing §2.2 原混用 hash-wasm 字段名+嵌入 salt/hashLength，以直接匹配 `deriveKEK` 参数类型
- [x] 2.10 单测 `tests/unit/crypto/`：argon2id/aes-gcm/hkdf/base32/lak/blob-format ✓ — 注：Testing §4 样例代码的 API 名/签名（`deriveArgon2id`/`wrapDek({dek,kek,iv})`/`deriveKekPrf({prfOutput,salt,info})`/`decodeBase32`/`lak.ts`/`blob-format.ts` 等）为早期草案，与 Stage02 规格 + CryptoSpec 不一致；以 Stage02（权威任务定义）+ CryptoSpec（权威密码学规格）的文件布局与签名为准，Testing §4 的测试*场景*（往返/篡改/IV 不复用/容错/拒绝）已适配到权威 API。另增 `crypto-errors.test.ts`/`envelope.test.ts` 以达覆盖率。另：Testing §4.3 样例 `validBlob` 的 `iv=AAAAAAAAAAAAAAAAAAAAAA==` 实为 16 字节（非 12），已修正为 12 字节 IV
- [x] 2.11 补充 `recovery-key.test.ts` ✓
- [x] 2.12 补充 `secure-wipe.test.ts` ✓

**验收**: `pnpm test:unit` 通过（122/122）✓；`crypto/**` 覆盖率 lines 100% / branches 100%（≥95%/90%）✓；AES-GCM 篡改（密文/IV/tag）均抛 `DecryptionError`、两次包装同 DEK 密文不同（IV 不复用）✓；base32 容错（大小写/空格/连字符/填充）全通过、非法字符与空串抛 `EncodingError` ✓；Blob parse/serialize 往返一致、全部拒绝用例抛 `FormatError` ✓；HKDF `info='WebOTP/KEK-PRF/v1'` 常量校验 + 确定性 + 不同 PRF/info 产生不同 KEK ✓；RK generate→parse 往返 12 字节、20 字符 4-4-4-4-4 ✓；`crypto/` 不 import `state/`/`server/`（madge + grep 双重验证，仅 `crypto/→models/` 单向边）✓；`pnpm check` 0 错误 0 警告 ✓；`pnpm lint` 0 错误（19 个 `no-non-null-assertion` 警告，均是有界循环索引 `!`，符合 CryptoSpec 代码风格与 eslint 'warn' 配置）✓；`pnpm format:check` 通过 ✓；`pnpm madge --circular` 无环（27 文件）✓。另修复 Stage 0 遗留：`coverage/` 生成目录未加入 `.gitignore`/`.prettierignore`（vitest 覆盖率产物），已补。TS 6.0 `Uint8Array<ArrayBufferLike>` 与 SubtleCrypto `BufferSource` 不兼容，已在 subtle crypto 调用点加 `as BufferSource`/`as Uint8Array<ArrayBuffer>` 类型转换（仅类型层，无运行时影响）。详见 [Stage02](./stages/Stage02-密码学原语.md)

---

### Stage 3 — OTP 计算引擎 (otp/)

TOTP/HOTP 计算 + otpauth URI 解析。纯函数，依赖 `crypto/encoding`。内部抛错语义（CryptoSpec §10），`Result` 为调用侧可选。

- [x] 3.1 `hotp.ts`：`generateHOTP`（RFC 4226 动态截断，bigint counter）✓ — ⚠️ 与 CryptoSpec §10.4 参考伪码的偏差（权威：Stage03 任务定义 + Testing §3 测试向量）：`secret` 类型为 `Uint8Array`（原始字节）而非 base32 字符串，故 `generateHOTP` 不内部 `base32Decode`、不 `secureWipe` 输入（输入由调用方持有，`verifyTOTP` 窗口循环复用同一数组）；base32 解码职责上移至调用方（state 层 `base32Decode(Account.secret)`）与 otpauth-uri 解析层。算法实现（HMAC→动态截断→模 10^digits→零填充、counter 8 字节大端）与 CryptoSpec §10.3/§10.4 一致
- [x] 3.2 `totp.ts`：`generateTOTP`/`verifyTOTP`（RFC 6238，window=±1）✓ — `T=floor(time/period)` 委托 `generateHOTP`；`verifyTOTP` 默认 window=1 比对 `[T-1,T+1]`；`period`/`time`/`window` 缺省分别取 30/`Date.now()/1000`/1（CryptoSpec §10.4/§10.5 默认值）
- [x] 3.3 `otpauth-uri.ts`：`parseOtpauthUri`/`buildOtpauthUri` ✓ — 基于 WHATWG `URL` 解析（otpauth 为非 special scheme，host 段承载 totp/hotp 类型）；`parseOtpauthUri` 经 `base32Decode`+`base32Encode` 校验并规范化 secret 为大写无填充（Architecture §5.1 存储约定），label 路径在解码前按字面 `:` 拆分以避免误拆编码的 `%3A`，issuer query 优先回退 label 前缀；`buildOtpauthUri` 按 RFC 6238 otpauth 格式构建，issuer/label 内 `:` 经 `encodeURIComponent` 编为 `%3A` 保证往返一致
- [x] 3.4 HMAC 经 SubtleCrypto（SHA1/256/512），base32 复用 crypto/encoding ✓ — `Account.algorithm`→`SHA-1`/`SHA-256`/`SHA-512` 映射；base32 解码复用 `crypto/encoding.ts`（在 `parseOtpauthUri` 内），解码失败抛 `EncodingError`
- [x] 3.5 单测 `tests/unit/otp/`：totp（RFC 6238 全 18 向量）/hotp（RFC 4226 counter 0-9）/otpauth-uri ✓ — 注：Testing §3 样例代码缺 `await`（`generateTOTP` 返回 `Promise<string>`，早期草案笔误），已修正为 async 断言；另补 `verifyTOTP` 窗口用例（当前/前/后周期通过、window=1 之外失败、window=0/2 边界）与 otpauth 全错误路径用例以达覆盖率。**审计修复**：① `buildOtpauthUri` HOTP 分支原仅输出 counter 丢 period，致 `period=60` 的 HOTP 往返不一致（reparse 回退默认 30）——改为始终输出 period（B1）；② `parseOtpauthUri` 原 `issuer ?? pathIssuer`，空串 `?issuer=` 被保留为 `""` 而非回退 label 前缀——改为空串视为缺失回退（B2）；③ `buildOtpauthUri` 参数类型 `AccountDraft` → `Account | AccountDraft`（导出场景调用方持完整 Account，F1）；④ `verifyTOTP` `===` 非常量时间比较加注释说明有意为之（常量时间仅服务端 recoveryVerifier，F2）

**验收**: `pnpm test:unit` 通过（210/210，含既有 crypto/models 无回归）✓；`otp/**` 覆盖率 lines 100% / branches 100%（≥95%/90%）✓；RFC 6238 全 18 向量（SHA1/SHA256/SHA512 × 6 时间点）精确匹配 ✓；RFC 4226 counter 0–9 精确匹配 ✓；otpauth 全字段提取 + `parse→build→parse` 往返一致（含 HOTP+非默认 period、空 issuer 回退）+ 非法协议/缺 secret/非 base32/非法 algorithm/digits/period/counter/百分号编码全抛 `EncodingError` ✓；`otp/` 仅依赖 `crypto/`(encoding+errors) + `models/`（madge 30 文件无环，hotp.ts 零 $lib import、totp.ts 仅 `./hotp`、otpauth-uri.ts 仅 crypto/+models/）✓；`pnpm check` 0 错误 0 警告 ✓；`pnpm lint` 0 错误 0 警告 ✓（动态截断改用 `DataView.getUint8()` 读取字节，消除 `noUncheckedIndexedAccess` 下数组索引返回 `T|undefined` 所需的 `!`——越界抛 `RangeError` 不静默降级、不引入新分支保 100% 分支覆盖）；`pnpm format:check` 通过 ✓；`pnpm madge --circular` 无环（30 文件）✓。另修复 Stage 0 遗留：`coverage/` 生成目录未加入 eslint `ignores`（已在 `.gitignore`/`.prettierignore`），致 coverage 产物间歇性干扰 `pnpm lint`（ENOENT block-navigation.js），已补 `coverage/**` 至 `eslint.config.js` ignores。详见 [Stage03](./stages/Stage03-OTP计算引擎.md)

---

### Stage 4 — 服务端数据层与认证网关 (server/)

Drizzle schema + 查询（CAS/事务/CRUD）、Better Auth + passkey 插件 + 会话吊销、反枚举、限流、常量时间比较。全部 `import '$server-only'`。rotate-key/recover-reset 单事务原子。

- [x] 4.1 `db/schema/{user,vault,passkey-wrap}.ts`（Architecture §4，camelCase↔snake_case）✓ — 含 BA 管理表（user/session/account/verification/passkey）对齐 Better Auth 1.6 schema + WebOTP 自有表（vault/passkeyWrap）；user 表 BA 基础字段（id/email/emailVerified/name/image/createdAt/updatedAt）+ KDF 参数 + 5 盐 + recoveryVerifier + prfSalt 可空；vault userId PK 外键 onDelete cascade + bigint version default 1
- [x] 4.2 `db/schema/index.ts` + `db/index.ts`（`$server-only`）✓ — schema barrel 汇总 7 表；db/index 用 pg（node-postgres）驱动（Engineering §5.2 示例 postgres.js 系文档偏差，以已装依赖 pg 为准）；集成测试经 `DATABASE_SCHEMA` env 设 search_path 隔离
- [x] 4.3 `db/migrate.ts` + `drizzle-kit generate --name init_schema` + `push` 验证 ✓ — `drizzle/0000_init_schema.sql` 已生成（7 表 + 5 FK）；`drizzle-kit generate` 复跑无 drift（"No schema changes"）；集成测试 setup.ts 读该 SQL 建表成功，证明 DDL 有效
- [x] 4.4 `db/vault.ts`：`initVault`/`getVault`/`updateVaultBlob`（CAS）/`rotateWrappedDekByMaster` ✓ — CAS `UPDATE SET version=version+1 WHERE version=expectedVersion`，0 行→查当前行抛 OccConflictError 携 serverVersion/serverEncryptedBlob/serverWrappedDekByMaster（Engineering §8.3 代码为准）
- [x] 4.5 `db/vault.ts` `rotateMasterPassword` 事务（事务内更新+事务后 revokeOtherSessions）✓ — 单 db.transaction 内 hashPassword(newLak)→tx 更新 account.password + user(loginSalt/kdfSalt) + vault.wrappedDekByMaster；Blob/version/wrappedDekByRecovery/RK 材料不动；事务提交后调 revokeOtherSessions。注：task 4.5 规定 rotate 自身负责事务后吊销（使 db 层测试可验证 revoke 被调），与 Design §6.2「路由层调 revoke」有偏差，以 task 4.5 为准
- [x] 4.6 `db/user.ts`：`getAuthParamsByEmail`/`updateUserSaltsAndKdf`/`updateRecoveryMaterial` ✓ — 注：task 4.6 写 `getAuthParamsByEmail(userId)`，但端点为 `?email=` 且需支持反枚举分支，故以 email 为入参、null 表示不存在（param 名 userId 为文档笔误）
- [x] 4.7 `db/passkey-wrap.ts`：list/create（冲突→ConflictError）/delete（不存在→NotFoundError）✓ — ⚠️ 关键修复：drizzle-orm 0.45 将 pg 错误包装为 `DrizzleQueryError`，PG code 位于 `.cause.code`（非顶层 `.code`），原 `e.code === '23505'` 检测失效；改为取 `.cause?.code ?? .code` 后判 23505→ConflictError
- [x] 4.8 `db/recover.ts`：`getRecoverMaterial`/`resetRecovery` 事务（+ revokeAllSessions）✓ — getRecoverMaterial/getRecoveryAuthContext 不存在邮箱返回 null（路由据此返回伪材料/403）；resetRecovery 单事务内更新 account.password + user(全部 MP 盐+RK 材料) + vault(两包装)，Blob/version 不动；事务后调 revokeAllSessions
- [x] 4.9 `db/session.ts`：委托 auth 吊销 ✓ — re-export revokeSession/revokeOtherSessions/revokeAllSessions，路由经本模块调用不直接 import auth
- [x] 4.10 `auth.ts`：Better Auth + Drizzle adapter + passkey 插件 + revoke/updatePasswordHash ✓ — 决策：BA 会话吊销端点 requireHeaders（需会话上下文），无法在无会话 recover/reset 或事务后调用，故 revoke* 经 Drizzle 直接删 session 行；密码哈希（BA API 用独立 DB 连接无法加入 Drizzle tx）改用 hashPassword + tx 直写 account.password；auth 仅依赖 db/index + schema，不 import 查询文件（防环，Design §2.3）
- [x] 4.11 `anti-enumeration.ts`：`derivePseudoAuthParams`/`derivePseudoRecoveryMaterial`（HMAC 确定性）✓ — HMAC-SHA256(email, SERVER_SECRET) 确定性派生；伪盐 16 字节 base64（24 字符）与真实一致；伪 wrap/blob 为合法 "v=1;iv=12B;ct=..." 封装；n>32 按 HKDF-Expand 链式扩展
- [x] 4.12 `rate-limit.ts`：`checkAndConsume` + `LimitStore` 接口 ✓ — IP+email 双维度指数冷却（base*2^(blockCount-1) 封顶 maxCooldownSec），任一被拦取大 retryAfter；LimitStore 接口可注入 DB/Redis（默认内存 Map+TTL，注释标注 serverless 多实例不可靠）
- [x] 4.13 `constant-time.ts`：`safeEqualVerifier`（timingSafeEqual）✓ — 先比长度（不等恒定 false）再 timingSafeEqual，防时序侧信道
- [x] 4.14 集成测试 setup `tests/integration/setup.ts`（testcontainers/pg-mem）✓ — 注：Testing §1.2 建议 testcontainers/pg-mem，实际用远程 Supabase PG 的 webotp_test schema 隔离（用户决策）；beforeAll 重建 schema+表（读 0000_init_schema.sql 剥离 "public". 限定使 FK 经 search_path 解析），beforeEach TRUNCATE 全表；fileParallelism:false 串行避免争用
- [x] 4.15 集成测试 `tests/integration/db/`：vault-cas/rotate-key/passkey-wrap/recover/anti-enum ✓ — 5 文件 40 用例；另含 smoke.test.ts 验证运行时链路

**验收**: `pnpm test:integration` 通过（40/40）✓；`pnpm test:unit` 无回归（210/210）✓；`pnpm check` 0 错误 0 警告 ✓；`pnpm lint` 0 错误（42 个 `no-non-null-assertion` 警告，均 DB 行访问断言，与既有 rotate-key.test.ts 模式 + Stage 2 'warn' 配置一致）✓；`pnpm format:check` 通过 ✓；`pnpm madge --circular` 无环（37 文件）✓；`drizzle-kit generate` 无 drift（7 表）✓。CAS 冲突抛 OccConflictError 携 serverVersion/serverEncryptedBlob/serverWrappedDekByMaster ✓；rotate/recover 事务原子（注入失败验证回滚）✓；事务后吊销会话被调（revokeOtherSessions/revokeAllSessions）✓；anti-enum 伪响应与真实响应逐字段形状/base64 长度/类型一致 ✓；`server/` 全部入口 `import '$server-only'`（查询文件加显式守卫，非仅依赖 db/index 传递）✓；auth 仅依赖 schema + db/index，不 import 查询文件（防环）✓。✅ 残留已关闭：`drizzle-kit push` 已对远程 PG throwaway schema 验证成功（"No changes detected"，public 含 user/vault/passkey_wrap/session 等 7 表）；BA 会话吊销经 Drizzle 直删 session 行的偏差已反向传播至 Design §5.2/§6.2 + Architecture §8.2 + Engineering §8.3（见顶部反向传播记录）。详见 [Stage04](./stages/Stage04-服务端数据层与认证网关.md)

---

### Stage 5 — API 路由层 (routes/api/*)

9 个端点 `+server.ts` 处理器：鉴权 + 参数校验 + 调 server/* + 返回 §9.1 schema + 按 StateMachines §3.1 矩阵返回错误码。处理器薄，业务在 server/db。

- [x] 5.1 `auth-params/+server.ts`（GET 公开，反枚举）✓ — 存在邮箱→`getAuthParamsByEmail`；不存在→`derivePseudoAuthParams`；缺/空 email→400。伪参数与真实响应逐字段形状/base64 长度一致
- [x] 5.2 `auth/[...path]/+server.ts`（委托 BA）✓ — `auth.handler(event.request)` 全方法透传（GET/POST/PUT/PATCH/DELETE）；BA 自管会话/cookie/CSRF。`auth/*` 401 由 BA 返回（凭据错，客户端拦截器区分不触发全局吊销）
- [x] 5.3 `vault/+server.ts` GET ✓ — BA 会话鉴权→`getVault`→200 `VaultResponse`；无会话→401
- [x] 5.4 `vault/+server.ts` POST（201/409）✓ — `initVault`→201 `{version:1}`；重复初始化（vault.userId PK 23505）→409。注：`initVault` 原直接 `db.insert` 未处理 23505，本轮加 try/catch 取 `.cause?.code ?? .code` 判 23505→`ConflictError`（与 `createPasskeyWrap` 同模式）
- [x] 5.5 `vault/+server.ts` PUT（CAS，412 裁剪响应体）✓ — `updateVaultBlob` CAS→200 `{version}`；捕 `OccConflictError`→412 严格三字段 `{serverVersion, encryptedBlob, wrappedDekByMaster}`（显式只取三字段，不含 `wrappedDekByRecovery`/passkey 行）
- [x] 5.6 `vault/rotate-key/+server.ts`（事务+revokeOtherSessions）✓ — `rotateMasterPassword(userId, req, ctx.sessionId)` 单事务原子更新 + 事务提交后 `revokeOtherSessions`（保留当前会话）；200
- [x] 5.7 `passkey-wraps/+server.ts` GET/POST（201/409）✓ — GET→`listPasskeyWraps`→200 `PasskeyWrapRow[]`；POST→`createPasskeyWrap`→201 / credentialId 23505 重复→409
- [x] 5.8 `passkey-wraps/[credentialId]/+server.ts` DELETE（200/404）✓ — `deletePasskeyWrap`（WebOTP 包装行，不存在→404）+ `revokePasskeyCredential`（BA passkey 凭证表，吊销登录凭证，幂等）。注：`revokePasskeyCredential` 为本轮新增 `server/auth.ts` 导出（经 Drizzle 删 passkey 行，与 `revokeSession` 同模式）
- [x] 5.9 `vault/recover/init/+server.ts`（无会话+限流+伪材料）✓ — `checkAndConsume`（IP+email 双维度）→超限 429 + `Retry-After` 头；存在邮箱→真实 `RecoverInitResponse` / 不存在→`derivePseudoRecoveryMaterial`（形状一致）
- [x] 5.10 `vault/recover/reset/+server.ts`（限流+verifier 校验+事务+revokeAllSessions）✓ — `checkAndConsume`→`getRecoveryAuthContext`→`safeEqualVerifier`（常量时间，失败/不存在邮箱→403 不泄露存在性）→`resetRecovery` 事务 + 事务后 `revokeAllSessions`→200。429 + `Retry-After`
- [x] 5.11 `session/[id]/+server.ts` DELETE（200/404）✓ — `revokeSession(userId, id)`（按 userId 范围限定，0 行→`NotFoundError`→404）；200。注：`revokeSession` 原无返回值判断，本轮改为 `.returning` 取 0 行→`NotFoundError`（与 `deletePasskeyWrap` 同模式）
- [x] 5.12 错误码映射统一（StateMachines §3.1 矩阵）✓ — `OccConflictError`→412、`ConflictError`→409、`NotFoundError`→404、`ForbiddenError`→403（reset verifier 失败）、限流→429+`Retry-After`、无会话→401（`requireSession` 统一辅助）
- [x] 5.13 集成测试 `tests/integration/api/`：auth-params/vault/rotate-key/passkey-wraps/recover ✓ — 5 文件 31 用例；另含 `helpers.ts`（`mockEvent`/`mockSession`/`readJson` 构造最小 `RequestEvent` 直接调处理器）

**验收**: `pnpm test:integration` 通过（71/71，含既有 db 40 + 新增 api 31）✓；`pnpm test:unit` 无回归（210/210）✓；9 端点成功路径 + 错误码矩阵全覆盖（401/403/404/409/412/429）✓；412 响应体严格三字段（测试断言 `Object.keys().sort()` 恰为三字段）✓；recover 限流 429 + `Retry-After`（init/reset 双测）✓；verifier 失败→403（含不存在邮箱同形 403，不泄露存在性）✓；reset 后旧会话全吊销 + RK 材料更新 ✓；`auth/*` 委托 BA（凭据错 401 由 BA 返回，不经 `requireSession`）✓；处理器薄（业务在 server/db，路由层仅编排 + 参数校验 + 错误码映射）✓；`pnpm check` 0 错误 0 警告 ✓；`pnpm lint` 0 错误（45 `no-non-null-assertion` 警告，均 DB 行访问断言，与既有测试一致）✓；`pnpm format:check` 通过 ✓；`pnpm madge --circular` 无环（38 文件）✓。详见 [Stage05](./stages/Stage05-API路由层.md)

> **实现决策（文档未明确，按标准模式）**：(1) BA 会话解析经 `src/hooks.server.ts` 沉淀到 `event.locals.session`（SvelteKit + Better Auth 标准模式；`/api/auth/*` 不在 hooks 解析，由其 `+server.ts` 委托 `auth.handler` 自管 cookie/会话，避免双重解析）。(2) `app.d.ts` 加 `App.Locals.session` 类型声明。(3) `src/lib/server/api-auth.ts` 提供 `requireSession`（无会话→401 Response）+ `requireFields`（类型守卫参数校验，避免 strict-boolean/no-unnecessary-condition 误报）。(4) 集成测试经 `mockEvent` 构造最小 `RequestEvent` 直接调处理器导出的 HTTP 方法（不经真实 SvelteKit 路由，与 db 层测试同进程共享 webotp_test schema）。(5) task 5.8「吊销 BA 凭证」= 经 Drizzle 删 BA `passkey` 表行（`revokePasskeyCredential`，新增），使该 Passkey 无法再登录；WebOTP `passkeyWrap` 行分别存储，先删后者（不存在→404）再删前者（幂等）。(6) `initVault` 与 `revokeSession` 补 23505/0 行检测（原 Stage 4 实现未处理冲突/不存在分支，路由层需要对应错误码）。

---

### Stage 6 — 客户端 I/O 与浏览器能力层 (api-client/ + webauthn/ + utils/)

全局 fetch 拦截器 + 9 端点封装 + 401 吊销 handler 注册（不反向 import state/）；WebAuthn PRF 仪式封装；时钟漂移 + 剪贴板清除。可与 Stage 4/5 并行。

- [ ] 6.1 `api-client/api-client.ts`：`apiFetch` 拦截器（HTTP→类型化错误，StateMachines §3.2）
- [ ] 6.2 `api-client/session-revoked-hook.ts`：`setSessionRevokedHandler`/`triggerSessionRevoked`
- [ ] 6.3 `api-client/endpoints.ts`：9 端点类型化封装
- [ ] 6.4 `webauthn/errors.ts`：`PrfUnsupportedError`/`WebAuthnUserCancelledError`/`PrfOutputMissingError`
- [ ] 6.5 `webauthn/support.ts`：`isPrfSupported`
- [ ] 6.6 `webauthn/prf.ts`：`createPasskeyWithPrf`/`getAssertionWithPrf`
- [ ] 6.7 `utils/clock-drift.ts`：`detectClockDrift`
- [ ] 6.8 `utils/clipboard.ts`：`copyAndClearAfter`
- [ ] 6.9 单测 `tests/unit/api-client/`（MSW）：interceptor/endpoints/session-revoked-hook
- [ ] 6.10 单测 `tests/unit/webauthn/support.test.ts`
- [ ] 6.11 单测 `tests/unit/utils/`：clock-drift/clipboard
- [ ] 6.12 `webauthn/prf.ts` 标注需 E2E（Stage 9）

**验收**: 拦截器全部状态码映射断言通过；412 解析三字段；429 读 Retry-After（无头默认 60）；`api-client/` 不 import `state/`；`isPrfSupported` mock 正确。详见 [Stage06](./stages/Stage06-客户端IO与浏览器能力层.md)

---

### Stage 7 — 客户端状态层 (state/)

Svelte 5 Runes 三大同级状态模块（禁互导）：auth（会话/设备/离线缓存）、crypto（KEK/DEK 解包、解锁状态机、内存擦除、锁定）、vault（单体同步引擎 + `mergeAccounts` 纯函数 + 防抖 + 重试 + 离线缓存）。

- [ ] 7.1 `vault.svelte.ts` 导出纯函数 `mergeAccounts`（Architecture §5.3 全规则 + base 丢失降级）
- [ ] 7.2 `vault.svelte.ts` 模块级 `$state`：accounts/baseSnapshot/syncStatus/lastVersion
- [ ] 7.3 `vault.svelte.ts` 同步编排：init/loadVault/add/update/delete/triggerSync/encryptAndUpload/handleOccConflict/persist/loadFromIDB/getCachedPasskeyWraps
- [ ] 7.4 `vault.svelte.ts` 重试队列：`calculateBackoff`（StateMachines §4.2）+ `syncWithRetry`
- [ ] 7.5 `vault.svelte.ts` 防抖：500ms/3000ms（StateMachines §8）
- [ ] 7.6 `vault.svelte.ts` IndexedDB stores：vault-cache/base-snapshot/passkey-wraps
- [ ] 7.7 `crypto.svelte.ts` 状态：isUnlocked/unlockStatus/dekRef（不入 `$state`）
- [ ] 7.8 `crypto.svelte.ts`：unlockWithMp/unlockWithPasskey/unlockWithRecoveryKey/lock/rotateMasterPassword/registerSessionRevokedHandler
- [ ] 7.9 `crypto.svelte.ts` 锁定触发：主动/5min/visibilitychange/401（StateMachines §2.4/§2.5）
- [ ] 7.10 `crypto.svelte.ts` 内存擦除 + 解包失败 DecryptionError→locked
- [ ] 7.11 `auth.svelte.ts` 状态：isAuthenticated/sessions/currentDeviceId/authStatus
- [ ] 7.12 `auth.svelte.ts`：registerWithLak/loginWithLak/loginWithPasskey/logout/listSessions/revokeSession/sedimentAuthParams/getCachedAuthParams
- [ ] 7.13 `auth.svelte.ts` 登录 401 不触发吊销
- [ ] 7.14 三大 state 禁互导（madge 校验）
- [ ] 7.15 单测 `tests/unit/merge/three-way.test.ts`（Testing §5 全矩阵）
- [ ] 7.16 集成测试 `tests/integration/state/`：sync/unlock 状态机

**验收**: `mergeAccounts` 全矩阵通过；状态转换符合 StateMachines §1/§2；三 state 无互导；`dekRef` 不入 `$state`；退避公式一致；IndexedDB 三 store 隔离。详见 [Stage07](./stages/Stage07-客户端状态层.md)

---

### Stage 8 — UI 层与国际化 (components/ + routes + paraglide/)

全部 Svelte 5 组件、页面路由、布局守卫、paraglide i18n。组件禁 import server/、禁传密钥 props、禁 `{@html}`；i18n 全走 paraglide 消息函数。

- [ ] 8.1 paraglide 初始化 + `messages/{zh,en}.json`（StateMachines §7.1/§7.2 键清单）
- [ ] 8.2 `layout/SensitiveInput.svelte`（单向 onSubmit，不 bind:value）
- [ ] 8.3 `layout/{AppSidebar,AppHeader}.svelte`
- [ ] 8.4 `auth/{LoginForm,RegisterForm,UnlockForm,RecoverForm}.svelte`
- [ ] 8.5 `otp/{OtpCodeDisplay,AccountItem,AccountList,AccountEditDialog,AddAccountDialog,ClockDriftWarning}.svelte`
- [ ] 8.6 `sync/{SyncStatusBadge,LockButton}.svelte`
- [ ] 8.7 `settings/{PasskeyManager,RecoveryKeyDisplay,ExportDialog,ChangePasswordForm}.svelte`
- [ ] 8.8 shadcn 组件子集引入（UIInventory §4）
- [ ] 8.9 路由：`+page`/`+layout`/`+error`
- [ ] 8.10 路由：register/login/unlock（UIInventory §6 交互）
- [ ] 8.11 路由：app/+layout（守卫+布局）/app/+page（OTP 列表）
- [ ] 8.12 路由：app/settings/{+page,passkeys,change-password,export}
- [ ] 8.13 路由：recover/recover/reset
- [ ] 8.14 组件契约：禁 server/、禁密钥 props、禁 `{@html}`
- [ ] 8.15 OTP 列表交互（UIInventory §7：搜索/分组/倒计时/HOTP 递增/复制清除）
- [ ] 8.16 i18n 全走 paraglide，无硬编码文案
- [ ] 8.17 禁 Svelte 4 Store（全 Runes）

**验收**: `check`/`lint` 通过；各页面可渲染；路由守卫三态正确；i18n 键覆盖 §7.2；组件不 import server/、不传密钥、无 `{@html}`；`madge` 无环。详见 [Stage08](./stages/Stage08-UI层与国际化.md)

---

### Stage 9 — 端到端集成与关键用户流 (E2E)

Playwright（chromium + 虚拟 WebAuthn）覆盖全部关键用户流，分层推进策略的集成风险兜底。

- [ ] 9.1 `registration-flow.spec.ts`：注册→解锁→加账户→同步
- [ ] 9.2 `conflict-merge.spec.ts`：多设备并发合并 + 墓碑 + 字段冲突 + HOTP counter max + base 丢失降级
- [ ] 9.3 `prf-unlock.spec.ts`：PRF 绑定+免密解锁+撤销+降级
- [ ] 9.4 `disaster-recovery.spec.ts`：recover/init→reset→旧 RK 失效→旧会话失效→DEK/Blob 不变
- [ ] 9.5 密码轮换 E2E：设备 A 轮换→设备 B 401→新 MP 登录→合并（阻断式 UI §5.2）
- [ ] 9.6 离线场景：断网编辑→恢复在线合并上传
- [ ] 9.7 时钟漂移警告（>15s 显示）
- [ ] 9.8 复制 30s 清除验证

**验收**: `pnpm test:e2e` 通过（chromium）；关键用户流 100% 覆盖；合并收敛；PRF 全路径；恢复后旧 RK 失效；轮换后新 MP 登录合并。详见 [Stage09](./stages/Stage09-端到端集成与关键用户流.md)

---

### Stage 10 — 安全加固与验收

集中的安全收尾：Architecture §10 威胁矩阵逐项复核、CSP 渗透、侧信道审计、依赖审计、零知识边界复核、覆盖率与规范验收。不新增功能，只验证与修补安全缺口。

- [ ] 10.1 威胁模型复核（Architecture §10 全部向量）
- [ ] 10.2 CSP 渗透（生产构建，注入被拦）
- [ ] 10.3 内存擦除审计（诚实定界文档化）
- [ ] 10.4 反枚举审计（形状/耗时一致）
- [ ] 10.5 常量时间比较审计（无早退）
- [ ] 10.6 限流审计（双维度+Retry-After+多实例抽象）
- [ ] 10.7 依赖审计（`pnpm audit` 零高危+版本一致）
- [ ] 10.8 密钥隔离审计（5 盐互不复用+KEK 不接触 Blob+DEK 恒定+IV 不复用）
- [ ] 10.9 覆盖率验收（crypto/otp 95/90，集成关键 100，E2E 关键 100）
- [ ] 10.10 规范验收（check/lint/format:check/madge 全绿）
- [ ] 10.11 零知识边界复核（Architecture §8.4 表逐项）
- [ ] 10.12 文档同步（偏差反向传播）
- [ ] 10.13 RK 强制轮换验证（旧 RK reset→403）
- [ ] 10.14 OCC 范围复核（仅 PUT vault 自增 version）

**验收**: 威胁矩阵每项有防御代码+测试；生产 CSP 注入被拦；`pnpm audit` 零高危；覆盖率达标；规范全绿；零知识边界无越界；旧 RK 失效；OCC 范围正确；已知残留记录在案。详见 [Stage10](./stages/Stage10-安全加固与验收.md)

---

## 总体进度统计

| 阶段 | 状态 | 任务数 | 完成 |
| :--- | :--- | :--- | :--- |
| Stage 0 — 项目脚手架与开发环境 | ✅ 完成 | 16 | 16 |
| Stage 1 — 领域模型与错误基类 | ✅ 完成 | 7 | 7 |
| Stage 2 — 密码学原语 | ✅ 完成 | 12 | 12 |
| Stage 3 — OTP 计算引擎 | ✅ 完成 | 5 | 5 |
| Stage 4 — 服务端数据层与认证网关 | ✅ 完成 | 15 | 15 |
| Stage 5 — API 路由层 | ✅ 完成 | 13 | 13 |
| Stage 6 — 客户端 I/O 与浏览器能力层 | ⬜ 未开始 | 12 | 0 |
| Stage 7 — 客户端状态层 | ⬜ 未开始 | 16 | 0 |
| Stage 8 — UI 层与国际化 | ⬜ 未开始 | 17 | 0 |
| Stage 9 — 端到端集成与关键用户流 | ⬜ 未开始 | 8 | 0 |
| Stage 10 — 安全加固与验收 | ⬜ 未开始 | 14 | 0 |
| **合计** | — | **135** | **68** |

> 状态标记：⬜ 未开始 / 🟨 进行中 / ✅ 完成。每完成一个阶段将其任务勾选并把状态改为 ✅，同步更新本表"完成"列。

---

## 阶段间并行机会

虽为分层推进，部分阶段可并行以缩短关键路径：

- **Stage 4 与 Stage 2/3 可部分并行**：Stage 4 服务端依赖 Stage 1 models 与 Stage 2 错误类，但 schema 定义（4.1–4.3）可在 Stage 2 完成前先行；查询层（4.4+）需错误类就绪。
- **Stage 6 与 Stage 4/5 可并行**：Stage 6 客户端 I/O 仅依赖 Stage 1 models（契约类型），不依赖服务端实现，可与 Stage 4/5 同时推进。
- **Stage 8 UI 组件可在 Stage 7 state 接口稳定后并行**：组件依赖 state 的公共 API 契约，契约一旦冻结即可并行开发，不必等 state 全部实现完成。

串行硬依赖：Stage 0→1→2→3（纯函数链）；Stage 7→8→9→10（集成与验收链）。
