// src/server-only-ambient.ts — `$server-only` 全局 ambient 模块声明
//
// SvelteKit 的 `$server-only` 是运行时客户端导入守卫（vite 虚拟模块：客户端导入即抛错），
// 但 SvelteKit 未提供其类型声明。svelte-check 不把 glob 匹配的 .d.ts（如 app.d.ts）
// 纳入 program（实测 app.d.ts 中的 declare module 不生效），故以 .ts 脚本文件承载：
// 无 import/export 的 .ts 文件即「脚本」，其 `declare module` 为全局 ambient 声明。
//
// Engineering §5.2 要求 server/ 入口 `import '$server-only'`；本声明使其通过类型检查。
declare module '$server-only';
