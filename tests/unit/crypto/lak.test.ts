// tests/unit/crypto/lak.test.ts — LAK 派生单测 (Stage 2.10, Testing §4.6, CryptoSpec §6)
import { describe, it, expect } from 'vitest';
import { deriveLAK } from '$lib/crypto/argon2';
import { ARGON2ID_TEST_PARAMS } from '../../fixtures/argon2id-test-params';
import { TEST_MP, TEST_SALT, TEST_SALT_2 } from '../../fixtures/crypto-constants';

const mpBytes = () => new TextEncoder().encode(TEST_MP);

describe('LAK 派生', () => {
  it('输出为 base64 编码的 32 字节哈希（约 44 字符）', async () => {
    const lak = await deriveLAK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    expect(typeof lak).toBe('string');
    // base64(32 字节) = 44 字符（含填充）
    expect(lak.length).toBe(44);
    // 验证是合法 base64
    expect(() => atob(lak)).not.toThrow();
    // base64 解码后为 32 字节
    const decoded = atob(lak);
    expect(decoded.length).toBe(32);
  });

  it('确定性：相同输入相同 LAK', async () => {
    const r1 = await deriveLAK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    const r2 = await deriveLAK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    expect(r1).toBe(r2);
  });

  it('不同盐值产生不同 LAK（login_salt ≠ kdf_salt 隔离）', async () => {
    const r1 = await deriveLAK(mpBytes(), TEST_SALT, ARGON2ID_TEST_PARAMS);
    const r2 = await deriveLAK(mpBytes(), TEST_SALT_2, ARGON2ID_TEST_PARAMS);
    expect(r1).not.toBe(r2);
  });

  it('不同密码产生不同 LAK', async () => {
    const r1 = await deriveLAK(
      new TextEncoder().encode('password1'),
      TEST_SALT,
      ARGON2ID_TEST_PARAMS,
    );
    const r2 = await deriveLAK(
      new TextEncoder().encode('password2'),
      TEST_SALT,
      ARGON2ID_TEST_PARAMS,
    );
    expect(r1).not.toBe(r2);
  });
});
