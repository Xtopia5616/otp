# Stage 3 — OTP 计算引擎 (otp/)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 2](./Stage02-密码学原语.md)
**关联规格**: [Design.md](../Design.md) §3.3、[Architecture.md](../Architecture.md) §5.2、[CryptoSpec.md](../CryptoSpec.md) §10、[Testing.md](../Testing.md) §3

---

## 目标

实现 TOTP/HOTP 验证码计算与 otpauth URI 解析。纯函数层，依赖 `crypto/encoding.ts` 的 base32 解码与 `models/` 类型。内部函数遵循 CryptoSpec 抛错语义（`Promise<string>`，失败抛 `CryptoError` 子类）；`Result` 包装为调用侧可选职责，不在本模块强制（Engineering §6.3 / Design §10.3）。

## 范围

| 文件 | 职责 |
| :--- | :--- |
| `src/lib/otp/hotp.ts` | HOTP 计算（RFC 4226 动态截断） |
| `src/lib/otp/totp.ts` | TOTP 计算 + 验证（RFC 6238） |
| `src/lib/otp/otpauth-uri.ts` | otpauth URI 解析 / 构建 |

## 前置依赖

Stage 2 完成（`crypto/encoding.ts` 的 `base32Decode` 可用）。

## 具体任务

- [ ] 3.1 `hotp.ts`：`generateHOTP({ secret: Uint8Array, algorithm, digits, counter: bigint }) → Promise<string>`（RFC 4226：HMAC → 动态截断 → 模 10^digits；counter 以 bigint 传入，8 字节大端填充）
- [ ] 3.2 `totp.ts`：
  - `generateTOTP({ secret, algorithm, digits, period, time }) → Promise<string>`（`T = floor(time / period)`，委托 `generateHOTP`）
  - `verifyTOTP({ token, secret, algorithm, digits, period, window=1, time }) → Promise<boolean>`（默认 window=±1，比对 `[T-window, T+window]`）
- [ ] 3.3 `otpauth-uri.ts`：
  - `parseOtpauthUri(uri) → OtpauthParsed`（解析 `otpauth://totp/Issuer:label?secret=...&algorithm=...&digits=...&period=...&counter=...&issuer=...`，返回 `AccountDraft` 待调用方补 `id`/`createdAt`/`updatedAt`；非 `totp`/`hotp` 协议、缺 secret、格式非法 → 抛 `EncodingError`）
  - `buildOtpauthUri(account) → string`（导出用，按 RFC 6238 otpauth 格式构建）
- [ ] 3.4 HMAC 经 SubtleCrypto（`SHA1`/`SHA256`/`SHA512`）；base32 解码复用 `crypto/encoding.ts`，解码失败抛 `EncodingError`
- [ ] 3.5 单测 `tests/unit/otp/`：
  - `totp.test.ts`（Testing §3.1：RFC 6238 Appendix B 全部 18 向量——SHA1/SHA256/SHA512 × 6 时间点；6 位码取 8 位低 6 位验证）
  - `hotp.test.ts`（Testing §3.2：RFC 4226 Appendix D counter 0–9 精确匹配；SHA256/SHA512 分支生成 6/8 位码格式校验）
  - `otpauth-uri.test.ts`：合法 URI 解析正确提取 secret/issuer/label/algorithm/digits/period/counter；`parseOtpauthUri → buildOtpauthUri` 往返一致；非法协议 / 缺 secret / 格式非法抛 `EncodingError`

## 验收标准

- `pnpm test:unit` 通过；`otp/**` 行覆盖率 ≥ 95%、分支覆盖率 ≥ 90%
- RFC 6238 全部 18 向量**精确匹配**（SHA1/SHA256/SHA512 全分支）
- RFC 4226 counter 0–9 **精确匹配**
- otpauth 解析正确提取全部字段；往返一致；非法输入抛 `EncodingError`
- `otp/` 仅依赖 `crypto/encoding` + `models/`（依赖方向单向，Design §2.3）

## 关键参考

- Design §3.3（otp/ 模块契约 + API 概要 + Result 取舍说明）
- Architecture §5.2（TOTP/HOTP 参数规范：base32 编码、动态因子、HOTP counter 单调）
- CryptoSpec §10（TOTP/HOTP 实现规格 + 模块契约权威说明）
- Testing §3（RFC 6238 / RFC 4226 标准向量 + 6 位码验证）
- Engineering §6.3（OTP 返回类型：模块内部抛错、Result 为调用侧可选）

## 风险与注意事项

- **counter 用 bigint**：HOTP 计数器以字符串存储（Architecture §5.1），计算时转 bigint；8 字节大端填充须正确，否则 RFC 4226 向量不匹配。
- **SHA1 默认**：RFC 6238 默认 SHA1，`algorithm` 字段缺省时按 SHA1 处理；测试须覆盖 SHA256/SHA512 分支（向量来自 RFC 6238 同源数据）。
- **verifyTOTP window**：默认 ±1 周期，防止时钟漂移导致误判；不可放宽到 ±2 以上（CryptoSpec §10 验证窗口）。
- **不在此阶段做 UI 包装**：`Result<T, CryptoError>` 由调用方（Stage 7/8）按需包装，`otp/` 内部保持抛错语义。
