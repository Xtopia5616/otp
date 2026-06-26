// tests/integration/setup.ts (Testing §1.2, Stage 4 task 4.14)
// 集成测试 DB 隔离：Supabase 远程 PG 的 webotp_test schema（用户决策）。
//
// 策略：
// - vitest integration project 注入 env DATABASE_SCHEMA=webotp_test（见 vitest.config.ts），
//   使 src/lib/server/db/index.ts 的 Pool 以 search_path=webotp_test 连接 → 全部 Drizzle 查询
//   落到隔离 schema，不碰 public 的开发数据。
// - 本 setup 用独立 admin Pool（无 search_path 限定）在 beforeAll 重建 webotp_test schema +
//   表（读 drizzle/0000_init_schema.sql，剥离 "public". 限定使 FK 经 search_path 解析到
//   webotp_test），beforeEach TRUNCATE 全表实现测试间隔离。
// - singleFork 串行（vitest.config.ts）避免并发 fork 争用同一 schema。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL === undefined || DATABASE_URL === '') throw new Error('集成测试需要 DATABASE_URL');

const TEST_SCHEMA = 'webotp_test';

/** 管理连接（无 search_path 限定），用于建/删 schema 与 DDL。 */
const adminPool = new Pool({ connectionString: DATABASE_URL });

/** webotp_test 内全部表名（TRUNCATE 用）。 */
const TABLES = ['user', 'session', 'account', 'verification', 'passkey', 'vault', 'passkey_wrap'];

/**
 * 读取迁移 SQL 并剥离 "public". 限定（drizzle-kit 生成的 FK 硬编码 REFERENCES "public"."user"，
 * 在非 public schema 下会指向错误表；剥离后 FK 经 search_path 解析到 webotp_test）。
 */
function initDdlStatements(): string[] {
  const sql = readFileSync(resolve('./drizzle/0000_init_schema.sql'), 'utf8');
  const stripped = sql.replace(/"public"\./g, '');
  return stripped
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

beforeAll(async () => {
  const client = await adminPool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await client.query(`SET search_path TO ${TEST_SCHEMA}`);
    for (const stmt of initDdlStatements()) {
      await client.query(stmt);
    }
  } finally {
    client.release();
  }
});

beforeEach(async () => {
  const client = await adminPool.connect();
  try {
    await client.query(`SET search_path TO ${TEST_SCHEMA}`);
    await client.query(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await adminPool.end();
});
