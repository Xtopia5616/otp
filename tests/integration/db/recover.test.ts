// tests/integration/db/recover.test.ts — recover 流程查询 (Stage 4 task 4.15)
// 覆盖：getRecoverMaterial/getRecoveryAuthContext 形状与 null 分支；
//       resetRecovery 事务原子性；事务后 revokeAllSessions 被调；DEK/Blob 不变；
//       account.password + user(RK 材料+MP 盐) + vault(两包装) 全部更新。
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import { db } from '$lib/server/db';
import { user, vault, account, session } from '$lib/server/db/schema';
import { initVault, getVault } from '$lib/server/db/vault';
import { getRecoverMaterial, getRecoveryAuthContext, resetRecovery } from '$lib/server/db/recover';
import { seedUser, seedSessions } from '../helpers';

const MASTER0 = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0';
const RECOVERY0 = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0';
const BLOB0 = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=blob0';

describe('recover 查询与重置事务', () => {
  let userId: string;
  let email: string;

  beforeEach(async () => {
    userId = await seedUser();
    // seedUser 不返回 email，按 id 约定回查
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
    if (!u) throw new Error('seed user 查询缺失');
    email = u.email;
    await initVault(userId, {
      wrappedDekByMaster: MASTER0,
      wrappedDekByRecovery: RECOVERY0,
      encryptedBlob: BLOB0,
    });
  });

  it('getRecoverMaterial 存在邮箱返回完整 RecoverInitResponse 形状（不含 recoveryVerifier）', async () => {
    const m = await getRecoverMaterial(email);
    expect(m).not.toBeNull();
    if (!m) throw new Error('getRecoverMaterial 返回 null');
    expect(m.kdfAlgo).toBe('argon2id');
    expect(m.kdfMemoryKiB).toBe(65536);
    expect(m.kdfIterations).toBe(3);
    expect(m.kdfParallelism).toBe(4);
    expect(m.recoverySalt).toBe('IjNEVWZ3iJmqu8zd7v8AEQ==');
    expect(m.recoveryVerifierSalt).toBe('M0RVZneImaq7zN3u/wARIg==');
    expect(m.wrappedDekByRecovery).toBe(RECOVERY0);
    expect(m.encryptedBlob).toBe(BLOB0);
    // 机密字段不外泄
    expect('recoveryVerifier' in m).toBe(false);
  });

  it('getRecoverMaterial 不存在邮箱返回 null', async () => {
    expect(await getRecoverMaterial('nobody@example.com')).toBeNull();
  });

  it('getRecoveryAuthContext 存在返回 userId + recoveryVerifier', async () => {
    const ctx = await getRecoveryAuthContext(email);
    expect(ctx).not.toBeNull();
    if (!ctx) throw new Error('getRecoveryAuthContext 返回 null');
    expect(ctx.userId).toBe(userId);
    expect(ctx.recoveryVerifier).toBe('RFVmd4iZqrvM3e7/ABEiMw==');
  });

  it('getRecoveryAuthContext 不存在返回 null', async () => {
    expect(await getRecoveryAuthContext('nobody@example.com')).toBeNull();
  });

  it('resetRecovery 提交后：account.password + user 全部 RK/MP 材料 + vault 两包装全部更新', async () => {
    const [before] = await db
      .select({ recoveryVerifier: user.recoveryVerifier })
      .from(user)
      .where(eq(user.id, userId));
    expect(before?.recoveryVerifier).toBe('RFVmd4iZqrvM3e7/ABEiMw==');

    await resetRecovery(userId, {
      email,
      recoveryVerifier: 'b64-recoveryVerifier-hash',
      newLak: 'new-lak',
      newLoginSalt: 'new-loginSalt',
      newKdfSalt: 'new-kdfSalt',
      newWrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew',
      newWrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recoveryNew',
      newRecoverySalt: 'new-recoverySalt',
      newRecoveryVerifierSalt: 'new-rvSalt',
      newRecoveryVerifier: 'new-recoveryVerifier-hash',
    });

    // account.password → newLak 的服务端哈希
    const [acct] = await db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, userId));
    if (!acct || acct.password === null) throw new Error('account password 行缺失');
    expect(await verifyPassword({ hash: acct.password, password: 'new-lak' })).toBe(true);
    expect(await verifyPassword({ hash: acct.password, password: 'old-lak' })).toBe(false);

    // user：MP 盐 + 全部 RK 材料更新
    const [u] = await db
      .select({
        loginSalt: user.loginSalt,
        kdfSalt: user.kdfSalt,
        recoverySalt: user.recoverySalt,
        recoveryVerifierSalt: user.recoveryVerifierSalt,
        recoveryVerifier: user.recoveryVerifier,
      })
      .from(user)
      .where(eq(user.id, userId));
    expect(u?.loginSalt).toBe('new-loginSalt');
    expect(u?.kdfSalt).toBe('new-kdfSalt');
    expect(u?.recoverySalt).toBe('new-recoverySalt');
    expect(u?.recoveryVerifierSalt).toBe('new-rvSalt');
    expect(u?.recoveryVerifier).toBe('new-recoveryVerifier-hash');

    // vault：两个 DEK 包装更新
    const v = await getVault(userId);
    expect(v.wrappedDekByMaster).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew');
    expect(v.wrappedDekByRecovery).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=recoveryNew');
  });

  it('resetRecovery 不动 Blob / version（DEK 恒定）', async () => {
    const before = await getVault(userId);
    await resetRecovery(userId, {
      email,
      recoveryVerifier: 'b64-recoveryVerifier-hash',
      newLak: 'x',
      newLoginSalt: 's',
      newKdfSalt: 'k',
      newWrappedDekByMaster: 'm',
      newWrappedDekByRecovery: 'r',
      newRecoverySalt: 'rs',
      newRecoveryVerifierSalt: 'rvs',
      newRecoveryVerifier: 'rv',
    });
    const after = await getVault(userId);
    expect(after.version).toBe(before.version);
    expect(after.encryptedBlob).toBe(before.encryptedBlob);
  });

  it('resetRecovery 事务后 revokeAllSessions 被调：该用户全部 session 删除', async () => {
    await seedSessions(userId, 3);
    await resetRecovery(userId, {
      email,
      recoveryVerifier: 'b64-recoveryVerifier-hash',
      newLak: 'x',
      newLoginSalt: 's',
      newKdfSalt: 'k',
      newWrappedDekByMaster: 'm',
      newWrappedDekByRecovery: 'r',
      newRecoverySalt: 'rs',
      newRecoveryVerifierSalt: 'rvs',
      newRecoveryVerifier: 'rv',
    });
    const remaining = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, userId));
    expect(remaining).toHaveLength(0);
  });

  it('事务原子性：注入中途失败 → 全部回滚（无部分提交）', async () => {
    const [uBefore] = await db
      .select({ loginSalt: user.loginSalt })
      .from(user)
      .where(eq(user.id, userId));
    const [vBefore] = await db
      .select({ wrappedDekByMaster: vault.wrappedDekByMaster })
      .from(vault)
      .where(eq(vault.userId, userId));

    await expect(
      db.transaction(async (tx) => {
        await tx.update(user).set({ loginSalt: 'SHOULD-NOT-PERSIST' }).where(eq(user.id, userId));
        throw new Error('injected-mid-transaction');
      }),
    ).rejects.toThrow('injected-mid-transaction');

    const [uAfter] = await db
      .select({ loginSalt: user.loginSalt })
      .from(user)
      .where(eq(user.id, userId));
    expect(uAfter?.loginSalt).toBe(uBefore?.loginSalt);

    const [vAfter] = await db
      .select({ wrappedDekByMaster: vault.wrappedDekByMaster })
      .from(vault)
      .where(eq(vault.userId, userId));
    expect(vAfter?.wrappedDekByMaster).toBe(vBefore?.wrappedDekByMaster);
  });
});
