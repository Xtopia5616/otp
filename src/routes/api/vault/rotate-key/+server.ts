// src/routes/api/vault/rotate-key/+server.ts — 密码轮换 (Stage 5 task 5.6)
// BA 鉴权 + RotateKeyRequest → rotateMasterPassword 事务（内含事务后 revokeOtherSessions）→ 200。
// Blob/version/wrappedDekByRecovery/passkey 行不动（DEK 恒定，Architecture §8.2）。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import type { RotateKeyRequest } from '$lib/models/api';
import { rotateMasterPassword } from '$lib/server/db/vault';
import { requireSession, requireFields } from '$lib/server/api-auth';

export const POST = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;

  const body: unknown = await event.request.json();
  if (
    !requireFields<RotateKeyRequest>(body, [
      'newLak',
      'newLoginSalt',
      'newKdfSalt',
      'newWrappedDekByMaster',
    ])
  ) {
    return json({ error: 'invalid request body' }, { status: 400 });
  }

  // rotateMasterPassword 内部：单事务原子更新 account.password + user(盐) + vault(wrappedDekByMaster)，
  // 事务提交后调 revokeOtherSessions(userId, ctx.sessionId)（保留当前会话）。
  await rotateMasterPassword(ctx.userId, body, ctx.sessionId);
  return new Response(null, { status: 200 });
};
