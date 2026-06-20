# Stage 2 — 密码学原语 (crypto/)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 1](./Stage01-领域模型与错误基类.md)
**关联规格**: [Design.md](../Design.md) §3.2、[CryptoSpec.md](../CryptoSpec.md) 全文、[Testing.md](../Testing.md) §2 / §4、[Architecture.md](../Architecture.md) §3

---

## 目标

实现信封加密全部密码学原语：Argon2id 派生、AES-GCM-256 加解密/包装、HKDF-SHA256、base32/base64 编解码、密文封装格式、RK 生成解析、内存擦除。本模块为**纯函数、无状态、无副作用**，100% 可独立单测，是零知识安全模型的核心。任何 AEAD 失败、参数非法、格式错误必须显式抛 `CryptoError` 子类，**绝不静默降级、绝不返回默认值**。

## 范围

| 文件 | 职责 |
| :--- | :--- |
| `src/lib/crypto/errors.ts` | `CryptoError` 细化子类 |
| `src/lib/crypto/encoding.ts` | base32/base64 + Blob 封装格式 |
| `src/lib/crypto/argon2.ts` | Argon2id KEK/LAK/verifier 派生 |
| `src/lib/crypto/aes-gcm.ts` | AES-GCM-256 加解密（IV 显式） |
| `src/lib/crypto/envelope.ts` | DEK 生成/KEK 导入/包装解包/Blob 加解密 |
| `src/lib/crypto/hkdf.ts` | HKDF-SHA256 PRF 派生 |
| `src/lib/crypto/recovery-key.ts` | RK 生成/解析（96 位 base32） |
| `src/lib/crypto/secure-wipe.ts` | 敏感字节原地覆写 |

## 前置依赖

Stage 1 完成（`models/errors.ts` 的 `CryptoError` 基类已就绪，供 `crypto/errors.ts` 继承）。

## 具体任务

- [ ] 2.1 `errors.ts`：`DecryptionError`/`KdfError`/`EncodingError`/`FormatError`，均 `extends CryptoError`（`import { CryptoError } from '$lib/models/errors'`），`operation` 按 Engineering §6.1 固定（`FormatError` 与 `EncodingError` 同为 `'decode'`）
- [ ] 2.2 `encoding.ts`：
  - `base32Decode(str) → Uint8Array`（RFC 4648：大小写不敏感、忽略空格/连字符/`=` 填充、非法字符抛 `EncodingError`、空串抛 `EncodingError`）
  - `base64Encode(bytes) → string` / `base64Decode(str) → Uint8Array`
  - `serializeBlob({version, iv, ciphertext}) → string`（`v=1;iv=<base64>;ct=<base64>`，CryptoSpec §4.3）
  - `parseBlob(str) → {version, iv, ciphertext}`（字段缺失/`v≠1`/IV≠12 字节/非法 base64/空串 → 抛 `FormatError`，CryptoSpec §4.4）
- [ ] 2.3 `argon2.ts`（hash-wasm `argon2id`，CryptoSpec §2）：
  - `deriveKEK(password, salt, params) → Promise<Uint8Array(32)>`
  - `deriveLAK(mpBytes, loginSalt, params) → Promise<string>`（base64(32 字节)，约 44 字符）
  - `deriveRecoveryVerifier(rkBytes, verifierSalt, params) → Promise<string>`
  - 参数非法 / Wasm 加载失败 → `KdfError`
- [ ] 2.4 `aes-gcm.ts`（SubtleCrypto，CryptoSpec §3）：
  - `generateIV() → Uint8Array(12)`
  - `encryptAesGcm(plaintext, key, iv) → Promise<Uint8Array>` / `decryptAesGcm(ct, key, iv) → Promise<Uint8Array>`（纯核心，IV 显式传入）
  - 便利函数 `encryptAesGcmRandomIv(plaintext, key)`（内部随机 IV）
  - AEAD tag 校验失败 → `DecryptionError`
- [ ] 2.5 `envelope.ts`（CryptoSpec §3 / §4）：
  - `importKEK(rawKek) → Promise<CryptoKey>`（`extractable: false`）
  - `generateDEK() → Promise<CryptoKey>`（256 位随机）
  - `wrapDek(dek, kek) → Promise<string>`（内部随机 IV，输出封装格式串）
  - `unwrapDek(wrapped, kek) → Promise<CryptoKey>`
  - `encryptBlob(accounts, dek) → Promise<string>` / `decryptBlob(encoded, dek) → Promise<Account[]>`
