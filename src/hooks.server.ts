// src/hooks.server.ts — 全局请求钩子 (Design §6 / Architecture §8.3)
//
// 职责：为 WebOTP 自有端点（vault/passkey-wraps/rotate-key/session/recover）解析
// Better Auth 会话并沉淀到 event.locals.session。处理器据此鉴权（无会话→401）。
//
// /api/auth/* 不在此解析——由 routes/api/auth/[...path]/+server.ts 委托 auth.handler
// 自管会话（含 cookie 设置/刷新），避免双重解析与 cookie 丢失。
//
// 会话吊销校验（§8.3）：auth.api.getSession 读 session 表校验令牌与过期，被远程
// 吊销/过期的会话返回 null → 处理器 401 → 客户端拦截器强制锁定。
import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/auth/')) {
    event.locals.session = await auth.api.getSession({ headers: event.request.headers });
  }
  return resolve(event);
};
