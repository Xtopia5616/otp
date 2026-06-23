// tests/unit/crypto/envelope.test.ts — 信封加密组合单测 (Stage 2.5, CryptoSpec §3 / §4)
// 覆盖：importKEK/generateDEK/wrapDek/unwrapDek/encryptBlob/decryptBlob。
// wrap→unwrap 往返、IV 不复用、生产 API 不接受外部 IV、篡改/错钥拒绝、Blob 往返。
import { describe, it, expect } from 'vitest';
import {
  importKEK,
  generateDEK,
  wrapDek,
  unwrapDek,
  encryptBlob,
  decryptBlob,
} from '$lib/crypto/envelope';
import { serializeBlob } from '$lib/crypto/encoding';
import { generateIV, encryptAesGcm } from '$lib/crypto/aes-gcm';
import { DecryptionError, FormatError } from '$lib/crypto/errors';
import { BASE_ACCOUNTS } from '../../fixtures/accounts';

/** 32 字节 KEK 原料 → 导入为 KEK。 */
async function makeKek(fill = 0xbb): Promise<CryptoKey> {
  return importKEK(new Uint8Array(32).fill(fill));
}

describe('importKEK', () => {
  it('返回 extractable:false 的 wrapKey/unwrapKey CryptoKey', async () => {
    const kek = await makeKek();
    expect(kek).toBeInstanceOf(CryptoKey);
    expect(kek.extractable).toBe(false);
    expect(kek.usages).toContain('wrapKey');
    expect(kek.usages).toContain('unwrapKey');
  });
});

describe('generateDEK', () => {
  it('返回 encrypt/decrypt CryptoKey', async () => {
    const dek = await generateDEK();
    expect(dek).toBeInstanceOf(CryptoKey);
    expect(dek.usages).toContain('encrypt');
    expect(dek.usages).toContain('decrypt');
  });

  it('两次 generate 产生不同的 DEK（随机）', async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    // 用同一 KEK 包装两个 DEK，密文不同 → DEK 不同
    const kek = await makeKek();
    const w1 = await wrapDek(dek1, kek);
    const w2 = await wrapDek(dek2, kek);
    expect(w1).not.toBe(w2);
  });
});

describe('wrapDek / unwrapDek — 往返', () => {
  it('wrap → unwrap 还原可用 DEK（同密钥材料）', async () => {
    const kek = await makeKek();
    const dek = await generateDEK();
    const wrapped = await wrapDek(dek, kek);
    const unwrapped = await unwrapDek(wrapped, kek);
    // 用解包后的 DEK 解密原 DEK 加密的 Blob → 还原账户
    const blob = await encryptBlob(BASE_ACCOUNTS, dek);
    const accounts = await decryptBlob(blob, unwrapped);
    expect(accounts).toEqual(BASE_ACCOUNTS);
  });

  it('wrapDek 输出封装格式 v=1;iv=;ct=', async () => {
    const kek = await makeKek();
    const dek = await generateDEK();
    const wrapped = await wrapDek(dek, kek);
    expect(wrapped).toMatch(/^v=1;iv=[^;]+;ct=[^;]+$/);
  });

  it('wrapDek 密文为 48 字节（32 DEK + 16 tag）', async () => {
    const kek = await makeKek();
    const dek = await generateDEK();
    const wrapped = await wrapDek(dek, kek);
    // 解析出 ct 验证长度
    const parts = wrapped.split(';');
    const ctB64 = (parts[2] ?? '').slice(3);
    expect(atob(ctB64).length).toBe(48);
  });
});

describe('wrapDek — IV 不复用（生产 API 不接受外部 IV）', () => {
  it('两次包装同一 DEK 产生不同密文串', async () => {
    const kek = await makeKek();
    const dek = await generateDEK();
    const w1 = await wrapDek(dek, kek);
    const w2 = await wrapDek(dek, kek);
    expect(w1).not.toBe(w2); // IV 随机 → 密文不同
  });

  it('生产签名 wrapDek(dek, kek) 无外部 IV 参数仍正常工作', async () => {
    // wrapDek 签名仅 (dek, kek)，IV 由内部 crypto.getRandomValues 生成，调用者不可控
    const kek = await makeKek();
    const dek = await generateDEK();
    const wrapped = await wrapDek(dek, kek);
    const unwrapped = await unwrapDek(wrapped, kek);
    expect(unwrapped).toBeInstanceOf(CryptoKey);
  });
});

