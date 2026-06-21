// vitest.config.ts (Testing §1.2, adapted for Vitest 4 `projects` API)
// 双项目：unit（纯函数）+ integration（forks 隔离 DB）
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
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
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          pool: 'forks', // 隔离 DB 容器
        },
      },
    ],
  },
});
