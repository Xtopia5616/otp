// vite.config.ts
// 所有 SvelteKit 配置（adapter-node、CSP、alias、runes）集中在 svelte.config.js
// （Stage 0 §0.7）。此处 sveltekit() 不传参，确保 svelte.config.js 生效。
// 测试配置集中在 vitest.config.ts（Testing §1.2）。
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
});
