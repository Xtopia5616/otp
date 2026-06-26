// eslint.config.js — Flat Config (Engineering §2.2)
// type-checked 规则需 projectService；.svelte/.js/.d.ts/根级 config 文件
// 用 disableTypeChecked 关闭类型检查。
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  ...svelte.configs['flat/recommended'],
  prettier,

  // 全局：projectService + 非 type-checked 规则（适用于所有文件）
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'svelte/no-at-html-tags': 'error',
      'svelte/require-event-dispatcher-types': 'error',
    },
  },

  // TS 文件：type-checked 规则（需 projectService 类型信息）
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    },
  },

  // JS 文件关闭类型检查
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [ts.configs.disableTypeChecked],
  },
  // Svelte 文件关闭类型检查（svelte-eslint-parser 不转发 projectService）
  {
    files: ['**/*.svelte'],
    extends: [ts.configs.disableTypeChecked],
  },
  // 根级配置 TS 文件 + ambient .d.ts（不在 tsconfig include 内）
  {
    files: ['*.config.ts', '**/*.d.ts'],
    extends: [ts.configs.disableTypeChecked],
  },
  {
    ignores: [
      '.svelte-kit/**',
      'build/**',
      'node_modules/**',
      '.env',
      '.env.*',
      'pnpm-lock.yaml',
      'docs/**',
      'drizzle/**',
      'coverage/**',
    ],
  },
);
