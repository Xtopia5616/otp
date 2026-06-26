// src/lib/server/db/schema/session.ts — Better Auth session 表
// BA sessionSchema 对齐（Better Auth 1.6）。会话吊销经 Drizzle 直接删除本表行实现
// （BA 的 revokeOtherSessions/revokeSessions 端点 requireHeaders，无法在无会话的
// recover/reset 流程或事务后调用，见 server/auth.ts）。
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './user';

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export type Session = typeof session.$inferSelect;
