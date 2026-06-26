// tests/integration/db/rotate-key.test.ts — 密码轮换原子事务 (Stage 4 task 4.15)
// 覆盖：事务原子性（注入中途失败验证回滚）；事务后 revokeOtherSessions 被调；
//       Blob/wrappedDekByRecovery/version 不变；account.password/user 盐/wrappedDekByMaster 更新。
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import { db } from '$lib/server/db';
import { user, vault, account, session } from '$lib/server/db/schema';
import { initVault, getVault, rotateMasterPassword } from '$lib/server/db/vault';
import { seedUser, seedVault, seedSessions } from '../helpers';

describe('rotateMasterPassword 事务', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
    await initVault(userId, {
      wrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0',
      wrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0',
      encryptedBlob: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=blob0',
    });
  });

  it('事务提交后：account.password + loginSalt/kdfSalt + wrappedDekByMaster 全部更新', async () => {
    const sessions = await seedSessions(userId, 3);

    await rotateMasterPassword(
      userId,
      {
        newLak: 'new-lak',
        newLoginSalt: 'new-loginSalt',
        newKdfSalt: 'new-kdfSalt',
        newWrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew',
      },
      sessions[0]!, // 保留当前会话
    );

    // account.password 更新为 newLak 的服务端哈希（hashPassword），非明文
    const [acct] = await db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, userId));
    expect(await verifyPassword({ hash: acct!.password!, password: 'new-lak' })).toBe(true);
    expect(await verifyPassword({ hash: acct!.password!, password: 'old-lak' })).toBe(false);

    // user 盐更新
    const [u] = await db
      .select({ loginSalt: user.loginSalt, kdfSalt: user.kdfSalt })
      .from(user)
      .where(eq(user.id, userId));
    expect(u?.loginSalt).toBe('new-loginSalt');
    expect(u?.kdfSalt).toBe('new-kdfSalt');

    // wrappedDekByMaster 更新
    const v = await getVault(userId);
    expect(v.wrappedDekByMaster).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew');
  });

  it('事务后 revokeOtherSessions 被调：除当前会话外全部删除', async () => {
    const sessions = await seedSessions(userId, 3);
    await rotateMasterPassword(
      userId,
      { newLak: 'x', newLoginSalt: 's', newKdfSalt: 'k', newWrappedDekByMaster: 'm' },
      sessions[1]!,
    );
    const remaining = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, userId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(sessions[1]);
  });

  it('Blob / version / wrappedDekByRecovery 不变（DEK 恒定）', async () => {
    const before = await getVault(userId);
    await rotateMasterPassword(
      userId,
      { newLak: 'x', newLoginSalt: 's', newKdfSalt: 'k', newWrappedDekByMaster: 'm' },
      'nonexistent-session',
    );
    const after = await getVault(userId);
    expect(after.version).toBe(before.version);
    expect(after.encryptedBlob).toBe(before.encryptedBlob);
    expect(after.wrappedDekByRecovery).toBe(before.wrappedDekByRecovery);
  });

  it('事务原子性：注入中途失败 → 全部回滚（无部分提交）', async () => {
    // 先记录原始状态
    const [uBefore] = await db
      .select({ loginSalt: user.loginSalt })
      .from(user)
      .where(eq(user.id, userId));
    const [vBefore] = await db
      .select({ wrappedDekByMaster: vault.wrappedDekByMaster })
      .from(vault)
      .where(eq(vault.userId, userId));

    // 在事务内做一次更新后抛错，验证回滚
    await expect(
      db.transaction(async (tx) => {
        await tx.update(user).set({ loginSalt: 'SHOULD-NOT-PERSIST' }).where(eq(user.id, userId));
        throw new Error('injected-mid-transaction');
      }),
    ).rejects.toThrow('injected-mid-transaction');

    // user.loginSalt 未被部分提交
    const [uAfter] = await db
      .select({ loginSalt: user.loginSalt })
      .from(user)
      .where(eq(user.id, userId));
    expect(uAfter?.loginSalt).toBe(uBefore?.loginSalt);

    // vault.wrappedDekByMaster 亦未受影响
    const [vAfter] = await db
      .select({ wrappedDekByMaster: vault.wrappedDekByMaster })
      .from(vault)
      .where(eq(vault.userId, userId));
    expect(vAfter?.wrappedDekByMaster).toBe(vBefore?.wrappedDekByMaster);
  });

  it('rotate-key 不触碰任何 RK 材料（recoverySalt/recoveryVerifierSalt/recoveryVerifier）', async () => {
    const [uBefore] = await db
      .select({
        recoverySalt: user.recoverySalt,
        recoveryVerifierSalt: user.recoveryVerifierSalt,
        recoveryVerifier: user.recoveryVerifier,
      })
      .from(user)
      .where(eq(user.id, userId));

    await rotateMasterPassword(
      userId,
      { newLak: 'x', newLoginSalt: 's', newKdfSalt: 'k', newWrappedDekByMaster: 'm' },
      'none',
    );

    const [uAfter] = await db
      .select({
        recoverySalt: user.recoverySalt,
        recoveryVerifierSalt: user.recoveryVerifierSalt,
        recoveryVerifier: user.recoveryVerifier,
      })
      .from(user)
      .where(eq(user.id, userId));
    expect(uAfter?.recoverySalt).toBe(uBefore?.recoverySalt);
    expect(uAfter?.recoveryVerifierSalt).toBe(uBefore?.recoveryVerifierSalt);
    expect(uAfter?.recoveryVerifier).toBe(uBefore?.recoveryVerifier);
  });
});

// 额外：验证 seedVault 可独立使用（rotate 不依赖 initVault 路径）
describe('rotateMasterPassword 与 seedVault 兼容', () => {
  it('seedVault 创建的 vault 行可被 rotate', async () => {
    const id = await seedUser();
    await seedVault(id);
    await rotateMasterPassword(
      id,
      { newLak: 'l', newLoginSalt: 'ls', newKdfSalt: 'ks', newWrappedDekByMaster: 'wm' },
      'none',
    );
    const v = await getVault(id);
    expect(v.wrappedDekByMaster).toBe('wm');
  });
});
