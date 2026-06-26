// vitest.config.ts (Testing §1.2, adapted for Vitest 4 `projects` API)
// 双项目：unit（纯函数）+ integration（forks 隔离 DB）
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // passWithNoTests：无测试时正常退出 0（Stage 0 验收要求）
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/crypto/**', 'src/lib/otp/**'],
      // 注：mergeAccounts 纯函数内置于 src/lib/state/vault.svelte.ts（Design §4.3），
      // 由 tests/unit/merge/three-way.test.ts 单测覆盖。
      // vault.svelte.ts 同时含响应式同步编排（由集成/E2E 覆盖），故不纳入 95% 文件级阈值。
      thresholds: {
        lines: 95,
        branches: 90,
      },
    },
    // Vitest 4：workspace → projects
    // 不用 extends:true，避免父级 include 合并进子项目
    // 注：projects 不继承根级 Vite plugins，故 sveltekit()（提供 $lib/$server 别名）
    // 须在各 project 内显式声明，否则测试中 import '$lib/...' 无法解析。
    projects: [
      {
        plugins: [sveltekit()],
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        plugins: [sveltekit()],
        // `$server-only` 在 vitest 运行时无虚拟模块（sveltekit 插件仅 dev/build 提供），
        // 别名到空桩使 server/ 模块在测试进程内可求值。
        resolve: { alias: { '$server-only': resolve('./tests/fixtures/server-only-stub.ts') } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          pool: 'forks', // 隔离 DB 进程
          // 串行执行测试文件：集成测试共享远程 PG 的 webotp_test schema，
          // 并发会争用同一 schema（DROP/CREATE 竞态）。Vitest 4 以 fileParallelism 替代 singleFork。
          fileParallelism: false,
          // DATABASE_SCHEMA 使 db/index.ts 连接设 search_path=webotp_test（隔离 schema）。
          // 在模块求值前注入，避免 setup 顶层 import 的 hoisting 竞态。
          env: { DATABASE_SCHEMA: 'webotp_test' },
          passWithNoTests: true,
        },
      },
    ],
  },
});
