// src/lib/crypto/envelope.ts — 信封加密组合逻辑 (Stage 2.5, CryptoSpec §3 / §4)
// DEK 生成/KEK 导入/包装解包/Blob 加解密。KEK 不接触 Blob，DEK 恒定，IV 不可复用。
//
// ⚠️ 偏差说明（CryptoSpec §3.3 / §3.4）：原规格要求 DEK extractable:false + wrapKey 包装。
// 实测 wrapKey 无法包装不可导出密钥（SubtleCrypto 内部调用 exportKey，抛 InvalidAccessError），
// 而『DEK 恒定 + 可被新 KEK 重新包装』（rotate-key / PRF 绑定）依赖 wrapKey。
// 经确认：DEK extractable:true（generateDEK 与 unwrapDek 均如此），raw 字节不暴露给 JS
// （wrapKey 原子完成导出+加密，代码从不显式 exportKey）；KEK 仍 extractable:false。
// 待 Stage 10 反向传播至 CryptoSpec §3.3/§3.4。
import type { Account } from '$lib/models/account';
import { serializeBlob, parseBlob } from '$lib/crypto/encoding';
import { generateIV, encryptAesGcm, decryptAesGcm } from '$lib/crypto/aes-gcm';
import { secureWipe } from '$lib/crypto/secure-wipe';
import { DecryptionError } from '$lib/crypto/errors';

/** 信封格式版本（当前恒为 1，CryptoSpec §4.4）。 */
const ENVELOPE_VERSION = 1;

/**
 * 将 Argon2id 派生的 32 字节原始 KEK 导入为不可导出的 CryptoKey（CryptoSpec §3.2）。
 * KEK 仅用于 wrapKey/unwrapKey，从不接触 Blob；extractable:false 防止导出。
 *
 * @param rawRek - 32 字节 Argon2id 输出
 * @returns      - CryptoKey（AES-GCM-256, extractable: false, wrapKey/unwrapKey）
 */
export async function importKEK(rawRek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawRek as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false
    ['wrapKey', 'unwrapKey'],
  );
}

/**
 * 注册时生成随机 DEK 并导入为 CryptoKey（CryptoSpec §3.3）。
 * DEK 一旦生成永不更换（恒定 DEK）。
 *
 * extractable:true —— wrapKey 需可导出以支持后续 re-wrap（见文件头偏差说明）。
 * raw 字节导入后立即擦除。
 *
 * @returns - CryptoKey（AES-GCM-256, extractable: true, encrypt/decrypt）
 */
export async function generateDEK(): Promise<CryptoKey> {
  const rawDek = new Uint8Array(32); // 256 位
  crypto.getRandomValues(rawDek);

  const dek = await crypto.subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM', length: 256 },
    true, // extractable: true（wrapKey 需要，见文件头）
    ['encrypt', 'decrypt'],
  );

  secureWipe(rawDek); // 立即覆写原始字节
  return dek;
}

/**
 * 用 KEK 包装 DEK，返回封装格式字符串（CryptoSpec §3.4）。
 * IV 由内部随机生成，生产 API 不接受外部 IV（Stage02 风险 note）。
 *
 * @param dek - 待包装的 DEK（CryptoKey, extractable: true）
 * @param kek - 用于包装的 KEK（CryptoKey, extractable: false）
 * @returns   - "v=1;iv=<base64>;ct=<base64>" 格式字符串
 */
export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const iv = generateIV();
  const wrappedBytes = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
    tagLength: 128,
  });
  return serializeBlob({
    version: ENVELOPE_VERSION,
    iv,
    ciphertext: new Uint8Array(wrappedBytes),
  });
}

/**
 * 用 KEK 解包包装后的 DEK（CryptoSpec §3.4）。
 *
 * @param wrapped - "v=1;iv=<base64>;ct=<base64>" 格式字符串
 * @param kek     - 用于解包的 KEK（CryptoKey, extractable: false）
 * @returns       - 解包后的 DEK（CryptoKey, extractable: true, encrypt/decrypt）
 * @throws FormatError - 封装格式错误（parseBlob 抛出）
 * @throws DecryptionError - AEAD 校验失败（密钥不匹配/密文篡改）
 */
export async function unwrapDek(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  const { iv, ciphertext } = parseBlob(wrapped); // version===1 已由 parseBlob 保证

  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      ciphertext as BufferSource,
      kek,
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
      { name: 'AES-GCM', length: 256 },
      true, // extractable: true（re-wrap 需要，见文件头）
      ['encrypt', 'decrypt'],
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === 'OperationError') {
      throw new DecryptionError('AEAD authentication failed: wrong KEK or corrupted ciphertext');
    }
    throw e;
  }
}

/**
 * 加密 Vault Blob（CryptoSpec §4.6）。
 *
 * @param accounts - Account[] 明文
 * @param dek      - DEK（CryptoKey, encrypt 用途）
 * @returns        - "v=1;iv=<base64>;ct=<base64>" 格式字符串
 */
export async function encryptBlob(accounts: Account[], dek: CryptoKey): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(accounts));
  const iv = generateIV();
  const ciphertext = await encryptAesGcm(plaintext, dek, iv);
  secureWipe(plaintext); // 覆写明文字节
  return serializeBlob({ version: ENVELOPE_VERSION, iv, ciphertext });
}

/**
 * 解密 Vault Blob（CryptoSpec §4.6）。
 *
 * @param encoded - "v=1;iv=<base64>;ct=<base64>" 格式字符串
 * @param dek     - DEK（CryptoKey, decrypt 用途）
 * @returns       - Account[] 明文
 * @throws FormatError - 封装格式错误（parseBlob 抛出）
 * @throws DecryptionError - AEAD 失败或解密后内容非合法 JSON
 */
export async function decryptBlob(encoded: string, dek: CryptoKey): Promise<Account[]> {
  const { iv, ciphertext } = parseBlob(encoded); // version===1 已由 parseBlob 保证

  const plaintext = await decryptAesGcm(ciphertext, dek, iv); // AEAD 失败 → DecryptionError

  const text = new TextDecoder().decode(plaintext);
  try {
    return JSON.parse(text) as Account[];
  } catch (e) {
    throw new DecryptionError('decrypted blob is not valid JSON', { cause: e });
  }
}
