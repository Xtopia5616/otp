// tests/integration/db/smoke.test.ts — 验证集成测试运行时链路（$server-only 解析、
// schema 隔离、db 查询）。通过后即可信任 vault-cas/rotate-key 等测试的基础设施。
import { describe, it, expect } from 'vitest';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { seedUser } from '../helpers';

describe('integration smoke', () => {
  it('db 查询命中 webotp_test 隔离 schema', async () => {
    const id = await seedUser({ email: 'smoke@example.com' });
    const rows = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('smoke@example.com');
  });
});
