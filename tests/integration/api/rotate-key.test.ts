// tests/integration/api/rotate-key.test.ts — POST /api/vault/rotate-key (Stage 5 task 5.13)
// 覆盖：成功 200 + 事务后他设备会话吊销；无会话 401；无效请求体 400。
import { describe, it, expect, beforeEach } from 'vitest';
import { eq, ne } from 'drizzle-orm';

import { POST } from '../../../src/routes/api/vault/rotate-key/+server';
import { db } from '$lib/server/db';
import { session } from '$lib/server/db/schema';
import { initVault, getVault } from '$lib/server/db/vault';
import { mockEvent, mockSession } from './helpers';
import { seedUser, seedSessions } from '../helpers';

const NEW_WRAP = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=masterNew';
const SESSION_ID = 'sess-rotate-keep';

describe('POST /api/vault/rotate-key', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
    await initVault(userId, {
      wrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0',
      wrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0',
      encryptedBlob: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=blob0',
    });
  });

  it('无会话 → 401', async () => {
    const res = await POST(
      mockEvent({
        method: 'POST',
        body: {
          newLak: 'new-lak',
          newLoginSalt: 'new-loginSalt',
          newKdfSalt: 'new-kdfSalt',
          newWrappedDekByMaster: NEW_WRAP,
        },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('成功 → 200，wrappedDekByMaster 更新，事务后他设备会话吊销（保留当前）', async () => {
    const sessions = await seedSessions(userId, 3);
    // 当前会话 = sessions[0]（保留）
    const keepSessionId = sessions[0];
    if (keepSessionId === undefined) throw new Error('seeded sessions 缺失');

    const res = await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, keepSessionId),
        body: {
          newLak: 'new-lak',
          newLoginSalt: 'new-loginSalt',
          newKdfSalt: 'new-kdfSalt',
          newWrappedDekByMaster: NEW_WRAP,
        },
      }),
    );
    expect(res.status).toBe(200);

    // wrappedDekByMaster 更新为 NEW_WRAP
    const v = await getVault(userId);
    expect(v.wrappedDekByMaster).toBe(NEW_WRAP);

    // 其余会话被吊销，仅保留当前
    const remaining = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, userId));
    expect(remaining.map((r) => r.id)).toEqual([keepSessionId]);
    // 验证至少删了 2 个（sessions[1]、sessions[2]）
    const deleted = sessions.filter((s) => s !== keepSessionId);
    expect(deleted.length).toBe(2);
    void ne;
  });

  it('无效请求体（缺字段）→ 400', async () => {
    const res = await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, SESSION_ID),
        body: { newLak: 'new-lak' },
      }),
    );
    expect(res.status).toBe(400);
  });
});
