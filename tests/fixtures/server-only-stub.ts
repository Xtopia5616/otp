// tests/fixtures/server-only-stub.ts — `$server-only` 运行时桩（仅 vitest）
// SvelteKit 的 `$server-only` 在 dev/build 经 Vite 虚拟模块提供（客户端导入即抛），
// 但 vitest 运行时无该虚拟模块。集成测试经 vitest resolve.alias 将 `$server-only`
// 指向本空模块，使 server/ 模块在测试进程内可正常求值（测试本身即服务端环境）。
export {};
