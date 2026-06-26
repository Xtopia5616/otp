// src/lib/server/db/user.ts — user 表查询 (Design §5.1, task 4.6)
// 依赖方向：db → schema + models。
import '$server-only';
import { eq } from 'drizzle-orm';

import type { AuthParamsResponse } from '$lib/models/api';

import { db } from './index';
import { user } from './schema';

/**
 * 按邮箱取鉴权参数（GET /api/auth-params?email=）。
 * 返回 KDF 参数 + loginSalt/kdfSalt/prfSalt。不存在邮箱返回 null（路由据此走反枚举伪参数）。
 *
 * 注：task 4.6 写作 getAuthParamsByEmail(userId)，但端点为 ?email= 且需支持反枚举分支，
 * 故以 email 为入参、null 表示不存在（param 名 userId 为文档笔误）。
 */
export async function getAuthParamsByEmail(email: string): Promise<AuthParamsResponse | null> {
  const [row] = await db
    .select({
      kdfAlgo: user.kdfAlgo,
      kdfMemoryKiB: user.kdfMemoryKiB,
      kdfIterations: user.kdfIterations,
      kdfParallelism: user.kdfParallelism,
      loginSalt: user.loginSalt,
      kdfSalt: user.kdfSalt,
      prfSalt: user.prfSalt,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!row) return null;

  return {
    kdfAlgo: row.kdfAlgo as 'argon2id',
    kdfMemoryKiB: row.kdfMemoryKiB,
    kdfIterations: row.kdfIterations,
    kdfParallelism: row.kdfParallelism,
    loginSalt: row.loginSalt,
    kdfSalt: row.kdfSalt,
    prfSalt: row.prfSalt,
  };
}

/**
 * 更新 loginSalt / kdfSalt（独立变体；rotateMasterPassword 事务内自行 tx 更新）。
 */
export async function updateUserSaltsAndKdf(
  userId: string,
  params: { loginSalt: string; kdfSalt: string },
): Promise<void> {
  await db
    .update(user)
    .set({ loginSalt: params.loginSalt, kdfSalt: params.kdfSalt, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

/**
 * 更新恢复材料（recoverySalt/recoveryVerifierSalt/recoveryVerifier）。
 * 独立变体；resetRecovery 事务内自行 tx 更新。
 */
export async function updateRecoveryMaterial(
  userId: string,
  params: {
    recoverySalt: string;
    recoveryVerifierSalt: string;
    recoveryVerifier: string;
  },
): Promise<void> {
  await db
    .update(user)
    .set({
      recoverySalt: params.recoverySalt,
      recoveryVerifierSalt: params.recoveryVerifierSalt,
      recoveryVerifier: params.recoveryVerifier,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}
