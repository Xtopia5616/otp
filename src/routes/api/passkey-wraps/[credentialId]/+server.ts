// src/routes/api/passkey-wraps/[credentialId]/+server.ts — 撤销 PRF 包装 (Stage 5 task 5.8)
// deletePasskeyWrap（WebOTP passkeyWrap 表）+ revokePasskeyCredential（BA passkey 表，吊销登录凭证）→ 200；
// 行不存在→404；无会话→401。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { NotFoundError } from '$lib/models/errors';
import { deletePasskeyWrap } from '$lib/server/db/passkey-wrap';
import { revokePasskeyCredential } from '$lib/server/auth';
import { requireSession } from '$lib/server/api-auth';

export const DELETE = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;

  const credentialId = event.params.credentialId;
  if (credentialId === undefined) {
    return json({ error: 'missing credentialId' }, { status: 400 });
  }

  try {
    // 先删 WebOTP 包装行（不存在→NotFoundError→404）；再吊销 BA 登录凭证（幂等）。
    await deletePasskeyWrap(ctx.userId, credentialId);
    await revokePasskeyCredential(ctx.userId, credentialId);
    return new Response(null, { status: 200 });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return json({ error: 'passkey wrap not found' }, { status: 404 });
    }
    throw e;
  }
};
