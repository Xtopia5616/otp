// tests/unit/otp/hotp.test.ts — HOTP 标准向量单测 (Stage 3.5, Testing §3.2, RFC 4226)
import { describe, it, expect } from 'vitest';
import { generateHOTP } from '$lib/otp/hotp';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('HOTP — RFC 4226 Appendix D (SHA1, 6 位)', () => {
  // Secret = "12345678901234567890" (ASCII, 20 字节)
  const secret = enc('12345678901234567890');

  const vectors: Array<{ counter: number; expected: string }> = [
    { counter: 0, expected: '755224' },
    { counter: 1, expected: '287082' },
    { counter: 2, expected: '359152' },
    { counter: 3, expected: '969429' },
    { counter: 4, expected: '338314' },
    { counter: 5, expected: '254676' },
    { counter: 6, expected: '287922' },
    { counter: 7, expected: '162583' },
    { counter: 8, expected: '399871' },
    { counter: 9, expected: '520489' },
  ];

  it.each(vectors)('counter=$counter → $expected', async ({ counter, expected }) => {
    const result = await generateHOTP({
      secret,
      algorithm: 'SHA1',
      digits: 6,
      counter: BigInt(counter),
    });
    expect(result).toBe(expected);
  });
});

describe('HOTP — SHA256 / SHA512 分支', () => {
  // RFC 4226 仅提供 SHA-1 向量；SHA-256/512 向量来自 RFC 6238 同源数据。
  // 此处验证算法分支不抛出且输出位数/格式正确。
  const secret256 = enc('12345678901234567890123456789012');
  const secret512 = enc('1234567890123456789012345678901234567890123456789012345678901234');

  it('SHA256 counter=0 生成 6 位码', async () => {
    const result = await generateHOTP({
      secret: secret256,
      algorithm: 'SHA256',
      digits: 6,
      counter: 0n,
    });
    expect(result).toMatch(/^\d{6}$/);
  });

  it('SHA512 counter=0 生成 6 位码', async () => {
    const result = await generateHOTP({
      secret: secret512,
      algorithm: 'SHA512',
      digits: 6,
      counter: 0n,
    });
    expect(result).toMatch(/^\d{6}$/);
  });

  it('SHA256 counter=0 生成 8 位码', async () => {
    const result = await generateHOTP({
      secret: secret256,
      algorithm: 'SHA256',
      digits: 8,
      counter: 0n,
    });
    expect(result).toMatch(/^\d{8}$/);
  });

  it('SHA512 counter=9 生成 8 位码', async () => {
    const result = await generateHOTP({
      secret: secret512,
      algorithm: 'SHA512',
      digits: 8,
      counter: 9n,
    });
    expect(result).toMatch(/^\d{8}$/);
  });
});

describe('HOTP — 跨算法一致性', () => {
  // 6 位码 == 8 位码的低 6 位（同 counter 同算法，仅模数不同）
  it('SHA1 counter=1：6 位码等于 8 位码后 6 位', async () => {
    const secret = enc('12345678901234567890');
    const code6 = await generateHOTP({ secret, algorithm: 'SHA1', digits: 6, counter: 1n });
    const code8 = await generateHOTP({ secret, algorithm: 'SHA1', digits: 8, counter: 1n });
    expect(code6).toBe(code8.slice(-6));
    // RFC 4226 counter=1 6 位 = 287082；8 位（= RFC 6238 time=59 T=1）= 94287082
    expect(code6).toBe('287082');
    expect(code8).toBe('94287082');
  });

  it('零填充：模结果不足 digits 位时前导补零', async () => {
    // RFC 6238 time=1111111109 SHA1 8 位 = 07081804（前导零）
    const secret = enc('12345678901234567890');
    // T = floor(1111111109/30) = 37037036
    const code = await generateHOTP({
      secret,
      algorithm: 'SHA1',
      digits: 8,
      counter: 37037036n,
    });
    expect(code).toBe('07081804');
    expect(code).toHaveLength(8);
  });
});
