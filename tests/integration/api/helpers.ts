// tests/integration/api/helpers.ts — API 处理器测试工具 (Stage 5 task 5.13)
// 构造最小 RequestEvent 调用 +server.ts 导出的 HTTP 方法处理器，断言状态码/响应体。
// 与 db 层测试同进程（search_path=webotp_test），共享 setup.ts 的 TRUNCATE 隔离。
import type { RequestEvent } from '@sveltejs/kit';

/** 模拟的 BA 会话上下文（与 src/app.d.ts App.Locals.session 形状一致）。 */
export interface MockSession {
  session: { id: string; userId: string; expiresAt: Date; token: string };
  user: { id: string; email: string };
}

export interface MockEventInit {
  method?: string;
  url?: string;
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  /** locals.session；null = 未登录（测 401）。 */
  session?: MockSession | null;
  /** getClientAddress 返回值（限流维度 IP）。 */
  clientAddress?: string;
}

/**
 * 构造 RequestEvent 调用处理器。
 * 仅提供处理器依赖的字段（request/url/params/locals/getClientAddress），
 * 不经真实 SvelteKit 路由——直接调用导出的 GET/POST/PUT/DELETE。
 */
export function mockEvent(init: MockEventInit = {}): RequestEvent {
  const method = init.method ?? 'GET';
  const url = new URL(init.url ?? 'http://localhost/api/test');
  const headers = new Headers(init.headers ?? {});
  const bodyText = init.body !== undefined ? JSON.stringify(init.body) : null;
  const request = new Request(url, { method, headers, body: bodyText });
  const searchParams = url.searchParams;
  const cookies = {
    get: () => undefined,
    getAll: () => [],
    set: () => {},
    delete: () => {},
  };
  // locals.session 形状与 App.Locals.session 一致；处理器经 event.locals.session 鉴权。
  const locals = { session: init.session ?? null };
  return {
    request,
    url,
    params: init.params ?? {},
    locals,
    cookies,
    searchParams,
    getClientAddress: () => init.clientAddress ?? '127.0.0.1',
    // 处理器未使用的字段留空（TS 要求的最小契约经 as 断言）。
    route: { id: null },
    isDataRequest: false,
    isSubRequest: false,
    fetch: (typeof fetch !== 'undefined' ? fetch : undefined) as typeof fetch,
    platform: undefined,
  } as unknown as RequestEvent;
}

/** 构造已登录会话上下文（locals.session）。userId/sessionId 对应 DB 种子行。 */
export function mockSession(userId: string, sessionId: string): MockSession {
  return {
    session: {
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 3600_000),
      token: `tok-${sessionId}`,
    },
    user: { id: userId, email: `${userId}@example.com` },
  };
}

/** 读取 Response 的 JSON 体（用于断言响应形状）。 */
export async function readJson(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}
