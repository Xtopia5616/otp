// svelte.config.js
// WebOTP — SvelteKit configuration (DevSetup §4.2, Stage 0 §0.7)
//
// CSP 取舍（Architecture §2）：
//   - script-src 允许 'wasm-unsafe-eval' 以加载 hash-wasm（Argon2id）
//   - 严格禁止 'unsafe-inline' 与脚本侧 'unsafe-eval'（XSS 防御底线）
//   - style-src 仅 'self'（Tailwind 走外链）
//   - connect-src 仅 'self'（Better Auth + Vault API 同源）
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  // Svelte 5 编译器选项（Engineering §4：强制 runes 模式）
  // node_modules 中的库除外；Svelte 6 起可移除。
  compilerOptions: {
    runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
  },

  kit: {
    // Node.js 适配器（生产部署，DevSetup §3.2）
    adapter: adapter(),

    // 内容安全策略（DevSetup §4.2 / Architecture §2）
    csp: {
      mode: 'hash',
      directives: {
        'script-src': [
          'self',
          'wasm-unsafe-eval', // 允许 Wasm 编译（Argon2id hash-wasm）
          // ❌ 'unsafe-eval'   // 禁止 eval() / new Function()
          // ❌ 'unsafe-inline' // 禁止内联脚本
        ],
        'style-src': ['self'], // Tailwind 走 <link> 外链
        'img-src': ['self', 'data:'], // data: 用于 issuer 图标
        'connect-src': ['self'], // 仅同源 API
        'font-src': ['self'],
        'base-uri': ['self'],
        'form-action': ['self'],
      },
    },

    // 路径别名（Engineering §1.2）
    // $lib 由 SvelteKit 内置；$server 指向 src/lib/server/
    alias: {
      $server: 'src/lib/server',
    },
  },
};

export default config;
