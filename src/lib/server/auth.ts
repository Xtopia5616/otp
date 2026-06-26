// src/lib/server/auth.ts — Better Auth 服务端配置 (Design §5.2 / Architecture §2,§7,§8)
// 入口 `import '$server-only'`，客户端禁止导入。
//
// 依赖方向（Design §2.3 防环）：auth 仅依赖 db/index（连接实例）+ schema，**不 import
// db 查询文件**。db 查询文件可调本模块的会话吊销 / 密码哈希 API。
//
// 会话吊销：BA 的 revokeOtherSessions/revokeSessions 端点 requireHeaders（需当前会话上下文），
// 无法在无会话的 recover/reset 流程或事务提交后调用。故 revokeOtherSessions/revokeAllSessions
// 经 Drizzle 直接删除 session 表行实现（Architecture §8.2/§8.5）。
//
// 密码哈希（决策：Drizzle tx 直写密码列）：BA API 用独立 DB 连接、无法加入 Drizzle 事务，
// 故 rotate-key/recover-reset 事务内用本模块的 hashPassword 对 newLak 哈希后，经 Drizzle tx
// 直接更新 account.password 列；事务提交后才调 revoke*。updatePasswordHash 为非事务的独立变体。
import '$server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { passkey } from '@better-auth/passkey';
import { hashPassword } from 'better-auth/crypto';
import { and, eq, ne } from 'drizzle-orm';
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$env/static/private';
import { NotFoundError } from '$lib/models/errors';
import { db } from './db';
import { session, account, passkey as passkeyTable } from './db/schema';
import * as schema from './db/schema';

/**
 * Passkey 插件配置（Design §5.2「PRF 扩展注入点」）。
 * rp 信息由 BETTER_AUTH_URL 派生；PRF 的 `extensions.prf.eval` 由客户端 webauthn/prf.ts
 * （Stage 6）叠加到 BA 生成的基础选项上，服务端此处仅提供 rp 与基础选项。
 */
export const passkeyPluginConfig = {
  rpID: new URL(BETTER_AUTH_URL).hostname,
  rpName: 'WebOTP',
  origin: BETTER_AUTH_URL,
};

export const auth = betterAuth({
  database: drizzleAdapter(db, { schema, provider: 'pg' }),
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  emailAndPassword: { enabled: true },
  user: {
    // WebOTP 扩展字段（Architecture §4）：KDF 参数 / 5 盐 / recoveryVerifier / prfSalt。
    // 注册时由客户端提交（input:true）；rotate/recover 经 Drizzle tx 直写，不走 BA updateUser。
    additionalFields: {
      kdfAlgo: { type: 'string', required: false, defaultValue: 'argon2id', input: true },
      kdfMemoryKiB: { type: 'number', required: true, input: true },
      kdfIterations: { type: 'number', required: true, input: true },
      kdfParallelism: { type: 'number', required: true, input: true },
      loginSalt: { type: 'string', required: true, input: true },
      kdfSalt: { type: 'string', required: true, input: true },
      recoverySalt: { type: 'string', required: true, input: true },
      recoveryVerifierSalt: { type: 'string', required: true, input: true },
      recoveryVerifier: { type: 'string', required: true, input: true },
      prfSalt: { type: 'string', required: false, input: true },
    },
  },
  plugins: [passkey(passkeyPluginConfig)],
});

/**
 * 对 LAK 做服务端侧哈希（BA 的 scrypt 哈希工具）。
 * rotate-key/recover-reset 事务内调用本函数后经 Drizzle tx 直写 account.password。
 */
export { hashPassword };

/**
 * 吊销指定会话（会话管理 UI：DELETE /api/session/:id）。
 * 经 Drizzle 删除 session 行，按 userId 范围限定（用户只能吊销自己的会话）。
 * 会话不存在/已过期/属他用户 → 0 行删除 → 抛 NotFoundError（路由→404）。
 */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  // 用户只能吊销自己的会话；按 userId 范围限定。会话不存在/已过期/属他用户 → 0 行 → 404。
  const deleted = await db
    .delete(session)
    .where(and(eq(session.userId, userId), eq(session.id, sessionId)))
    .returning({ id: session.id });
  if (deleted.length === 0) {
    throw new NotFoundError(new Response(null, { status: 404 }));
  }
}

/**
 * 吊销用户除当前会话外的所有活动会话（密码轮换后，Architecture §8.2）。
 * 经 Drizzle 直接删除 session 表行（BA 端点需会话上下文，不适用于事务后调用）。
 */
export async function revokeOtherSessions(userId: string, exceptSessionId: string): Promise<void> {
  await db.delete(session).where(and(eq(session.userId, userId), ne(session.id, exceptSessionId)));
}

/**
 * 吊销用户全部活动会话（恢复重置后，Architecture §8.5）。
 * recover/reset 无会话，故经 Drizzle 直接删除该用户全部 session 行。
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId));
}

/**
 * 吊销 BA WebAuthn 凭证（DELETE /api/passkey-wraps/:credentialId 时一并调用）。
 * 经 Drizzle 删除 passkey 表行（BA 凭证表），使该 Passkey 无法再用于登录。
 * 幂等：行不存在（已被其他设备删除）→ 0 行删除，不抛错（与 WebOTP passkeyWrap 行分别存储）。
 */
export async function revokePasskeyCredential(userId: string, credentialId: string): Promise<void> {
  await db
    .delete(passkeyTable)
    .where(and(eq(passkeyTable.userId, userId), eq(passkeyTable.credentialID, credentialId)));
}

/**
 * 覆盖 BA 密码哈希（非事务独立变体）。
 * 哈希 newLak 后更新 account.password（email/password 路径 providerId='credential'）。
 * rotate-key/recover-reset 为保证原子性，在 Drizzle 事务内用 hashPassword + tx 直写，
 * 不调用本函数；本函数供独立改密场景使用。
 */
export async function updatePasswordHash(userId: string, newLak: string): Promise<void> {
  const passwordHash = await hashPassword(newLak);
  await db
    .update(account)
    .set({ password: passwordHash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
}
