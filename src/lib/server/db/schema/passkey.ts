// src/lib/server/db/schema/passkey.ts — Better Auth passkey 插件表
// @better-auth/passkey 的 Passkey 类型对齐（Better Auth 1.6）。
// 注意：本表是 BA 的 WebAuthn 凭证表（认证用），与 WebOTP 自有的 passkeyWrap 表（PRF 包装
// 的 DEK）不同。两者经凭证 ID 值关联，但分别存储。BA 字段名为 credentialID（大写 ID）。
import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { user } from './user';

export const passkey = pgTable('passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credential_id').notNull().unique(),
  counter: integer('counter').notNull().default(0),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: text('transports'),
  aaguid: text('aaguid'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

export type Passkey = typeof passkey.$inferSelect;
