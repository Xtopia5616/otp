// src/lib/otp/hotp.ts — HOTP 计算 (RFC 4226, Stage 3.1, CryptoSpec §10.3)
// 纯函数，无状态。secret 为原始字节（base32 解码由调用方完成）。
// 遵循 CryptoSpec §10 抛错语义：签名 Promise<string>，编程错误以原生异常传播。
//
// ⚠️ 与 CryptoSpec §10.4 参考伪码的偏差（权威：Stage03 任务定义 + Testing §3 测试向量）：
//   - secret 类型为 Uint8Array（原始字节），而非 base32 字符串。故本函数不内部 base32Decode；
//     base32 解码职责上移至调用方（state 层 base32Decode(Account.secret)）与 otpauth-uri 解析层。
//   - 不 secureWipe 输入 secret：输入由调用方持有，verifyTOTP 窗口循环需复用同一数组。

/**
 * generateHOTP 参数。
 * `secret` 为 HMAC 密钥的原始字节（调用方经 `base32Decode(Account.secret)` 得到）。
 */
export interface GenerateHotpParams {
  /** 共享密钥原始字节 */
  secret: Uint8Array;
  /** HMAC 算法（Account.algorithm） */
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  /** 验证码位数 */
  digits: 6 | 8;
  /** HOTP 计数器（bigint，编码为 8 字节大端序） */
  counter: bigint;
}

/**
 * 计算 HOTP 验证码（RFC 4226）。
 *
 * 流程：HMAC-SHA{1,256,512}(secret, counter) → 动态截断（§5.3）→ 模 10^digits → 零填充。
 * counter 以 8 字节大端序填充（RFC 4226 §5.2）。
 *
 * @returns 零填充的数字验证码字符串（如 "012345"）
 */
export async function generateHOTP(params: GenerateHotpParams): Promise<string> {
  const { secret, algorithm, digits, counter } = params;

  // 1. 导入 HMAC 密钥（不可导出）
  const subtleAlgo: 'SHA-1' | 'SHA-256' | 'SHA-512' =
    algorithm === 'SHA1' ? 'SHA-1' : algorithm === 'SHA256' ? 'SHA-256' : 'SHA-512';
  const key = await crypto.subtle.importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: { name: subtleAlgo } },
    false,
    ['sign'],
  );

  // 2. 计数器编码为 8 字节大端序
  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = Number(c & 0xffn);
    c >>= 8n;
  }

  // 3. HMAC
  const hmacResult = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes));

  // 4. 动态截断（RFC 4226 §5.3 / CryptoSpec §10.3）
  // 用 DataView 访问字节：getUint8 返回 number（非 undefined），越界抛 RangeError——
  // 既消除 noUncheckedIndexedAccess 的 `!`，又不静默降级（AEAD/HMAC 异常以 RangeError 传播）。
  // offset 由 HMAC 末字节低 4 位决定（0–15）；高位置 0x7f 保证 binary 为 31 位正整数。
  const view = new DataView(hmacResult.buffer, hmacResult.byteOffset, hmacResult.byteLength);
  const offset = view.getUint8(view.byteLength - 1) & 0x0f;
  const binary =
    ((view.getUint8(offset) & 0x7f) << 24) |
    ((view.getUint8(offset + 1) & 0xff) << 16) |
    ((view.getUint8(offset + 2) & 0xff) << 8) |
    (view.getUint8(offset + 3) & 0xff);

  // 5. 模 10^digits + 零填充
  const modulus = 10 ** digits;
  const otp = binary % modulus;

  return otp.toString().padStart(digits, '0');
}
