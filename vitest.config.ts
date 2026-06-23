// vitest.config.ts (Testing §1.2, adapted for Vitest 4 `projects` API)
// 双项目：unit（纯函数）+ integration（forks 隔离 DB）
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

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
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          pool: 'forks', // 隔离 DB 容器
          passWithNoTests: true,
        },
      },
    ],
  },
});
