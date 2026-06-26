// src/routes/api/passkey-wraps/+server.ts — PRF 包装 GET/POST (Stage 5 task 5.7)
// BA 会话鉴权 + 调 server/db/passkey-wrap + 错误码映射（credentialId 重复→409）。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { ConflictError } from '$lib/models/errors';
import type { PasskeyWrapCreateRequest } from '$lib/models/api';
import { listPasskeyWraps, createPasskeyWrap } from '$lib/server/db/passkey-wrap';
import { requireSession, requireFields } from '$lib/server/api-auth';

/** GET /api/passkey-wraps → 200 PasskeyWrapRow[]；无会话→401。 */
export const GET = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;
  return json(await listPasskeyWraps(ctx.userId));
};

/** POST /api/passkey-wraps → 201 PasskeyWrapRow；credentialId 重复→409；无会话→401。 */
export const POST = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;

  const body: unknown = await event.request.json();
  if (!requireFields<PasskeyWrapCreateRequest>(body, ['credentialId', 'wrappedDekByPrf'])) {
    return json({ error: 'invalid request body' }, { status: 400 });
  }

  try {
    return json(await createPasskeyWrap(ctx.userId, body), { status: 201 });
  } catch (e) {
    if (e instanceof ConflictError) {
      return json({ error: 'passkey already bound' }, { status: 409 });
    }
    throw e;
  }
};
