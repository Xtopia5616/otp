// src/lib/server/constant-time.ts — 常量时间比较 (Design §5.5 / Architecture §8.5, task 4.13)
// recoveryVerifier 提交值与存储值的常量时间比较，防时序侧信道。
// recoveryVerifier 为 Argon2id 哈希串：正确 RK 时提交值与存储值等长且逐字节相等；
// 错误 RK 时哈希不同但等长（Argon2 输出长度由参数固定）。故先比长度（等长才进入
// timingSafeEqual），长度不等恒定返回 false。
import '$server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * 常量时间比较两个 verifier 字符串。
 * 长度不等 → 返回 false（不进入 timingSafeEqual，避免不等长抛错）。
 * 长度相等 → timingSafeEqual 逐字节常量时间比较。
 */
export function safeEqualVerifier(submitted: string, stored: string): boolean {
  const a = Buffer.from(submitted, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
