// src/lib/crypto/secure-wipe.ts — 敏感字节原地覆写 (Stage 2.8, CryptoSpec §9.1)
// 用密码学安全随机字节覆写全部内容，再零填充（随机→零，防止随机数与原内容区分）。
// 原地修改传入的 Uint8Array，无返回值。

/**
 * 安全擦除 Uint8Array 内容。
 * 先用 `crypto.getRandomValues()` 原地覆写，再 `fill(0)`。
 *
 * @param arr - 待擦除的字节数组（原地修改）
 */
export function secureWipe(arr: Uint8Array): void {
  crypto.getRandomValues(arr as Uint8Array<ArrayBuffer>);
  arr.fill(0);
}
