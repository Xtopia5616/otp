// src/lib/server/db/schema/verification.ts — Better Auth verification 表
// BA verificationSchema 对齐（Better Auth 1.6）。BA 用于邮箱验证令牌等，WebOTP 不直接查询。
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export type Verification = typeof verification.$inferSelect;
