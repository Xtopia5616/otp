// src/lib/server/db/migrate.ts — 迁移脚本 (Engineering §8.2 / DevSetup §6.2)
// 生产用 `pnpm drizzle-kit migrate`（执行 drizzle/ 下迁移文件，带事务、可审计）。
// 本脚本供程序化迁移：node --import tsx src/lib/server/db/migrate.ts（若需在启动时迁移）。
import '$server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL 未设置（Engineering §5.1）');
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

await migrate(db, { migrationsFolder: './drizzle' });

await pool.end();
