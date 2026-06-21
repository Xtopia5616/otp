// drizzle.config.ts (DevSetup §6.1)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Stage 0：schema 文件尚未存在，先用占位路径。
  // Stage 4 起将指向 src/lib/server/db/schema/index.ts（Engineering §8.1）。
  schema: './src/lib/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://webotp:dev@127.0.0.1:5432/webotp_dev',
  },
  // 严格列名 camelCase ↔ snake_case 映射由 schema 文件 text('snake_case') 显式控制
  verbose: true,
  strict: true,
});
