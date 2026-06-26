// src/routes/api/auth/[...path]/+server.ts — Better Auth 全方法透传 (Stage 5 task 5.2)
// 委托 auth.handler（自管会话/cookie/CSRF/passkey 选项）。POST/GET/DELETE 等全方法透传。
// 登录凭据错 401 由 BA 返回，客户端拦截器区分 auth/* 401（不触发全局吊销，StateMachines §3.1）。
import type { RequestEvent } from '@sveltejs/kit';

import { auth } from '$lib/server/auth';

const delegate = (event: RequestEvent): Response | Promise<Response> => auth.handler(event.request);

export const GET = delegate;
export const POST = delegate;
export const PUT = delegate;
export const PATCH = delegate;
export const DELETE = delegate;
