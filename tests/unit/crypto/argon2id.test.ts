// tests/unit/crypto/argon2id.test.ts — Argon2id 派生单测 (Stage 2.10, Testing §4.1, CryptoSpec §2)
// ⚠️ 使用极小参数 (m=4096, t=1, p=1) 加速测试；生产参数 m=65536/t=3/p=4。
import { describe, it, expect } from 'vitest';
import { deriveKEK, deriveRecoveryVerifier } from '$lib/crypto/argon2';
import { KdfError } from '$lib/crypto/errors';
import { ARGON2ID_TEST_PARAMS } from '../../fixtures/argon2id-test-params';
import { TEST_SALT, TEST_SALT_2, TEST_MP } from '../../fixtures/crypto-constants';

/** 将 TEST_MP 编码为 UTF-8 字节（deriveKEK 接受 Uint8Array）。 */
const mpBytes = () => new TextEncoder().encode(TEST_MP);

describe('deriveKEK — 派生确定性', () => {
  it('相同输入产生相同输出', async () => {
    const r1 = await deriveKEK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    const r2 = await deriveKEK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    expect(r1).toEqual(r2);
  });

  it('输出长度恒为 32 字节', async () => {
    const result = await deriveKEK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    expect(result.byteLength).toBe(32);
  });

  it('不同密码产生不同输出', async () => {
    const r1 = await deriveKEK(
      new TextEncoder().encode('password1'),
      TEST_SALT,
      ARGON2ID_TEST_PARAMS,
    );
    const r2 = await deriveKEK(
      new TextEncoder().encode('password2'),
      TEST_SALT,
      ARGON2ID_TEST_PARAMS,
    );
    expect(r1).not.toEqual(r2);
  });

  it('不同盐值产生不同输出（路径隔离）', async () => {
    const r1 = await deriveKEK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    const r2 = await deriveKEK(mpBytes(), TEST_SALT_2, ARGON2ID_TEST_PARAMS);
    expect(r1).not.toEqual(r2);
  });
});

describe('deriveKEK — 参数非法抛 KdfError', () => {
  it('salt 长度 ≠ 16 抛 KdfError', async () => {
    await expect(deriveKEK(mpBytes(), new Uint8Array(15), ARGON2ID_TEST_PARAMS)).rejects.toThrow(
      KdfError,
    );
  });

  it('iterations < 1 抛 KdfError', async () => {
    await expect(
      deriveKEK(mpBytes(), TEST_SALT, { ...ARGON2ID_TEST_PARAMS, iterations: 0 }),
    ).rejects.toThrow(KdfError);
  });

  it('parallelism < 1 抛 KdfError', async () => {
    await expect(
      deriveKEK(mpBytes(), TEST_SALT, { ...ARGON2ID_TEST_PARAMS, parallelism: 0 }),
    ).rejects.toThrow(KdfError);
  });

  it('memoryKiB < 1 抛 KdfError', async () => {
    await expect(
      deriveKEK(mpBytes(), TEST_SALT, { ...ARGON2ID_TEST_PARAMS, memoryKiB: 0 }),
    ).rejects.toThrow(KdfError);
  });

  it('KdfError 错误消息包含实际 salt 长度', async () => {
    try {
      await deriveKEK(mpBytes(), new Uint8Array(8), ARGON2ID_TEST_PARAMS);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(KdfError);
      expect((e as Error).message).toContain('16 bytes');
    }
  });

  it('hash-wasm 执行失败（memorySize < 8*parallelism）包装为 KdfError', async () => {
    // assertParams 通过（memoryKiB/parallelism 均 ≥1），但 hash-wasm 要求 memorySize ≥ 8*parallelism
    await expect(
      deriveKEK(mpBytes(), TEST_SALT, { ...ARGON2ID_TEST_PARAMS, memoryKiB: 1, parallelism: 8 }),
    ).rejects.toThrow(KdfError);
  });
});

describe('deriveRecoveryVerifier — RK verifier 派生', () => {
  const rkBytes = new Uint8Array(12).fill(0x07);

  it('输出为 base64 编码的 32 字节（44 字符）', async () => {
    const verifier = await deriveRecoveryVerifier(rkBytes, TEST_SALT, ARGON2ID_TEST_PARAMS);
    expect(typeof verifier).toBe('string');
    expect(verifier.length).toBe(44); // base64(32 字节) = 44 字符（含填充）
    expect(() => atob(verifier)).not.toThrow();
  });

  it('确定性：相同输入相同 verifier', async () => {
    const r1 = await deriveRecoveryVerifier(rkBytes, TEST_SALT, ARGON2ID_TEST_PARAMS);
    const r2 = await deriveRecoveryVerifier(rkBytes, TEST_SALT, ARGON2ID_TEST_PARAMS);
    expect(r1).toBe(r2);
  });

  it('不同盐值产生不同 verifier（recovery_salt ≠ recovery_verifier_salt 隔离）', async () => {
    const r1 = await deriveRecoveryVerifier(rkBytes, TEST_SALT, ARGON2ID_TEST_PARAMS);
    const r2 = await deriveRecoveryVerifier(rkBytes, TEST_SALT_2, ARGON2ID_TEST_PARAMS);
    expect(r1).not.toBe(r2);
  });

  it('不同 RK 产生不同 verifier', async () => {
    const r1 = await deriveRecoveryVerifier(rkBytes, TEST_SALT, ARGON2ID_TEST_PARAMS);
    const r2 = await deriveRecoveryVerifier(
      new Uint8Array(12).fill(0x08),
      TEST_SALT,
      ARGON2ID_TEST_PARAMS,
    );
    expect(r1).not.toBe(r2);
  });

  it('verifier 与 KEK（同盐同密码）不同用途隔离：LAK/verifier 路径独立', async () => {
    // verifier 用 RK 字节，KEK_MP 用 MP 字节——即使盐相同，输入不同必产生不同输出
    const verifier = await deriveRecoveryVerifier(rkBytes, TEST_SALT, ARGON2ID_TEST_PARAMS);
    const kek = await deriveKEK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    const verifierBytes = Uint8Array.from(atob(verifier), (c) => c.charCodeAt(0));
    expect(verifierBytes).not.toEqual(kek);
  });
});
