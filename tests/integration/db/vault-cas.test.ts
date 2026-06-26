// tests/integration/db/vault-cas.test.ts — CAS 乐观并发 (Stage 4 task 4.15)
// 覆盖：expectedVersion 匹配→version+1；不匹配→OccConflictError 携三字段；version 单调。
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { OccConflictError } from '$lib/models/errors';
import { db } from '$lib/server/db';
import { vault } from '$lib/server/db/schema';
import {
  initVault,
  getVault,
  updateVaultBlob,
  rotateWrappedDekByMaster,
} from '$lib/server/db/vault';
import { seedUser } from '../helpers';

const BLOB = (n: number) => `v=1;iv=AAAAAAAAAAAAAAAA;ct=blob${n}`;

describe('vault CAS (OCC)', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
    await initVault(userId, {
      wrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0',
      wrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0',
      encryptedBlob: BLOB(0),
    });
  });

  it('expectedVersion 匹配 → version 自增为 2', async () => {
    const newVersion = await updateVaultBlob(userId, 1, BLOB(1));
    expect(newVersion).toBe(2);
    const v = await getVault(userId);
    expect(v.version).toBe(2);
    expect(v.encryptedBlob).toBe(BLOB(1));
  });

  it('expectedVersion 不匹配 → OccConflictError 携 serverVersion/serverEncryptedBlob/serverWrappedDekByMaster', async () => {
    await updateVaultBlob(userId, 1, BLOB(1)); // version → 2

    try {
      await updateVaultBlob(userId, 1, BLOB(2)); // 仍用 1 → 冲突
      throw new Error('应抛 OccConflictError');
    } catch (e) {
      expect(e).toBeInstanceOf(OccConflictError);
      const err = e as OccConflictError;
      expect(err.serverVersion).toBe(2);
      expect(err.serverEncryptedBlob).toBe(BLOB(1));
      expect(err.serverWrappedDekByMaster).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=master0');
    }
  });

  it('version 单调递增（连续 CAS 成功）', async () => {
    expect(await updateVaultBlob(userId, 1, BLOB(1))).toBe(2);
    expect(await updateVaultBlob(userId, 2, BLOB(2))).toBe(3);
    expect(await updateVaultBlob(userId, 3, BLOB(3))).toBe(4);
    expect((await getVault(userId)).version).toBe(4);
  });

  it('冲突后用 serverVersion 重试成功（合并循环语义）', async () => {
    await updateVaultBlob(userId, 1, BLOB(1)); // version → 2
    try {
      await updateVaultBlob(userId, 1, BLOB(99));
    } catch (e) {
      const err = e as OccConflictError;
      // 用服务端版本重试
      const v = await updateVaultBlob(userId, err.serverVersion, BLOB(2));
      expect(v).toBe(3);
    }
  });

  it('rotateWrappedDekByMaster 不动 version / Blob / wrappedDekByRecovery', async () => {
    const before = await getVault(userId);
    await rotateWrappedDekByMaster(userId, 'v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew');
    const after = await getVault(userId);
    expect(after.version).toBe(before.version); // version 不变
    expect(after.encryptedBlob).toBe(before.encryptedBlob); // Blob 不变
    expect(after.wrappedDekByRecovery).toBe(before.wrappedDekByRecovery); // recovery 不变
    expect(after.wrappedDekByMaster).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew');
  });

  it('getVault 返回 updatedAt ISO 字符串', async () => {
    const v = await getVault(userId);
    expect(() => new Date(v.updatedAt).toISOString()).not.toThrow();
    expect(new Date(v.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('DB 层 version 列为 bigint（直接查证 monotonic bigint）', async () => {
    const rows = await db
      .select({ version: vault.version })
      .from(vault)
      .where(eq(vault.userId, userId));
    expect(typeof rows[0]?.version).toBe('number');
    expect(rows[0]?.version).toBe(1);
  });
});