- [ ] 2.6 `hkdf.ts`：`deriveKEKPrf(prfOut, prfSalt) → Promise<CryptoKey>`，`info = 'WebOTP/KEK-PRF/v1'`（CryptoSpec §5 / §6）
- [ ] 2.7 `recovery-key.ts`：`generateRecoveryKey() → string`（96 位/12 字节，20 字符 base32 RFC 4648 去填充，4-4-4-4-4 分组）、`parseRecoveryKey(str) → Uint8Array(12)`（容忍分组连字符）
- [ ] 2.8 `secure-wipe.ts`：`secureWipe(arr: Uint8Array) → void`（`crypto.getRandomValues()` 原地覆写）
- [ ] 2.9 测试 fixtures（Testing §2.1 / §2.2 / §2.3）：`tests/fixtures/{crypto-constants.ts, argon2id-test-params.ts, accounts.ts}`（`TEST_DEK`/`TEST_IV`/`TEST_IV_2`/`TEST_SALT`/`TEST_SALT_2`/`TEST_MP`/`TEST_RK_BASE32`/`HKDF_INFO`/`ARGON2ID_TEST_PARAMS`/`BASE_ACCOUNTS`）
- [ ] 2.10 单测 `tests/unit/crypto/`：
  - `argon2id.test.ts`（Testing §4.1：确定性 / 32 字节 / 不同密码不同输出 / 不同盐路径隔离）
  - `aes-gcm.test.ts`（Testing §4.2：wrap→unwrap 往返 / 篡改密文 1 字节 / 篡改 IV / 篡改 tag / IV 不复用 / 生产 API 不接受外部 IV）
  - `hkdf.test.ts`（Testing §4.4：32 字节 / 确定性 / 不同 PRF 不同 KEK / 不同 info 不同 KEK / info 常量校验）
  - `base32.test.ts`（Testing §4.5：标准解码 / 大小写不敏感 / 忽略空格连字符填充 / 非法字符抛错 / 空串抛错 / RK 4-4-4-4-4 分组解码为 12 字节）
  - `lak.test.ts`（Testing §4.6：base64 44 字符 / 确定性 / 不同盐隔离）
  - `blob-format.test.ts`（Testing §4.3：合法解析 / serialize↔parse 往返 / 拒绝缺 v/iv/ct、`v≠1`、IV≠12B、非法 base64、空串）
- [ ] 2.11 补充 `recovery-key.test.ts`：generate→parse 往返为 12 字节、20 字符 4-4-4-4-4 格式、parse 容忍连字符
- [ ] 2.12 补充 `secure-wipe.test.ts`：覆写后内容与原值不同

## 验收标准

- `pnpm test:unit` 通过；`crypto/**` 行覆盖率 ≥ 95%、分支覆盖率 ≥ 90%
- AES-GCM 篡改（密文 / IV / tag 任 1 字节）均抛 `DecryptionError`；两次包装同 DEK 密文不同（IV 不复用）
- base32 容错（大小写 / 空格 / 连字符 / 填充）全部通过；非法字符与空串抛 `EncodingError`
- Blob 格式 parse/serialize 往返一致；全部拒绝用例抛 `FormatError`
- HKDF `info='WebOTP/KEK-PRF/v1'`、确定性、不同 PRF / info 产生不同 KEK
- RK generate→parse 往返为 12 字节，展示为 20 字符 4-4-4-4-4
- `crypto/` 不 import `state/` 或 `server/`（依赖方向单向；`crypto/ → models/` 仅用于错误基类）

## 关键参考

- Design §3.2（crypto/ 模块契约 + 公共 API 概要）
- CryptoSpec §1（信封加密总览 + 不变量）、§2（Argon2id）、§3（AES-GCM）、§4（封装格式）、§5/§6（HKDF）、§9（内存擦除）
- Architecture §3（密钥层级与派生流）、§3.2（RK 规格）
- Testing §2（测试常量与降速参数）、§4（密码学单测全部用例）
- Engineering §6.1（CryptoError 子类签名 + 物理位置）

## 风险与注意事项

- **不变量**：DEK 恒定、KEK 不接触 Blob、各路径独立盐、IV 不可复用、AEAD 失败即拒绝（CryptoSpec §1.2）——任一破坏即安全缺陷。
- **生产 IV 不可外部可控**：`wrapDek` 生产签名不接受外部 IV，IV 由内部 `crypto.getRandomValues` 生成；仅测试用例可用显式 IV 核心函数验证确定性（Testing §4.2）。
- **降速参数仅测试**：`ARGON2ID_TEST_PARAMS`（m=4096/t=1/p=1）安全性极低，绝不可用于生产；生产参数 m=65536/t=3/p=4（Architecture §3.3）。
- **`extractable: false`**：所有 KEK/DEK 导入为 `CryptoKey` 时必须 `extractable: false`，防止密钥材料被导出。
- **`noUncheckedIndexedAccess`**：`Uint8Array[index]` 返回 `number | undefined`，加密字节操作须显式检查，本阶段测试需覆盖边界。
