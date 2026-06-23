// tests/unit/crypto/blob-format.test.ts — Blob 封装格式单测 (Stage 2.10, Testing §4.3, CryptoSpec §4)
import { describe, it, expect } from 'vitest';
import { serializeBlob, parseBlob } from '$lib/crypto/encoding';
import { FormatError } from '$lib/crypto/errors';

describe('Blob 封装格式 — v=1;iv=<base64>;ct=<base64>', () => {
  const validBlob = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

  it('合法 Blob 解析成功', () => {
    const result = parseBlob(validBlob);
    expect(result.version).toBe(1);
    expect(result.iv).toBeInstanceOf(Uint8Array);
    expect(result.iv.byteLength).toBe(12);
    expect(result.ciphertext).toBeInstanceOf(Uint8Array);
    expect(result.ciphertext.byteLength).toBeGreaterThan(0);
  });

  it('serializeBlob → parseBlob 往返一致', () => {
    const iv = new Uint8Array(12).fill(0x00);
    const ct = new Uint8Array(48).fill(0x00);
    const serialized = serializeBlob({ version: 1, iv, ciphertext: ct });
    const parsed = parseBlob(serialized);
    expect(parsed.version).toBe(1);
    expect(parsed.iv).toEqual(iv);
    expect(parsed.ciphertext).toEqual(ct);
  });

  it('拒绝：缺少 v= 前缀', () => {
    expect(() => parseBlob('iv=AAAA;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：v= 非 1（未知版本）', () => {
    expect(() => parseBlob('v=2;iv=AAAA;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：v=0', () => {
    expect(() =>
      parseBlob('v=0;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
    ).toThrow(FormatError);
  });

  it('拒绝：缺少 iv= 字段', () => {
    expect(() => parseBlob('v=1;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：缺少 ct= 字段', () => {
    expect(() => parseBlob('v=1;iv=AAAA')).toThrow(FormatError);
  });

  it('拒绝：v 字段无 v= 前缀（3 段）', () => {
    expect(() => parseBlob('x=1;iv=AAAA;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：iv 字段无 iv= 前缀', () => {
    expect(() => parseBlob('v=1;x=AAAA;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：ct 字段无 ct= 前缀', () => {
    expect(() => parseBlob('v=1;iv=AAAAAAAAAAAAAAAA;x=AAAA')).toThrow(FormatError);
  });

  it('拒绝：iv 非法 base64', () => {
    expect(() => parseBlob('v=1;iv=!!!invalid!!!;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：ct 非法 base64', () => {
    expect(() => parseBlob('v=1;iv=AAAAAAAAAAAAAAAA;ct=!!!invalid!!!')).toThrow(FormatError);
  });

  it('拒绝：空字符串', () => {
    expect(() => parseBlob('')).toThrow(FormatError);
  });

  it('拒绝：iv 长度不为 12 字节', () => {
    // base64("short") = "c2hvcnQ=" → 5 字节，不是 12
    expect(() => parseBlob('v=1;iv=c2hvcnQ=;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：密文过短（< 16 字节，AES-GCM 最小输出）', () => {
    // base64("AAAA") → 3 字节 < 16
    expect(() => parseBlob('v=1;iv=AAAAAAAAAAAAAAAA;ct=AAAA')).toThrow(FormatError);
  });

  it('拒绝：字段数不为 3（多余分号）', () => {
    expect(() => parseBlob('v=1;iv=AAAA;ct=AAAA;extra=BBB')).toThrow(FormatError);
  });

  it('拒绝：version 非数字', () => {
    expect(() =>
      parseBlob('v=x;iv=AAAAAAAAAAAAAAAA;ct=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
    ).toThrow(FormatError);
  });
});
