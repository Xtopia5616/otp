// src/lib/server/db/vault.ts — vault 表查询：CAS / rotate / init / get (Design §5.1, Engineering §8.3)
// 依赖方向：db → schema + models + server/auth（rotate 事务后调 revokeOtherSessions）。
import '$server-only';
import { and, eq, sql } from 'drizzle-orm';

import { OccConflictError, ConflictError } from '$lib/models/errors';
import type { VaultCreateRequest, VaultCreateResponse, VaultResponse } from '$lib/models/vault';
import type { RotateKeyRequest } from '$lib/models/api';

import { db } from './index';
import { vault, user, account } from './schema';
import { hashPassword, revokeOtherSessions } from '../auth';

/**
 * 初始化 Vault（注册时，version=1）。userId 来自 BA 注册后的 user.id。
 * 不创建 user 行（user 行由 BA 注册写入含扩展字段）；仅插入 vault 行。
 */
export async function initVault(
  userId: string,
  req: VaultCreateRequest,
): Promise<VaultCreateResponse> {
  try {
    await db.insert(vault).values({
      userId,
      wrappedDekByMaster: req.wrappedDekByMaster,
      wrappedDekByRecovery: req.wrappedDekByRecovery,
      encryptedBlob: req.encryptedBlob,
    });
  } catch (e) {
    // vault.userId 为 PK：重复初始化（重复注册）→ PG 23505。
    // drizzle-orm 0.45 将 pg 错误包装为 DrizzleQueryError，PG code 位于 .cause.code。
    const code =
      typeof e === 'object' && e !== null && 'cause' in e
        ? (e as { cause?: { code?: string } }).cause?.code
        : (e as { code?: string }).code;
    if (code === '23505') {
      throw new ConflictError(new Response(null, { status: 409 }), { cause: e });
    }
    throw e;
  }
  return { version: 1 };
}

/**
 * 拉取当前 Vault。userId 是 vault 主键，必存在（已注册）。
 */
export async function getVault(userId: string): Promise<VaultResponse> {
  const [row] = await db
    .select({
      version: vault.version,
      encryptedBlob: vault.encryptedBlob,
      wrappedDekByMaster: vault.wrappedDekByMaster,
      wrappedDekByRecovery: vault.wrappedDekByRecovery,
      updatedAt: vault.updatedAt,
    })
    .from(vault)
    .where(eq(vault.userId, userId))
    .limit(1);

  if (!row) {
    throw new OccConflictError(`Vault 不存在：userId=${userId}`, 0, '', '');
  }

  return {
    version: row.version,
    encryptedBlob: row.encryptedBlob,
    wrappedDekByMaster: row.wrappedDekByMaster,
    wrappedDekByRecovery: row.wrappedDekByRecovery,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * CAS 更新 Vault Blob（OCC，Engineering §8.3 代码为准）。
 * `UPDATE SET version=version+1, encrypted_blob=?, updated_at=NOW()
 *  WHERE user_id=? AND version=expectedVersion`。
 * 影响 0 行 → 查当前行抛 OccConflictError 携 serverVersion/serverEncryptedBlob/serverWrappedDekByMaster。
 * 成功返回新 version。
 */
export async function updateVaultBlob(
  userId: string,
  expectedVersion: number,
  encryptedBlob: string,
): Promise<number> {
  const result = await db
    .update(vault)
    .set({
      encryptedBlob,
      version: sql`${vault.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(vault.userId, userId), eq(vault.version, expectedVersion)))
    .returning({ newVersion: vault.version });

  if (result.length === 0) {
    // OCC 冲突：expectedVersion 与服务端不匹配，查当前行
    const [current] = await db
      .select({
        version: vault.version,
        encryptedBlob: vault.encryptedBlob,
        wrappedDekByMaster: vault.wrappedDekByMaster,
      })
      .from(vault)
      .where(eq(vault.userId, userId))
      .limit(1);

    if (!current) {
      // vault 行不存在（用户未初始化 Vault）——以空状态返回，供调用方判定
      throw new OccConflictError(`Vault 不存在：userId=${userId}`, 0, '', '');
    }

    throw new OccConflictError(
      `OCC 冲突：期望版本 ${expectedVersion}，实际版本 ${current.version}`,
      current.version,
      current.encryptedBlob,
      current.wrappedDekByMaster,
    );
  }

  const updated = result[0];
  if (!updated) {
    throw new OccConflictError(`Vault 更新未返回行：userId=${userId}`, 0, '', '');
  }
  return updated.newVersion;
}

/**
 * 仅更新 wrappedDekByMaster（不动 Blob/version/wrappedDekByRecovery）。
 * 供密码轮换外部场景使用；rotateMasterPassword 事务内自行 tx 更新。
 */
export async function rotateWrappedDekByMaster(userId: string, newWrapped: string): Promise<void> {
  await db.update(vault).set({ wrappedDekByMaster: newWrapped }).where(eq(vault.userId, userId));
}

/**
 * 密码轮换原子事务（Architecture §8.2，Engineering §8.3）。
 * 单 db.transaction 内：哈希 newLak → 更新 account.password + user(loginSalt/kdfSalt)
 *  + vault.wrappedDekByMaster。Blob/version/wrappedDekByRecovery/passkey 行不动（DEK 恒定）。
 * 事务提交后调 auth.revokeOtherSessions（非事务内，Architecture §8.2 收尾）。
 *
 * 注：task 4.5 规定 rotateMasterPassword 自身负责事务后吊销（使 db 层测试可验证 revoke 被调），
 * 与 Design §6.2「路由层调 revoke」的表述有偏差——以 task 4.5 为准，路由不再单独吊销。
 */
export async function rotateMasterPassword(
  userId: string,
  params: RotateKeyRequest,
  exceptSessionId: string,
): Promise<void> {
  const passwordHash = await hashPassword(params.newLak);

  await db.transaction(async (tx) => {
    // 1. 更新 BA 密码哈希（account.password，email/password 路径 providerId='credential'）
    await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));

    // 2. 更新 loginSalt / kdfSalt
    await tx
      .update(user)
      .set({ loginSalt: params.newLoginSalt, kdfSalt: params.newKdfSalt, updatedAt: new Date() })
      .where(eq(user.id, userId));

    // 3. 更新 wrappedDekByMaster（同一 DEK 的新 KEK_MP 包装）
    //    Blob / version / wrappedDekByRecovery / passkey_wrap 不动（DEK 恒定）
    await tx
      .update(vault)
      .set({ wrappedDekByMaster: params.newWrappedDekByMaster })
      .where(eq(vault.userId, userId));
  });

  // 4. 事务提交后吊销其他设备会话（非事务内：BA 会话表经独立连接操作）
  await revokeOtherSessions(userId, exceptSessionId);
}
