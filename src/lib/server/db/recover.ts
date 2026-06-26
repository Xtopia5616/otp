// src/lib/server/db/recover.ts — recover 流程查询 (Design §5.1/§6.2, Architecture §8.5, task 4.8)
// 依赖方向：db → schema + models + server/auth（resetRecovery 事务后调 revokeAllSessions）。
import '$server-only';
import { and, eq } from 'drizzle-orm';

import type { RecoverInitResponse, RecoverResetRequest } from '$lib/models/api';

import { db } from './index';
import { user, vault, account } from './schema';
import { hashPassword, revokeAllSessions } from '../auth';

/**
 * 取恢复初始化材料（recover/init，无会话、限流）。
 * 不存在邮箱返回 null（路由据 anti-enumeration 返回形状一致的伪材料，Architecture §8.1/§8.5）。
 * 不返回 recoveryVerifier（机密，仅服务端重置授权校验用）。
 */
export async function getRecoverMaterial(email: string): Promise<RecoverInitResponse | null> {
  const [row] = await db
    .select({
      kdfAlgo: user.kdfAlgo,
      kdfMemoryKiB: user.kdfMemoryKiB,
      kdfIterations: user.kdfIterations,
      kdfParallelism: user.kdfParallelism,
      recoverySalt: user.recoverySalt,
      recoveryVerifierSalt: user.recoveryVerifierSalt,
      wrappedDekByRecovery: vault.wrappedDekByRecovery,
      encryptedBlob: vault.encryptedBlob,
    })
    .from(user)
    .innerJoin(vault, eq(user.id, vault.userId))
    .where(eq(user.email, email))
    .limit(1);

  if (!row) return null;

  return {
    kdfAlgo: row.kdfAlgo as 'argon2id',
    kdfMemoryKiB: row.kdfMemoryKiB,
    kdfIterations: row.kdfIterations,
    kdfParallelism: row.kdfParallelism,
    recoverySalt: row.recoverySalt,
    recoveryVerifierSalt: row.recoveryVerifierSalt,
    wrappedDekByRecovery: row.wrappedDekByRecovery,
    encryptedBlob: row.encryptedBlob,
  };
}

/**
 * 取恢复重置授权上下文（recover/reset 路由侧）。
 * 返回 userId + 存储 recoveryVerifier，供路由经 constant-time.safeEqualVerifier 校验。
 * 不存在邮箱返回 null（路由据此返回 403，不泄露用户存在性）。
 */
export async function getRecoveryAuthContext(
  email: string,
): Promise<{ userId: string; recoveryVerifier: string } | null> {
  const [row] = await db
    .select({ userId: user.id, recoveryVerifier: user.recoveryVerifier })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!row) return null;
  return { userId: row.userId, recoveryVerifier: row.recoveryVerifier };
}

/**
 * 恢复重置原子事务（Architecture §8.5）。
 * 单 db.transaction 内：哈希 newLak → 更新 account.password + user(loginSalt/kdfSalt/
 *  recoverySalt/recoveryVerifierSalt/recoveryVerifier) + vault(wrappedDekByMaster/
 *  wrappedDekByRecovery)。Blob/version 不动（DEK 恒定，恢复后离线数据/Passkey 包装仍可解密）。
 * 事务提交后调 auth.revokeAllSessions（非事务内，Architecture §8.5）。
 * 调用前须由路由完成 recoveryVerifier 常量时间校验（授权）。
 */
export async function resetRecovery(userId: string, req: RecoverResetRequest): Promise<void> {
  const passwordHash = await hashPassword(req.newLak);

  await db.transaction(async (tx) => {
    // 1. 更新 BA 密码哈希
    await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));

    // 2. 更新 MP 盐 + 全部 RK 材料
    await tx
      .update(user)
      .set({
        loginSalt: req.newLoginSalt,
        kdfSalt: req.newKdfSalt,
        recoverySalt: req.newRecoverySalt,
        recoveryVerifierSalt: req.newRecoveryVerifierSalt,
        recoveryVerifier: req.newRecoveryVerifier,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    // 3. 更新两个 DEK 包装（同一 DEK，新 KEK_MP / 新 KEK_RK）。Blob/version 不动。
    await tx
      .update(vault)
      .set({
        wrappedDekByMaster: req.newWrappedDekByMaster,
        wrappedDekByRecovery: req.newWrappedDekByRecovery,
      })
      .where(eq(vault.userId, userId));
  });

  // 4. 事务提交后吊销该用户全部活动会话（Architecture §8.5）
  await revokeAllSessions(userId);
}
