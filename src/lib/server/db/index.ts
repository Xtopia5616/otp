// src/lib/server/db/index.ts — Drizzle 连接实例 (Engineering §5.2 / Design §5.1)
// 客户端禁止导入：入口 `import '$server-only'`。
//
// 驱动：pg（node-postgres），drizzle-orm/node-postgres。DevSetup §2.2/§3.1 指定 pg；
// Engineering §5.2 示例写作 postgres(postgres.js) 系文档偏差，以已安装依赖 pg 为准。
//
// 集成测试隔离：process.env.DATABASE_SCHEMA（非密钥，仅测试设置）非空时，经 PG `options`
// 将该 schema 设为每条连接的 search_path，使全部 Drizzle 查询落到隔离 schema（不碰 public）。
import '$server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL 未设置（Engineering §5.1）');
}

/** 集成测试用：隔离 schema 名（非空则设为连接 search_path）。生产为 undefined。 */
const testSchema = process.env.DATABASE_SCHEMA;

export const pool = new Pool({
  connectionString: databaseUrl,
  ...(testSchema !== undefined && testSchema.length > 0
    ? { options: `-c search_path=${testSchema}` }
    : {}),
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
