// tests/integration/api/passkey-wraps.test.ts — GET/POST/DELETE /api/passkey-wraps (Stage 5 task 5.13)
// 覆盖：GET 成功/401；POST 成功 201/409 重复/401；DELETE 成功 200/404 不存在/401 + BA 凭证吊销。
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { GET, POST } from '../../../src/routes/api/passkey-wraps/+server';
import { DELETE } from '../../../src/routes/api/passkey-wraps/[credentialId]/+server';
import { db } from '$lib/server/db';
import { passkey as passkeyTable } from '$lib/server/db/schema';
import { mockEvent, mockSession, readJson } from './helpers';
import { seedUser } from '../helpers';

const SESSION_ID = 'sess-pw-1';

describe('GET /api/passkey-wraps', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
  });

  it('无会话 → 401', async () => {
    const res = await GET(mockEvent({}));
    expect(res.status).toBe(401);
  });

  it('已登录空列表 → 200 []', async () => {
    const res = await GET(mockEvent({ session: mockSession(userId, SESSION_ID) }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual([]);
  });
});

describe('POST /api/passkey-wraps', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
  });

  it('无会话 → 401', async () => {
    const res = await POST(
      mockEvent({
        method: 'POST',
        body: { credentialId: 'cred-1', wrappedDekByPrf: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=prf1' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('成功 → 201 PasskeyWrapRow', async () => {
    const res = await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, SESSION_ID),
        body: { credentialId: 'cred-1', wrappedDekByPrf: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=prf1' },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body['credentialId']).toBe('cred-1');
    expect(body['wrappedDekByPrf']).toBe('v=1;iv=AAAAAAAAAAAAAAAA;ct=prf1');
    expect(typeof body['id']).toBe('string');
    expect(typeof body['createdAt']).toBe('string');
  });

  it('credentialId 重复 → 409', async () => {
    await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, SESSION_ID),
        body: { credentialId: 'cred-dup', wrappedDekByPrf: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=prf1' },
      }),
    );
    const res = await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, SESSION_ID),
        body: { credentialId: 'cred-dup', wrappedDekByPrf: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=prf2' },
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/passkey-wraps/:credentialId', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
    // 种子一个 BA passkey 凭证行（验证 DELETE 时被吊销）
    await db.insert(passkeyTable).values({
      id: 'pk-cred-1',
      userId,
      credentialID: 'cred-1',
      publicKey: 'pk',
      deviceType: 'singleDevice',
    });
    await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, SESSION_ID),
        body: { credentialId: 'cred-1', wrappedDekByPrf: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=prf1' },
      }),
    );
  });

  it('无会话 → 401', async () => {
    const res = await DELETE(mockEvent({ method: 'DELETE', params: { credentialId: 'cred-1' } }));
    expect(res.status).toBe(401);
  });

  it('成功 → 200，WebOTP 包装行与 BA passkey 凭证均被删除', async () => {
    const res = await DELETE(
      mockEvent({
        method: 'DELETE',
        session: mockSession(userId, SESSION_ID),
        params: { credentialId: 'cred-1' },
      }),
    );
    expect(res.status).toBe(200);

    // GET 列表为空（包装行删除）
    const listRes = await GET(mockEvent({ session: mockSession(userId, SESSION_ID) }));
    expect(await readJson(listRes)).toEqual([]);

    // BA passkey 凭证行也被吊销
    const baPasskeys = await db
      .select({ id: passkeyTable.id })
      .from(passkeyTable)
      .where(eq(passkeyTable.userId, userId));
    expect(baPasskeys).toHaveLength(0);
  });

  it('行不存在 → 404', async () => {
    const res = await DELETE(
      mockEvent({
        method: 'DELETE',
        session: mockSession(userId, SESSION_ID),
        params: { credentialId: 'nonexistent-cred' },
      }),
    );
    expect(res.status).toBe(404);
  });
});
