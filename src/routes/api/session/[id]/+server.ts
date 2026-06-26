// src/routes/api/session/[id]/+server.ts — 吊销指定会话 (Stage 5 task 5.11)
// BA 鉴权 → revokeSession（按 userId 范围限定，只能吊销自己的会话）→ 200；不存在→404；无会话→401。
// 经 db/session 委托层调用 auth（Design §5.1：路由不直接 import auth 的会话吊销 API）。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { NotFoundError } from '$lib/models/errors';
import { revokeSession } from '$lib/server/db/session';
import { requireSession } from '$lib/server/api-auth';

export const DELETE = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;

  const id = event.params.id;
  if (id === undefined) {
    return json({ error: 'missing session id' }, { status: 400 });
  }

  try {
    await revokeSession(ctx.userId, id);
    return new Response(null, { status: 200 });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return json({ error: 'session not found' }, { status: 404 });
    }
    throw e;
  }
};
