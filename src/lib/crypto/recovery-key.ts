// src/lib/crypto/recovery-key.ts — RK 生成/解析 (Stage 2.7, CryptoSpec §7.3, Architecture §3.2)
// RK 为 96 位（12 字节）随机 → base32 编码恰好 20 字符（RFC 4648 去填充）→ 4-4-4-4-4 分组。
import { base32Decode, base32Encode } from '$lib/crypto/encoding';
import { secureWipe } from '$lib/crypto/secure-wipe';

/** RK 原始字节数（96 位）。 */
const RECOVERY_KEY_BYTES = 12;

/**
 * 生成 Recovery Key（RK）并格式化为 20 字符 4-4-4-4-4 分组展示。
 * 12 字节随机 → base32 → 恰好 20 字符（整字节对齐、无信息损失）→ 分组（CryptoSpec §7.3）。
 *
 * @returns - "XXXX-XXXX-XXXX-XXXX-XXXX" 格式字符串
 */
export function generateRecoveryKey(): string {
  const raw = new Uint8Array(RECOVERY_KEY_BYTES); // 96 位
  crypto.getRandomValues(raw);

  const fullB32 = base32Encode(raw); // 20 字符
  secureWipe(raw); // 擦除原始随机字节（调用方经 parseRecoveryKey 重新取得）

  // 按 4-4-4-4-4 分组用于用户抄写展示。
  // base32Encode(12 字节) 恒返回 20 字符（96 位 / 5 位每字符向上取整），
  // 20 整除 4 → 恒 5 组，无需 match 的 null 兜底。
  const groups: string[] = [];
  for (let i = 0; i < fullB32.length; i += 4) {
    groups.push(fullB32.slice(i, i + 4));
  }
  return groups.join('-');
}

/**
 * 将用户输入的 RK 展示格式还原为原始 12 字节。
 * 容忍分组连字符、大小写、空格、填充（由 base32Decode 统一规范化）。
 *
 * @param input - 用户输入的 RK（可含分隔符、小写）
 * @returns     - 12 字节原始 RK
 * @throws EncodingError - 非法字符 / 空串（base32Decode 抛出）
 */
export function parseRecoveryKey(input: string): Uint8Array {
  return base32Decode(input);
}
