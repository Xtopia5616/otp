// tests/integration/api/vault.test.ts — GET/POST/PUT /api/vault (Stage 5 task 5.13)
// 覆盖：GET 成功/无会话 401；POST 成功 201/重复 409/无会话 401；PUT 成功/CAS 412 三字段裁剪/无会话 401。
import { describe, it, expect, beforeEach } from 'vitest';

import { GET, POST, PUT } from '../../../src/routes/api/vault/+server';
import { initVault, getVault } from '$lib/server/db/vault';
import { mockEvent, mockSession, readJson } from './helpers';
import { seedUser } from '../helpers';

const WRAP_M = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0';
const WRAP_R = 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0';
const BLOB = (n: number) => `v=1;iv=AAAAAAAAAAAAAAAA;ct=blob${n}`;
const SESSION_ID = 'sess-test-1';

describe('GET /api/vault', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
    await initVault(userId, {
      wrappedDekByMaster: WRAP_M,
      wrappedDekByRecovery: WRAP_R,
      encryptedBlob: BLOB(0),
    });
  });

  it('无会话 → 401', async () => {
    const res = await GET(mockEvent({}));
    expect(res.status).toBe(401);
  });

  it('已登录 → 200 VaultResponse', async () => {
    const res = await GET(mockEvent({ session: mockSession(userId, SESSION_ID) }));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body['version']).toBe(1);
    expect(body['encryptedBlob']).toBe(BLOB(0));
    expect(body['wrappedDekByMaster']).toBe(WRAP_M);
    expect(body['wrappedDekByRecovery']).toBe(WRAP_R);
    expect(typeof body['updatedAt']).toBe('string');
  });
});

describe('POST /api/vault', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
  });

  it('无会话 → 401', async () => {
    const res = await POST(
      mockEvent({
        method: 'POST',
        body: { wrappedDekByMaster: WRAP_M, wrappedDekByRecovery: WRAP_R, encryptedBlob: BLOB(0) },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('成功 → 201 {version:1}', async () => {
    const res = await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, SESSION_ID),
        body: { wrappedDekByMaster: WRAP_M, wrappedDekByRecovery: WRAP_R, encryptedBlob: BLOB(0) },
      }),
    );
    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ version: 1 });
  });

  it('已存在 → 409', async () => {
    await initVault(userId, {
      wrappedDekByMaster: WRAP_M,
      wrappedDekByRecovery: WRAP_R,
      encryptedBlob: BLOB(0),
    });
    const res = await POST(
      mockEvent({
        method: 'POST',
        session: mockSession(userId, SESSION_ID),
        body: { wrappedDekByMaster: WRAP_M, wrappedDekByRecovery: WRAP_R, encryptedBlob: BLOB(1) },
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/vault（CAS）', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await seedUser();
    await initVault(userId, {
      wrappedDekByMaster: WRAP_M,
      wrappedDekByRecovery: WRAP_R,
      encryptedBlob: BLOB(0),
    });
  });

  it('无会话 → 401', async () => {
    const res = await PUT(
      mockEvent({ method: 'PUT', body: { expectedVersion: 1, encryptedBlob: BLOB(1) } }),
    );
    expect(res.status).toBe(401);
  });

  it('expectedVersion 匹配 → 200 {version}', async () => {
    const res = await PUT(
      mockEvent({
        method: 'PUT',
        session: mockSession(userId, SESSION_ID),
        body: { expectedVersion: 1, encryptedBlob: BLOB(1) },
      }),
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ version: 2 });
  });

  it('OCC 冲突 → 412 VaultConflictResponse 严格三字段（不含 wrappedDekByRecovery/passkey）', async () => {
    // 先推进到 version=2
    await PUT(
      mockEvent({
        method: 'PUT',
        session: mockSession(userId, SESSION_ID),
        body: { expectedVersion: 1, encryptedBlob: BLOB(1) },
      }),
    );

    // 用过期的 expectedVersion=1 → 冲突
    const res = await PUT(
      mockEvent({
        method: 'PUT',
        session: mockSession(userId, SESSION_ID),
        body: { expectedVersion: 1, encryptedBlob: BLOB(2) },
      }),
    );
    expect(res.status).toBe(412);
    const body = (await readJson(res)) as Record<string, unknown>;
    // 严格三字段
    expect(Object.keys(body).sort()).toEqual(
      ['encryptedBlob', 'serverVersion', 'wrappedDekByMaster'].sort(),
    );
    expect(body['serverVersion']).toBe(2);
    expect(body['encryptedBlob']).toBe(BLOB(1));
    expect(body['wrappedDekByMaster']).toBe(WRAP_M);
    // 不含 wrappedDekByRecovery
    expect('wrappedDekByRecovery' in body).toBe(false);
  });

  it('CAS 连续成功：version 单调递增', async () => {
    for (let v = 1; v <= 3; v++) {
      const res = await PUT(
        mockEvent({
          method: 'PUT',
          session: mockSession(userId, SESSION_ID),
          body: { expectedVersion: v, encryptedBlob: BLOB(v) },
        }),
      );
      expect(res.status).toBe(200);
      expect(await readJson(res)).toEqual({ version: v + 1 });
    }
    const finalVault = await getVault(userId);
    expect(finalVault.version).toBe(4);
  });
});
