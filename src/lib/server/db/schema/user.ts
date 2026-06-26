// src/lib/server/db/schema/user.ts — user 表 (Architecture §4 + Engineering §3.2)
//
// Better Auth 的 user 表扩展：在 BA 基础字段（id/email/emailVerified/name/image/
// createdAt/updatedAt）之上追加 WebOTP 的 KDF 参数、5 盐与 recoveryVerifier。
// 字段名 camelCase ↔ 列名 snake_case（Engineering §3.2）。
// BA 基础字段须与 Better Auth 1.6 的 userSchema 对齐，否则 drizzleAdapter 映射失败。
import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

/**
 * Better Auth User 扩展表（Architecture §4）。
 * BA 基础字段 + WebOTP 扩展字段（KDF 参数 / 5 盐 / recoveryVerifier / prfSalt）。
 */
export const user = pgTable('user', {
  // --- Better Auth 基础字段 ---
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),

  // --- KDF 参数（随用户存储，支持日后调优 / 离线下发）---
  kdfAlgo: text('kdf_algo').notNull().default('argon2id'),
  kdfMemoryKiB: integer('kdf_memory_kib').notNull().default(65536), // m
  kdfIterations: integer('kdf_iterations').notNull().default(3), // t
  kdfParallelism: integer('kdf_parallelism').notNull().default(4), // p

  // --- 各用途独立盐值（16 字节，base64 存储，非机密）---
  loginSalt: text('login_salt').notNull(), // LAK 派生
  kdfSalt: text('kdf_salt').notNull(), // KEK_MP 派生
  recoverySalt: text('recovery_salt').notNull(), // KEK_RK 派生
  recoveryVerifierSalt: text('recovery_verifier_salt').notNull(), // recoveryVerifier 派生
  recoveryVerifier: text('recovery_verifier').notNull(), // Argon2id(RK, recovery_verifier_salt)，重置授权校验

  // --- PRF 盐（用户级，首次绑定时生成，所有 Passkey 共用）；可空 = 未绑定 Passkey ---
  prfSalt: text('prf_salt'),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
