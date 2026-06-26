// src/lib/server/db/schema/account.ts — Better Auth account 表
// BA accountSchema 对齐（Better Auth 1.6）。email/password 登录的密码哈希存储于
// account.password（providerId='credential'）。rotate-key/recover-reset 事务内经
// Drizzle tx 直写本列（见 server/db/vault.ts / recover.ts，决策：Drizzle tx 直写密码列）。
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './user';

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
  scope: text('scope'),
  /** 服务端侧密码哈希（BA 对 LAK 再哈希）。email/password 路径 providerId='credential'。 */
  password: text('password'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export type Account = typeof account.$inferSelect;
