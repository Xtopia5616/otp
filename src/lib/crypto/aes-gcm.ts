// src/lib/crypto/aes-gcm.ts — AES-GCM-256 加解密核心 (Stage 2.4, CryptoSpec §3)
// SubtleCrypto 实现。IV 显式传入（纯核心）；便利函数内部随机 IV。
// AEAD tag 校验失败 → DecryptionError，绝不返回部分明文。
import { DecryptionError } from '$lib/crypto/errors';

/** AES-GCM IV 长度，固定 12 字节（96 位，NIST SP 800-38D 推荐）。 */
export const AES_GCM_IV_LENGTH = 12;

/**
 * 生成 AES-GCM 随机 IV（nonce）。
 * 每次加密操作必须生成新 IV，绝不复用（CryptoSpec §3.1）。
 *
 * @returns 12 字节密码学安全随机 Uint8Array
 */
export function generateIV(): Uint8Array {
  const iv = new Uint8Array(AES_GCM_IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * AES-GCM-256 加密（纯核心，IV 显式传入）。
 *
 * @param plaintext - 明文字节
 * @param key       - AES-GCM CryptoKey（需 `encrypt` 用途）
 * @param iv        - 12 字节 IV（调用方负责不复用）
 * @returns         - 密文 + 128 位 tag（Uint8Array）
 */
export async function encryptAesGcm(
  plaintext: Uint8Array,
  key: CryptoKey,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
    key,
    plaintext as BufferSource,
  );
  return new Uint8Array(ciphertext);
}

/**
 * AES-GCM-256 解密（纯核心，IV 显式传入）。
 *
 * @param ciphertext - 密文 + 128 位 tag
 * @param key        - AES-GCM CryptoKey（需 `decrypt` 用途）
 * @param iv         - 12 字节 IV（须与加密时一致）
 * @returns          - 明文字节
 * @throws DecryptionError - AEAD tag 校验失败（密钥不匹配/密文篡改）
 */
export async function decryptAesGcm(
  ciphertext: Uint8Array,
  key: CryptoKey,
  iv: Uint8Array,
): Promise<Uint8Array> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
      key,
      ciphertext as BufferSource,
    );
  } catch (e) {
    // AEAD 校验失败：SubtleCrypto 抛 DOMException (name: 'OperationError')
    if (e instanceof DOMException && e.name === 'OperationError') {
      throw new DecryptionError('AES-GCM authentication failed: wrong key or corrupted ciphertext');
    }
    throw e;
  }
  return new Uint8Array(plaintext);
}

/**
 * 便利函数：AES-GCM-256 加密，IV 由内部随机生成。
 * 返回 IV 与密文，供调用方序列化封装。
 *
 * @param plaintext - 明文字节
 * @param key       - AES-GCM CryptoKey（需 `encrypt` 用途）
 * @returns         - { iv: 12 字节随机 IV, ciphertext: 密文 + tag }
 */
export async function encryptAesGcmRandomIv(
  plaintext: Uint8Array,
  key: CryptoKey,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = generateIV();
  const ciphertext = await encryptAesGcm(plaintext, key, iv);
  return { iv, ciphertext };
}
