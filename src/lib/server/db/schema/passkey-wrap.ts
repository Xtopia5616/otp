// src/lib/server/db/schema/passkey-wrap.ts — Passkey PRF 包装表（与 user 1:N，Architecture §4）
// 每个 Passkey 各自独立包装同一 DEK（KEK_PRF 包装），支持多设备多 Passkey。
// 不动 vault 行、不参与 OCC。credentialId 唯一（重复→ConflictError）。
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './user';

export const passkeyWrap = pgTable('passkey_wrap', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** WebAuthn 凭证 ID（base64url）；与 BA passkey 表的 credentialID 值关联。 */
  credentialId: text('credential_id').notNull().unique(),
  /** "v=1;iv=...;ct=..." — 该 Passkey 的 KEK_PRF 包装的同一 DEK */
  wrappedDekByPrf: text('wrapped_dek_by_prf').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

export type PasskeyWrap = typeof passkeyWrap.$inferSelect;
