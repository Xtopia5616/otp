// tests/unit/crypto/secure-wipe.test.ts — 内存擦除单测 (Stage 2.12, CryptoSpec §9.1)
import { describe, it, expect } from 'vitest';
import { secureWipe } from '$lib/crypto/secure-wipe';

describe('secureWipe', () => {
  it('overwrites content so it differs from the original', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const snapshot = new Uint8Array(original);
    secureWipe(original);
    // 擦除后内容与原值不同（极大概率；随机覆写后再 fill(0) → 全零）
    expect(original).not.toEqual(snapshot);
  });

  it('fills with zeros after wiping (random → zero)', () => {
    const arr = new Uint8Array(32).fill(0xab);
    secureWipe(arr);
    // CryptoSpec §9.1：随机覆写后 fill(0)，最终为全零
    expect(Array.from(arr)).toEqual(Array(32).fill(0));
  });

  it('mutates in place (same buffer reference)', () => {
    const arr = new Uint8Array([9, 9, 9]);
    const ref = arr;
    secureWipe(arr);
    expect(ref).toBe(arr); // 原地修改，引用不变
    expect(ref[0]).toBe(0);
  });
});
