// src/lib/crypto/hkdf.ts — HKDF-SHA256 PRF 路径 KEK 派生 (Stage 2.6, CryptoSpec §5)
// WebAuthn PRF 输出为高熵字节，无需 Argon2id 慢哈希；用 HKDF-SHA256 派生 KEK_PRF。
// info 固定 'WebOTP/KEK-PRF/v1'（应用+用途+版本绑定），调用方不可控。

/** HKDF info 参数：应用标识 + 用途 + 版本（硬编码，CryptoSpec §5.4）。 */
export const HKDF_INFO = 'WebOTP/KEK-PRF/v1';

/**
 * 从 PRF_out 派生 KEK_PRF（不可导出的 AES-GCM-256 CryptoKey）。
 * HKDF-SHA256(prfOut, prfSalt, 'WebOTP/KEK-PRF/v1') → 256 位 → CryptoKey（CryptoSpec §5.3）。
 *
 * @param prfOut   - WebAuthn PRF 扩展输出（通常 32 字节高熵字节）
 * @param prfSalt  - 用户级盐（16 字节，存 user.prf_salt，所有 Passkey 共用）
 * @returns        - CryptoKey（AES-GCM-256, extractable: false, wrapKey/unwrapKey）
 */
export async function deriveKEKPrf(prfOut: Uint8Array, prfSalt: Uint8Array): Promise<CryptoKey> {
  // 1. PRF 输入导入为 HKDF 的 key（不可导出，deriveBits/deriveKey 用途）
  const hkdfKey = await crypto.subtle.importKey('raw', prfOut as BufferSource, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);

  // 2. HKDF-SHA256 派生 256 位原始密钥材料
  const rawKey = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: prfSalt as BufferSource,
      info: new TextEncoder().encode(HKDF_INFO),
    },
    hkdfKey,
    256,
  );

  // 3. 导入为 AES-GCM CryptoKey（不可导出，仅 wrapKey/unwrapKey）
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}
