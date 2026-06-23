// tests/unit/crypto/recovery-key.test.ts — RK 生成/解析单测 (Stage 2.11, CryptoSpec §7.3, Architecture §3.2)
import { describe, it, expect } from 'vitest';
import { generateRecoveryKey, parseRecoveryKey } from '$lib/crypto/recovery-key';
import { EncodingError } from '$lib/crypto/errors';
import { TEST_RK_BASE32 } from '../../fixtures/crypto-constants';

describe('Recovery Key — generate → parse 往返', () => {
  it('generate → parse 还原为 12 字节', () => {
    const display = generateRecoveryKey();
    const bytes = parseRecoveryKey(display);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(12); // 96 位 = 12 字节
  });

  it('每次 generate 产生不同的 RK', () => {
    const a = generateRecoveryKey();
    const b = generateRecoveryKey();
    expect(a).not.toBe(b);
  });
});

describe('Recovery Key — 展示格式', () => {
  it('generate 输出 20 字符 4-4-4-4-4 分组', () => {
    const display = generateRecoveryKey();
    // XXXX-XXXX-XXXX-XXXX-XXXX（base32 字母表 A-Z2-7）
    expect(display).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect(display.length).toBe(24); // 20 字符 + 4 连字符
  });
});

describe('Recovery Key — parse 容错', () => {
  it('容忍分组连字符', () => {
    const display = generateRecoveryKey();
    expect(parseRecoveryKey(display).byteLength).toBe(12);
  });

  it('容忍无连字符的连续形式', () => {
    const display = generateRecoveryKey();
    const continuous = display.replace(/-/g, '');
    expect(parseRecoveryKey(continuous)).toEqual(parseRecoveryKey(display));
  });

  it('容忍小写输入', () => {
    const display = generateRecoveryKey();
    const lower = display.toLowerCase();
    expect(parseRecoveryKey(lower)).toEqual(parseRecoveryKey(display));
  });

  it('容忍空格', () => {
    const display = generateRecoveryKey();
    const spaced = display.replace(/-/g, ' ');
    expect(parseRecoveryKey(spaced)).toEqual(parseRecoveryKey(display));
  });

  it('TEST_RK_BASE32 fixture 解码为 12 字节', () => {
    expect(parseRecoveryKey(TEST_RK_BASE32).byteLength).toBe(12);
  });
});

describe('Recovery Key — parse 拒绝', () => {
  it('非法字符抛 EncodingError', () => {
    // '!' 非法
    expect(() => parseRecoveryKey('XXXX-XXXX-XXXX-XXXX-XXX!')).toThrow(EncodingError);
  });

  it('空串抛 EncodingError', () => {
    expect(() => parseRecoveryKey('')).toThrow(EncodingError);
  });
});
