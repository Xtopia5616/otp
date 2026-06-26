// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

/// <reference types="vite/client" />

// WebOTP Stage 5：BA 会话经 hooks.server.ts 解析后沉淀到 locals.session。
// 结构与 better-auth auth.api.getSession 返回值一致（仅声明处理器所需字段，
// BA 实际对象含更多字段，结构兼容可直接赋值）。
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /** Better Auth 会话；/api/auth/* 由 BA handler 自管，其余端点经 hooks 解析。
       *  null = 未登录/会话失效 → 需鉴权端点返回 401。 */
      session: {
        session: { id: string; userId: string; expiresAt: Date; token: string };
        user: { id: string; email: string };
      } | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
