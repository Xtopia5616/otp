// tests/integration/db/passkey-wrap.test.ts — passkey_wrap 表 CRUD (Stage 4 task 4.15)
// 覆盖：credentialId 重复→ConflictError；删除不存在→NotFoundError；多设备多行共存；
//       用户隔离（A 的 credentialId 不能被 B 删除/复用）；createdAt ISO。
import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictError, NotFoundError } from '$lib/models/errors';
import {
  listPasskeyWraps,
  createPasskeyWrap,
  deletePasskeyWrap,
} from '$lib/server/db/passkey-wrap';
import { seedUser } from '../helpers';

const wrap = (n: number) => `v=1;iv=AAAAAAAAAAAAAAAA;ct=prf${n}`;
const cred = (n: number) => `cred-${n}-${Math.random().toString(36).slice(2, 8)}`;

describe('passkey_wrap CRUD', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
  });

  it('空用户 listPasskeyWraps 返回空数组', async () => {
    expect(await listPasskeyWraps(userId)).toEqual([]);
  });

  it('createPasskeyWrap 返回行（id/credentialId/wrappedDekByPrf/createdAt ISO）', async () => {
    const c = cred(1);
    const row = await createPasskeyWrap(userId, { credentialId: c, wrappedDekByPrf: wrap(1) });
    expect(row.id).toBeTruthy();
    expect(row.credentialId).toBe(c);
    expect(row.wrappedDekByPrf).toBe(wrap(1));
    expect(() => new Date(row.createdAt).toISOString()).not.toThrow();
    expect(new Date(row.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('createPasskeyWrap 重复 credentialId → ConflictError', async () => {
    const c = cred(2);
    await createPasskeyWrap(userId, { credentialId: c, wrappedDekByPrf: wrap(2) });
    await expect(
      createPasskeyWrap(userId, { credentialId: c, wrappedDekByPrf: wrap(3) }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('多设备多 Passkey 共存（同用户多个 credentialId 各一行）', async () => {
    const cs = [cred(10), cred(11), cred(12)];
    for (let i = 0; i < cs.length; i++) {
      await createPasskeyWrap(userId, { credentialId: cs[i]!, wrappedDekByPrf: wrap(10 + i) });
    }
    const rows = await listPasskeyWraps(userId);
    expect(rows).toHaveLength(cs.length);
    expect(rows.map((r) => r.credentialId).sort()).toEqual([...cs].sort());
  });

  it('deletePasskeyWrap 后 list 不再含该行', async () => {
    const c = cred(20);
    await createPasskeyWrap(userId, { credentialId: c, wrappedDekByPrf: wrap(20) });
    await deletePasskeyWrap(userId, c);
    expect(await listPasskeyWraps(userId)).toEqual([]);
  });

  it('deletePasskeyWrap 不存在 → NotFoundError', async () => {
    await expect(deletePasskeyWrap(userId, 'no-such-credential')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('credentialId 全局唯一：B 用户复用 A 的 credentialId 也冲突', async () => {
    const userB = await seedUser();
    const c = cred(30);
    await createPasskeyWrap(userId, { credentialId: c, wrappedDekByPrf: wrap(30) });
    await expect(
      createPasskeyWrap(userB, { credentialId: c, wrappedDekByPrf: wrap(31) }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('用户隔离：B 用户不能删除 A 的 credentialId（NotFoundError）', async () => {
    const userB = await seedUser();
    const c = cred(40);
    await createPasskeyWrap(userId, { credentialId: c, wrappedDekByPrf: wrap(40) });
    await expect(deletePasskeyWrap(userB, c)).rejects.toBeInstanceOf(NotFoundError);
    // A 的行仍在
    expect((await listPasskeyWraps(userId)).map((r) => r.credentialId)).toContain(c);
  });
});