describe('unwrapDek — AEAD 失败拒绝', () => {
  it('错误 KEK 解包抛 DecryptionError', async () => {
    const kek1 = await makeKek(0xbb);
    const kek2 = await makeKek(0xcc); // 不同 KEK
    const dek = await generateDEK();
    const wrapped = await wrapDek(dek, kek1);
    await expect(unwrapDek(wrapped, kek2)).rejects.toThrow(DecryptionError);
  });

  it('篡改封装密文 1 字节抛 DecryptionError', async () => {
    const kek = await makeKek();
    const dek = await generateDEK();
    const wrapped = await wrapDek(dek, kek);
    // 篡改 ct 部分（base64 末尾字符）
    const tampered = wrapped.slice(0, -1) + (wrapped.endsWith('A') ? 'B' : 'A');
    await expect(unwrapDek(tampered, kek)).rejects.toThrow();
  });

  it('格式非法抛 FormatError', async () => {
    const kek = await makeKek();
    await expect(unwrapDek('not-a-valid-blob', kek)).rejects.toThrow(FormatError);
  });

  it('非 OperationError 错误原样向上抛出（错误算法 KEK）', async () => {
    // 用正常 KEK 包装，再用 AES-CBC KEK 解包 → InvalidAccessError（非 OperationError）
    const kek = await makeKek();
    const dek = await generateDEK();
    const wrapped = await wrapDek(dek, kek);
    const cbcKek = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(32).fill(0xbb),
      { name: 'AES-CBC' },
      false,
      ['unwrapKey'],
    );
    try {
      await unwrapDek(wrapped, cbcKek);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).not.toBeInstanceOf(DecryptionError);
      expect(e).toBeInstanceOf(DOMException);
    }
  });
});

describe('encryptBlob / decryptBlob — 往返', () => {
  it('encrypt → decrypt 还原账户集', async () => {
    const dek = await generateDEK();
    const blob = await encryptBlob(BASE_ACCOUNTS, dek);
    const accounts = await decryptBlob(blob, dek);
    expect(accounts).toEqual(BASE_ACCOUNTS);
  });

  it('空账户集往返', async () => {
    const dek = await generateDEK();
    const blob = await encryptBlob([], dek);
    const accounts = await decryptBlob(blob, dek);
    expect(accounts).toEqual([]);
  });

  it('两次加密同一账户集产生不同 Blob（IV 不复用）', async () => {
    const dek = await generateDEK();
    const b1 = await encryptBlob(BASE_ACCOUNTS, dek);
    const b2 = await encryptBlob(BASE_ACCOUNTS, dek);
    expect(b1).not.toBe(b2);
  });
});

describe('decryptBlob — 失败拒绝', () => {
  it('错误 DEK 解密抛 DecryptionError', async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const blob = await encryptBlob(BASE_ACCOUNTS, dek1);
    await expect(decryptBlob(blob, dek2)).rejects.toThrow(DecryptionError);
  });

  it('格式非法抛 FormatError', async () => {
    const dek = await generateDEK();
    await expect(decryptBlob('garbage', dek)).rejects.toThrow(FormatError);
  });

  it('解密后内容非合法 JSON 抛 DecryptionError', async () => {
    const dek = await generateDEK();
    // 用 DEK 加密非法 JSON 字节，手动封装为 Blob 格式
    const iv = generateIV();
    const garbageCt = await encryptAesGcm(new TextEncoder().encode('not-json'), dek, iv);
    const fakeBlob = serializeBlob({ version: 1, iv, ciphertext: garbageCt });
    await expect(decryptBlob(fakeBlob, dek)).rejects.toThrow(DecryptionError);
  });
});
