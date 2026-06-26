// tests/unit/otp/totp.test.ts — TOTP 标准向量单测 (Stage 3.5, Testing §3.1, RFC 6238)
import { describe, it, expect } from 'vitest';
import { generateTOTP, verifyTOTP } from '$lib/otp/totp';
import { generateHOTP } from '$lib/otp/hotp';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('TOTP — RFC 6238 Appendix B (8 位全向量)', () => {
  // RFC 6238 secret 按算法不同而不同（ASCII 字符串的 UTF-8 字节）：
  //   SHA1:   "12345678901234567890" (20 字节)
  //   SHA256: "12345678901234567890123456789012" (32 字节)
  //   SHA512: "1234567890123456789012345678901234567890123456789012345678901234" (64 字节)
  const secrets = {
    SHA1: enc('12345678901234567890'),
    SHA256: enc('12345678901234567890123456789012'),
    SHA512: enc('1234567890123456789012345678901234567890123456789012345678901234'),
  } as const;

  const vectors: Array<{ time: number; algo: 'SHA1' | 'SHA256' | 'SHA512'; expected: string }> = [
    { time: 59, algo: 'SHA1', expected: '94287082' },
    { time: 59, algo: 'SHA256', expected: '46119246' },
    { time: 59, algo: 'SHA512', expected: '90693936' },
    { time: 1111111109, algo: 'SHA1', expected: '07081804' },
    { time: 1111111109, algo: 'SHA256', expected: '68084774' },
    { time: 1111111109, algo: 'SHA512', expected: '25091201' },
    { time: 1111111111, algo: 'SHA1', expected: '14050471' },
    { time: 1111111111, algo: 'SHA256', expected: '67062674' },
    { time: 1111111111, algo: 'SHA512', expected: '99943326' },
    { time: 1234567890, algo: 'SHA1', expected: '89005924' },
    { time: 1234567890, algo: 'SHA256', expected: '91819424' },
    { time: 1234567890, algo: 'SHA512', expected: '93441116' },
    { time: 2000000000, algo: 'SHA1', expected: '69279037' },
    { time: 2000000000, algo: 'SHA256', expected: '90698825' },
    { time: 2000000000, algo: 'SHA512', expected: '38618901' },
    { time: 20000000000, algo: 'SHA1', expected: '65353130' },
    { time: 20000000000, algo: 'SHA256', expected: '77737706' },
    { time: 20000000000, algo: 'SHA512', expected: '47863826' },
  ];

  it.each(vectors)('time=$time algo=$algo → $expected', async ({ time, algo, expected }) => {
    const result = await generateTOTP({
      secret: secrets[algo],
      algorithm: algo,
      digits: 8,
      period: 30,
      time,
    });
    expect(result).toBe(expected);
  });
});

describe('TOTP — 6 位码（取 8 位低 6 位）', () => {
  const secret = enc('12345678901234567890');

  it('SHA1 time=59：6 位码 == 8 位码后 6 位', async () => {
    const code8 = await generateTOTP({
      secret,
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      time: 59,
    });
    const code6 = await generateTOTP({
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      time: 59,
    });
    expect(code6).toBe(code8.slice(-6));
  });

  it('SHA256 time=1234567890：6 位码 == 8 位码后 6 位', async () => {
    const code8 = await generateTOTP({
      secret: enc('12345678901234567890123456789012'),
      algorithm: 'SHA256',
      digits: 8,
      period: 30,
      time: 1234567890,
    });
    const code6 = await generateTOTP({
      secret: enc('12345678901234567890123456789012'),
      algorithm: 'SHA256',
      digits: 6,
      period: 30,
      time: 1234567890,
    });
    expect(code6).toBe(code8.slice(-6));
  });
});

describe('TOTP — 默认值与 period', () => {
  const secret = enc('12345678901234567890');

  it('period 缺省为 30：等同显式 period=30', async () => {
    const withPeriod = await generateTOTP({
      secret,
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      time: 59,
    });
    const defaultPeriod = await generateTOTP({
      secret,
      algorithm: 'SHA1',
      digits: 8,
      time: 59,
    });
    expect(defaultPeriod).toBe(withPeriod);
  });

  it('period=60：T=floor(59/60)=0，对应 counter=0', async () => {
    const result = await generateTOTP({
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 60,
      time: 59,
    });
    const direct = await generateHOTP({ secret, algorithm: 'SHA1', digits: 6, counter: 0n });
    expect(result).toBe(direct);
    expect(result).toBe('755224');
  });
});

describe('verifyTOTP — 窗口验证', () => {
  const secret = enc('12345678901234567890');
  const algorithm = 'SHA1';
  const digits = 6;
  const period = 30;
  const time = 1111111111; // T = 37037037

  it('当前周期 token → true', async () => {
    const token = await generateTOTP({ secret, algorithm, digits, period, time });
    expect(await verifyTOTP({ token, secret, algorithm, digits, period, time })).toBe(true);
  });

  it('前一周期 token（窗口内）→ true', async () => {
    const token = await generateTOTP({ secret, algorithm, digits, period, time: time - period });
    expect(await verifyTOTP({ token, secret, algorithm, digits, period, time })).toBe(true);
  });

  it('后一周期 token（窗口内）→ true', async () => {
    const token = await generateTOTP({ secret, algorithm, digits, period, time: time + period });
    expect(await verifyTOTP({ token, secret, algorithm, digits, period, time })).toBe(true);
  });

  it('前两周期 token（window=1 之外）→ false', async () => {
    const token = await generateTOTP({
      secret,
      algorithm,
      digits,
      period,
      time: time - 2 * period,
    });
    expect(await verifyTOTP({ token, secret, algorithm, digits, period, time })).toBe(false);
  });

  it('完全错误的 token → false', async () => {
    expect(await verifyTOTP({ token: '000000', secret, algorithm, digits, period, time })).toBe(
      false,
    );
  });

  it('window=0：仅当前周期通过，相邻周期失败', async () => {
    const token = await generateTOTP({ secret, algorithm, digits, period, time });
    const prevToken = await generateTOTP({
      secret,
      algorithm,
      digits,
      period,
      time: time - period,
    });
    expect(await verifyTOTP({ token, secret, algorithm, digits, period, window: 0, time })).toBe(
      true,
    );
    expect(
      await verifyTOTP({ token: prevToken, secret, algorithm, digits, period, window: 0, time }),
    ).toBe(false);
  });

  it('window=2：前两周期 token 通过', async () => {
    const token = await generateTOTP({
      secret,
      algorithm,
      digits,
      period,
      time: time - 2 * period,
    });
    expect(await verifyTOTP({ token, secret, algorithm, digits, period, window: 2, time })).toBe(
      true,
    );
  });
});
