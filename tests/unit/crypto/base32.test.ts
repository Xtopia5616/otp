// tests/unit/crypto/base32.test.ts — base32 编解码单测 (Stage 2.10, Testing §4.5, CryptoSpec §7)
import { describe, it, expect } from 'vitest';
import { base32Decode, base32Encode } from '$lib/crypto/encoding';
import { EncodingError } from '$lib/crypto/errors';
import { TEST_RK_BASE32 } from '../../fixtures/crypto-constants';

describe('base32 解码 — RFC 4648', () => {
  it('标准大写无填充 → 正确解码', () => {
    // "JBSWY3DPEHPK3PXP" = base32("Hello!\xde\xad\xbe\xef")
    const result = base32Decode('JBSWY3DPEHPK3PXP');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBe(10);
    expect(result).toEqual(
      new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]),
    );
  });

  it('大小写不敏感', () => {
    const upper = base32Decode('JBSWY3DPEHPK3PXP');
    const lower = base32Decode('jbswy3dpehpk3pxp');
    const mixed = base32Decode('JbSwY3dPeHpK3pXp');
    expect(upper).toEqual(lower);
    expect(upper).toEqual(mixed);
  });

  it('忽略空格', () => {
    const withSpaces = base32Decode('JBSW Y3DP EHPK 3PXP');
    const noSpaces = base32Decode('JBSWY3DPEHPK3PXP');
    expect(withSpaces).toEqual(noSpaces);
  });

  it('忽略连字符', () => {
    const withHyphens = base32Decode('JBSW-Y3DP-EHPK-3PXP');
    const noHyphens = base32Decode('JBSWY3DPEHPK3PXP');
    expect(withHyphens).toEqual(noHyphens);
  });

  it('忽略等号填充', () => {
    const withPadding = base32Decode('JBSWY3DPEHPK3PXP=');
    const noPadding = base32Decode('JBSWY3DPEHPK3PXP');
    expect(withPadding).toEqual(noPadding);
  });

  it('失败用例：非法字符抛 EncodingError', () => {
    // '!' 不在 base32 字母表 A-Z2-7 内
    expect(() => base32Decode('JBSWY3DPEHPK3PX!')).toThrow(EncodingError);
  });

  it('失败用例：空串抛 EncodingError', () => {
    expect(() => base32Decode('')).toThrow(EncodingError);
  });

  it('失败用例：仅空白/连字符/填充的空串抛 EncodingError', () => {
    expect(() => base32Decode('  -- == ')).toThrow(EncodingError);
  });

  it('恢复密钥格式 4-4-4-4-4 分组解码为 12 字节', () => {
    // Architecture §3.2：RK 为 96 位（12 字节），20 字符 base32，4-4-4-4-4 分组
    const result = base32Decode(TEST_RK_BASE32);
    expect(result.byteLength).toBe(12); // 96 位 = 12 字节
  });

  it('非法字符错误消息包含位置', () => {
    try {
      base32Decode('JBSW!3DP');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EncodingError);
      expect((e as Error).message).toContain('position 4');
    }
  });
});

describe('base32 编码 — 往返一致', () => {
  it('encode → decode 往返还原原始字节', () => {
    const original = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
    const encoded = base32Encode(original);
    const decoded = base32Decode(encoded);
    expect(decoded).toEqual(original);
  });

  it('12 字节编码恰好 20 字符（无填充）', () => {
    const bytes = new Uint8Array(12).fill(0x42);
    expect(base32Encode(bytes).length).toBe(20);
  });
});
