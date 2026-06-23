// tests/unit/crypto/aes-gcm.test.ts — AES-GCM-256 核心加解密单测 (Stage 2.10, Testing §4.2, CryptoSpec §3)
// 测试纯核心函数：encryptAesGcm/decryptAesGcm（IV 显式）、encryptAesGcmRandomIv、generateIV。
// 篡改（密文/IV/tag）均抛 DecryptionError；IV 不复用。
import { describe, it, expect } from 'vitest';
import {
  generateIV,
  encryptAesGcm,
  decryptAesGcm,
  encryptAesGcmRandomIv,
  AES_GCM_IV_LENGTH,
} from '$lib/crypto/aes-gcm';
import { DecryptionError } from '$lib/crypto/errors';
import { TEST_DEK, TEST_IV } from '../../fixtures/crypto-constants';

/** 导入测试 DEK 为 encrypt/decrypt CryptoKey。 */
async function makeKey(bytes = TEST_DEK): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const plaintext = new TextEncoder().encode('secret vault data');

describe('AES-GCM-256 — 加解密往返', () => {
  it('encrypt → decrypt 还原原始明文', async () => {
    const key = await makeKey();
    const ct = await encryptAesGcm(plaintext, key, TEST_IV);
    const pt = await decryptAesGcm(ct, key, TEST_IV);
    expect(pt).toEqual(plaintext);
  });

  it('密文长度 = 明文长度 + 16 字节 tag', async () => {
    const key = await makeKey();
    const ct = await encryptAesGcm(plaintext, key, TEST_IV);
    expect(ct.byteLength).toBe(plaintext.byteLength + 16);
  });
});

describe('AES-GCM-256 — AEAD 篡改检测', () => {
  it('修改密文 1 字节 → DecryptionError', async () => {
    const key = await makeKey();
    const ct = await encryptAesGcm(plaintext, key, TEST_IV);
    const tampered = new Uint8Array(ct);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    await expect(decryptAesGcm(tampered, key, TEST_IV)).rejects.toThrow(DecryptionError);
  });

  it('修改 IV 1 字节 → DecryptionError', async () => {
    const key = await makeKey();
    const ct = await encryptAesGcm(plaintext, key, TEST_IV);
    const badIv = new Uint8Array(TEST_IV);
    badIv[0] = (badIv[0] ?? 0) ^ 0x01;
    await expect(decryptAesGcm(ct, key, badIv)).rejects.toThrow(DecryptionError);
  });

  it('修改 tag 1 字节（密文末尾）→ DecryptionError', async () => {
    const key = await makeKey();
    const ct = await encryptAesGcm(plaintext, key, TEST_IV);
    const tampered = new Uint8Array(ct);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;
    await expect(decryptAesGcm(tampered, key, TEST_IV)).rejects.toThrow(DecryptionError);
  });

  it('密钥不匹配 → DecryptionError', async () => {
    const encKey = await makeKey();
    const decKey = await makeKey(new Uint8Array(32).fill(0x09));
    const ct = await encryptAesGcm(plaintext, encKey, TEST_IV);
    await expect(decryptAesGcm(ct, decKey, TEST_IV)).rejects.toThrow(DecryptionError);
  });

  it('DecryptionError 携带 code DECRYPTION_ERROR', async () => {
    const key = await makeKey();
    const ct = await encryptAesGcm(plaintext, key, TEST_IV);
    const tampered = new Uint8Array(ct);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    try {
      await decryptAesGcm(tampered, key, TEST_IV);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DecryptionError);
      expect((e as DecryptionError).code).toBe('DECRYPTION_ERROR');
    }
  });

  it('非 OperationError 错误原样向上抛出（错误算法密钥）', async () => {
    // AES-CBC 密钥用于 AES-GCM decrypt → InvalidAccessError（非 OperationError）
    // decryptAesGcm 不应吞掉，应原样 re-throw（非 DecryptionError）
    const cbcKey = await crypto.subtle.importKey('raw', TEST_DEK, { name: 'AES-CBC' }, false, [
      'decrypt',
    ]);
    const ct = new Uint8Array(32); // 占位密文；错误在密钥算法检查阶段触发
    try {
      await decryptAesGcm(ct, cbcKey, TEST_IV);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).not.toBeInstanceOf(DecryptionError);
      expect(e).toBeInstanceOf(DOMException);
    }
  });
});

describe('AES-GCM-256 — IV 生成与不复用', () => {
  it('generateIV 返回 12 字节', () => {
    const iv = generateIV();
    expect(iv.byteLength).toBe(AES_GCM_IV_LENGTH);
    expect(iv.byteLength).toBe(12);
  });

  it('两次 generateIV 产生不同 IV', () => {
    const iv1 = generateIV();
    const iv2 = generateIV();
    expect(iv1).not.toEqual(iv2);
  });

  it('encryptAesGcmRandomIv 两次加密同一明文产生不同 IV 与密文', async () => {
    const key = await makeKey();
    const r1 = await encryptAesGcmRandomIv(plaintext, key);
    const r2 = await encryptAesGcmRandomIv(plaintext, key);
    expect(r1.iv).not.toEqual(r2.iv);
    expect(r1.ciphertext).not.toEqual(r2.ciphertext);
  });

  it('encryptAesGcmRandomIv 返回的 IV 可用于解密还原明文', async () => {
    const key = await makeKey();
    const { iv, ciphertext } = await encryptAesGcmRandomIv(plaintext, key);
    const pt = await decryptAesGcm(ciphertext, key, iv);
    expect(pt).toEqual(plaintext);
  });
});
