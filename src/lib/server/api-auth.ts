// src/lib/server/api-auth.ts — API 路由层会话鉴权辅助 (Design §6 / StateMachines §3.1)
// 依赖方向：routes/api/* → server/*。本模块仅依赖 @sveltejs/kit 类型 + models（无）。
// 入口 `import '$server-only'`：客户端禁止导入。
import '$server-only';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/** 已鉴权会话上下文：处理器据此调用 server/db 查询。 */
export interface SessionUser {
  userId: string;
  /** 当前会话 id，供 rotate-key 的 revokeOtherSessions(userId, exceptSessionId) 排除自身。 */
  sessionId: string;
}

/**
 * 要求 BA 会话鉴权；无会话返回 401 Response，有会话返回 SessionUser。
 *
 * 用法：
 *   const ctx = requireSession(event);
 *   if (ctx instanceof Response) return ctx; // 401
 *   // ctx.userId / ctx.sessionId
 *
 * 401（非 auth/*）由客户端拦截器映射为 SessionRevokedError 并触发强制锁定
 * （StateMachines §3.1 / §2.5）。
 */
export function requireSession(event: RequestEvent): SessionUser | Response {
  const s = event.locals.session;
  if (!s) {
    return json({ error: '未登录或会话已失效' }, { status: 401 });
  }
  return { userId: s.user.id, sessionId: s.session.id };
}

/**
 * 校验请求体含全部必填字段（非 undefined、非空串）。类型守卫：通过则 body 为 T。
 * 用于 POST/PUT 处理器的参数校验（处理器薄，仅做存在性校验，业务校验在 server/db）。
 * 显式比较避免 strict-boolean-expressions 与 no-unnecessary-condition 误报。
 */
export function requireFields<T extends object>(
  body: unknown,
  keys: readonly (keyof T)[],
): body is T {
  if (typeof body !== 'object' || body === null) return false;
  const rec = body as Record<string, unknown>;
  return keys.every((k) => {
    const v = rec[k as string];
    return v !== undefined && v !== '';
  });
}
