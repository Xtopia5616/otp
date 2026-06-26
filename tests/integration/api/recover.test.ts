// tests/integration/api/recover.test.ts — POST /api/vault/recover/init + reset (Stage 5 task 5.13)
// 覆盖：init 成功（存在/不存在形状一致）/ 429 限流 + Retry-After / 伪材料形状一致；
//       reset 成功 + 403 verifier 失败 + 429；reset 后旧会话全吊销。
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { POST as INIT } from '../../../src/routes/api/vault/recover/init/+server';
import { POST as RESET } from '../../../src/routes/api/vault/recover/reset/+server';
import { __resetForTest } from '$lib/server/rate-limit';
import { derivePseudoRecoveryMaterial } from '$lib/server/anti-enumeration';
import { db } from '$lib/server/db';
import { user, session } from '$lib/server/db/schema';
import { initVault } from '$lib/server/db/vault';
import { mockEvent, readJson } from './helpers';
import { seedUser, seedSessions } from '../helpers';

// 限流默认 maxAttempts=5/60s。每个测试 beforeEach 重置 store，使测试相互独立。
const RESET_LIMIT = () => __resetForTest();

const VERIFIER = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=verifier-hash';
const IP = '203.0.113.7';

describe('POST /api/vault/recover/init', () => {
  let userId: string;
  let email: string;

  beforeEach(async () => {
    RESET_LIMIT();
    userId = await seedUser({ email: 'recover@example.com' });
    email = 'recover@example.com';
    await initVault(userId, {
      wrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0',
      wrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0',
      encryptedBlob: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=blob0',
    });
    void userId;
  });

  it('存在邮箱 → 200 真实 RecoverInitResponse（不含 recoveryVerifier）', async () => {
    const res = await INIT(mockEvent({ method: 'POST', clientAddress: IP, body: { email } }));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body['kdfAlgo']).toBe('argon2id');
    expect(body['recoverySalt']).toBeDefined();
    expect(body['recoveryVerifierSalt']).toBeDefined();
    expect(body['wrappedDekByRecovery']).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0');
    expect(body['encryptedBlob']).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=blob0');
    expect('recoveryVerifier' in body).toBe(false);
  });

  it('不存在邮箱 → 200 伪材料，形状与真实一致', async () => {
    const res = await INIT(
      mockEvent({ method: 'POST', clientAddress: IP, body: { email: 'nobody@example.com' } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as Record<string, unknown>;
    const pseudo = derivePseudoRecoveryMaterial('nobody@example.com');
    expect(Object.keys(body).sort()).toEqual(Object.keys(pseudo).sort());
    expect(body['recoverySalt']).toBe(pseudo.recoverySalt);
    expect(body['wrappedDekByRecovery']).toMatch(/^v=1;iv=.*;ct=.*$/);
    expect('recoveryVerifier' in body).toBe(false);
  });

  it('超限 → 429 + Retry-After 头', async () => {
    // 前 5 次（maxAttempts）通过，第 6 次触发拦截
    for (let i = 0; i < 5; i++) {
      const r = await INIT(mockEvent({ method: 'POST', clientAddress: IP, body: { email } }));
      expect(r.status).toBe(200);
    }
    const res = await INIT(mockEvent({ method: 'POST', clientAddress: IP, body: { email } }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).not.toBeNull();
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
  });
});

describe('POST /api/vault/recover/reset', () => {
  let userId: string;
  let email: string;
  let storedVerifier: string;

  beforeEach(async () => {
    RESET_LIMIT();
    userId = await seedUser({ email: 'reset@example.com' });
    email = 'reset@example.com';
    await initVault(userId, {
      wrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0',
      wrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0',
      encryptedBlob: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=blob0',
    });
    // seedUser 写入的 recoveryVerifier 即存储值（16 字节 base64）
    const [u] = await db
      .select({ recoveryVerifier: user.recoveryVerifier })
      .from(user)
      .where(eq(user.id, userId));
    if (!u) throw new Error('seed user 查询缺失');
    storedVerifier = u.recoveryVerifier;
  });

  const resetBody = (over: Partial<{ recoveryVerifier: string; email: string }> = {}) => ({
    email,
    recoveryVerifier: VERIFIER,
    newLak: 'new-lak',
    newLoginSalt: 'new-loginSalt',
    newKdfSalt: 'new-kdfSalt',
    newWrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew',
    newWrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recoveryNew',
    newRecoverySalt: 'new-recoverySalt',
    newRecoveryVerifierSalt: 'new-rvs',
    newRecoveryVerifier: 'new-rv',
    ...over,
  });

  it('verifier 失败 → 403（不泄露用户存在性）', async () => {
    const res = await RESET(
      mockEvent({
        method: 'POST',
        clientAddress: IP,
        body: resetBody({ recoveryVerifier: 'wrong-verifier' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('verifier 匹配 → 200，reset 后旧会话全吊销 + RK 材料更新', async () => {
    await seedSessions(userId, 3);

    const res = await RESET(
      mockEvent({
        method: 'POST',
        clientAddress: IP,
        body: resetBody({ recoveryVerifier: storedVerifier }),
      }),
    );
    expect(res.status).toBe(200);

    // 全部旧会话被吊销
    const remaining = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, userId));
    expect(remaining).toHaveLength(0);

    // recoveryVerifier 更新为新值
    const [u] = await db
      .select({ recoveryVerifier: user.recoveryVerifier })
      .from(user)
      .where(eq(user.id, userId));
    if (!u) throw new Error('user 查询缺失（reset 后）');
    expect(u.recoveryVerifier).toBe('new-rv');
  });

  it('超限 → 429 + Retry-After（错误 verifier 亦消耗额度）', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await RESET(
        mockEvent({
          method: 'POST',
          clientAddress: IP,
          body: resetBody({ recoveryVerifier: 'wrong' }),
        }),
      );
      expect(r.status).toBe(403);
    }
    const res = await RESET(
      mockEvent({
        method: 'POST',
        clientAddress: IP,
        body: resetBody({ recoveryVerifier: 'wrong' }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).not.toBeNull();
  });

  it('不存在邮箱 → 403（不泄露存在性，与错误 verifier 同形）', async () => {
    const res = await RESET(
      mockEvent({
        method: 'POST',
        clientAddress: IP,
        body: resetBody({ email: 'ghost@example.com', recoveryVerifier: 'whatever' }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
