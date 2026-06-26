// tests/integration/api/auth-params.test.ts — GET /api/auth-params (Stage 5 task 5.13)
// 覆盖：存在邮箱返回真实 AuthParamsResponse；不存在返回伪参数（形状一致）；缺 email→400。
import { describe, it, expect } from 'vitest';

import { GET } from '../../../src/routes/api/auth-params/+server';
import { derivePseudoAuthParams } from '$lib/server/anti-enumeration';
import { mockEvent, readJson } from './helpers';
import { seedUser } from '../helpers';

describe('GET /api/auth-params（公开，反枚举）', () => {
  it('存在邮箱 → 200 真实 AuthParamsResponse', async () => {
    const userId = await seedUser({ email: 'real@example.com' });

    const res = await GET(
      mockEvent({ url: 'http://localhost/api/auth-params?email=real@example.com' }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body['kdfAlgo']).toBe('argon2id');
    expect(body['kdfMemoryKiB']).toBe(65536);
    expect(body['kdfIterations']).toBe(3);
    expect(body['kdfParallelism']).toBe(4);
    // 真实盐为 16 字节 base64（24 字符）
    expect((body['loginSalt'] as string).length).toBe(24);
    expect((body['kdfSalt'] as string).length).toBe(24);
    expect(body['prfSalt']).toBeNull();
    // userId 仅用于避免未用警告（seedUser 已写入 DB）
    void userId;
  });

  it('不存在邮箱 → 200 伪 AuthParamsResponse，形状与真实一致', async () => {
    const res = await GET(
      mockEvent({ url: 'http://localhost/api/auth-params?email=nobody@example.com' }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as Record<string, unknown>;
    const pseudo = derivePseudoAuthParams('nobody@example.com');
    // 逐字段形状一致
    expect(body['kdfAlgo']).toBe(pseudo.kdfAlgo);
    expect(body['kdfMemoryKiB']).toBe(pseudo.kdfMemoryKiB);
    expect(body['kdfIterations']).toBe(pseudo.kdfIterations);
    expect(body['kdfParallelism']).toBe(pseudo.kdfParallelism);
    expect(body['loginSalt']).toBe(pseudo.loginSalt);
    expect(body['kdfSalt']).toBe(pseudo.kdfSalt);
    expect(body['prfSalt']).toBeNull();
    // 伪盐长度与真实一致（24 字符）
    expect((body['loginSalt'] as string).length).toBe(24);
    expect((body['kdfSalt'] as string).length).toBe(24);
  });

  it('缺 email 参数 → 400', async () => {
    const res = await GET(mockEvent({ url: 'http://localhost/api/auth-params' }));
    expect(res.status).toBe(400);
  });

  it('空 email → 400', async () => {
    const res = await GET(mockEvent({ url: 'http://localhost/api/auth-params?email=' }));
    expect(res.status).toBe(400);
  });
});
