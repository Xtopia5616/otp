// src/lib/server/db/schema/vault.ts — 零知识数据金库表（与 user 1:1，Architecture §4）
// userId 为主键并外键引用 user.id（onDelete cascade）。信封密钥的多个包装 + ZK 密文 Blob +
// OCC 版本号。仅 PUT /api/vault（Blob 更新）自增 version 并参与 CAS。
import { pgTable, text, bigint, timestamp } from 'drizzle-orm/pg-core';
import { user } from './user';

export const vault = pgTable('vault', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // --- 信封密钥的多个包装（均由各自 KEK 加密的同一 DEK）---
  wrappedDekByMaster: text('wrapped_dek_by_master').notNull(),
  wrappedDekByRecovery: text('wrapped_dek_by_recovery').notNull(),
  // --- ZK 密文 Blob（由恒定 DEK 加密，结构 "v=1;iv=...;ct=..."，见 Architecture §4.1）---
  encryptedBlob: text('encrypted_blob').notNull(),
  // --- OCC 版本号：初值 1，每次成功 PUT 自增 ---
  version: bigint('version', { mode: 'number' }).notNull().default(1),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export type Vault = typeof vault.$inferSelect;
