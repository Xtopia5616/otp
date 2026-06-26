// tests/integration/helpers.ts — 集成测试 seed 工具
// 经 app db（search_path=webotp_test）直接插入 user/account/vault/session 行，
// 供 db 层查询测试使用（绕过 BA 注册流程，专注数据层）。
import { db } from '$lib/server/db';
import { user, account, vault, session } from '$lib/server/db/schema';
import type { VaultCreateRequest } from '$lib/models/vault';

/** 16 字节 hex → base64（24 字符），与 Architecture §4 真实盐形状一致。 */
const SALT = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');

export interface SeedUserOptions {
  id?: string;
  email?: string;
  prfSalt?: string | null;
}

/** 插入一个完整 user 行（含 BA 扩展字段）+ credential account 行，返回 userId。 */
export async function seedUser(opts: SeedUserOptions = {}): Promise<string> {
  const id = opts.id ?? `user-${crypto.randomUUID()}`;
  const email = opts.email ?? `${id}@example.com`;
  await db.insert(user).values({
    id,
    email,
    name: email,
    kdfAlgo: 'argon2id',
    kdfMemoryKiB: 65536,
    kdfIterations: 3,
    kdfParallelism: 4,
    // 真实盐均为 16 字节 base64（24 字符，Architecture §4），与 anti-enum 伪参数形状校验一致。
    loginSalt: SALT('00112233445566778899aabbccddeeff'),
    kdfSalt: SALT('112233445566778899aabbccddeeff00'),
    recoverySalt: SALT('2233445566778899aabbccddeeff0011'),
    recoveryVerifierSalt: SALT('33445566778899aabbccddeeff001122'),
    recoveryVerifier: SALT('445566778899aabbccddeeff00112233'),
    prfSalt: opts.prfSalt ?? null,
  });
  // email/password 路径的 credential account 行（rotate/recover 事务更新 account.password）
  await db.insert(account).values({
    id: `acct-${id}`,
    userId: id,
    providerId: 'credential',
    accountId: id,
    password: 'old-lak-hash',
  });
  return id;
}

/** 插入 vault 行（version=1）。req 缺省用占位密文。 */
export async function seedVault(userId: string, req?: Partial<VaultCreateRequest>): Promise<void> {
  await db.insert(vault).values({
    userId,
    wrappedDekByMaster: req?.wrappedDekByMaster ?? 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master1',
    wrappedDekByRecovery: req?.wrappedDekByRecovery ?? 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery1',
    encryptedBlob: req?.encryptedBlob ?? 'v=1;iv=AAAAAAAAAAAAAAAA;ct=blob1',
  });
}

/** 插入若干 session 行（测会话吊销）。返回插入的 session id 列表。 */
export async function seedSessions(userId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `sess-${userId}-${i}`;
    await db.insert(session).values({
      id,
      token: `tok-${id}`,
      userId,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    ids.push(id);
  }
  return ids;
}
