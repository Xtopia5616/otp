// tests/unit/crypto/hkdf.test.ts — HKDF-SHA256 PRF 派生单测 (Stage 2.10, Testing §4.4, CryptoSpec §5)
// deriveKEKPrf 返回不可导出 CryptoKey，故用 wrap/unwrap 等价性验证确定性与隔离。
import { describe, it, expect } from 'vitest';
import { deriveKEKPrf, HKDF_INFO } from '$lib/crypto/hkdf';
import { TEST_SALT, TEST_SALT_2, HKDF_INFO as FIXTURE_INFO } from '../../fixtures/crypto-constants';

const prfOutput = new Uint8Array(32).fill(0xcc); // 模拟 PRF_out

/** 生成 extractable:true 的 DEK（供 wrapKey 测试）。 */
async function makeDek(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** 用 kek 包装 dek，返回 IV 与密文。 */
async function wrapWith(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<{ iv: Uint8Array; wrapped: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const w = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv,
    tagLength: 128,
  });
  return { iv, wrapped: new Uint8Array(w) };
}

/** 用 kek 解包；失败返回 null（不抛）。 */
async function tryUnwrap(
  wrapped: Uint8Array,
  kek: CryptoKey,
  iv: Uint8Array,
): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      wrapped as BufferSource,
      kek,
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    return null;
  }
}

/**
 * 两个 KEK 是否等价：用 kek1 包装一个随机 DEK，用 kek2 解包。
 * 等价（同一密钥材料）→ 解包成功；不等价 → AEAD 失败返回 null。
 */
async function keysEquivalent(kek1: CryptoKey, kek2: CryptoKey): Promise<boolean> {
  const dek = await makeDek();
  const { iv, wrapped } = await wrapWith(dek, kek1);
  const unwrapped = await tryUnwrap(wrapped, kek2, iv);
  return unwrapped !== null;
}

/** 用原始 SubtleCrypto HKDF 派生参考 KEK（指定 info），用于验证 info 绑定。 */
async function rawHkdfKek(prfOut: Uint8Array, salt: Uint8Array, info: string): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', prfOut as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  const rawKey = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode(info),
    },
    hkdfKey,
    256,
  );
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

describe('HKDF-SHA256 — KEK_PRF 派生', () => {
  it('返回可用 wrapKey/unwrapKey 的 CryptoKey', async () => {
    const kek = await deriveKEKPrf(prfOutput, TEST_SALT);
    expect(kek).toBeInstanceOf(CryptoKey);
    expect(kek.extractable).toBe(false);
    expect(kek.usages).toContain('wrapKey');
    expect(kek.usages).toContain('unwrapKey');
    // 可正常包装/解包 DEK
    const dek = await makeDek();
    const { iv, wrapped } = await wrapWith(dek, kek);
    const unwrapped = await tryUnwrap(wrapped, kek, iv);
    expect(unwrapped).not.toBeNull();
  });

  it('相同输入产生相同 KEK（确定性）', async () => {
    const kek1 = await deriveKEKPrf(prfOutput, TEST_SALT);
    const kek2 = await deriveKEKPrf(prfOutput, TEST_SALT);
    expect(await keysEquivalent(kek1, kek2)).toBe(true);
  });

  it('不同 PRF 输出产生不同 KEK', async () => {
    const kek1 = await deriveKEKPrf(prfOutput, TEST_SALT);
    const kek2 = await deriveKEKPrf(new Uint8Array(32).fill(0xdd), TEST_SALT);
    expect(await keysEquivalent(kek1, kek2)).toBe(false);
  });

  it('不同 salt 产生不同 KEK', async () => {
    const kek1 = await deriveKEKPrf(prfOutput, TEST_SALT);
    const kek2 = await deriveKEKPrf(prfOutput, TEST_SALT_2);
    expect(await keysEquivalent(kek1, kek2)).toBe(false);
  });

  it('info 使用架构规定值 WebOTP/KEK-PRF/v1', () => {
    expect(HKDF_INFO).toBe('WebOTP/KEK-PRF/v1');
    expect(FIXTURE_INFO).toBe('WebOTP/KEK-PRF/v1');
  });

  it('deriveKEKPrf 绑定 HKDF_INFO（与原始 HKDF 同 info 等价）', async () => {
    const kek = await deriveKEKPrf(prfOutput, TEST_SALT);
    const refKek = await rawHkdfKek(prfOutput, TEST_SALT, HKDF_INFO);
    expect(await keysEquivalent(kek, refKek)).toBe(true);
  });

  it('不同 info 产生不同 KEK（用途隔离）', async () => {
    const kek = await deriveKEKPrf(prfOutput, TEST_SALT);
    const otherKek = await rawHkdfKek(prfOutput, TEST_SALT, 'WebOTP/KEK-OTHER/v1');
    expect(await keysEquivalent(kek, otherKek)).toBe(false);
  });
});
