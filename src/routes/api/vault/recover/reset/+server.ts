// src/routes/api/vault/recover/reset/+server.ts — 恢复重置 (Stage 5 task 5.10)
// 无会话 + 限流：checkAndConsume → getRecoveryAuthContext → safeEqualVerifier（失败→403）
// → resetRecovery 事务（内含事务后 revokeAllSessions）→ 200。403 / 429。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import type { RecoverResetRequest } from '$lib/models/api';
import { checkAndConsume } from '$lib/server/rate-limit';
import { safeEqualVerifier } from '$lib/server/constant-time';
import { getRecoveryAuthContext, resetRecovery } from '$lib/server/db/recover';
import { requireFields } from '$lib/server/api-auth';

const RESET_FIELDS: readonly (keyof RecoverResetRequest)[] = [
  'email',
  'recoveryVerifier',
  'newLak',
  'newLoginSalt',
  'newKdfSalt',
  'newWrappedDekByMaster',
  'newWrappedDekByRecovery',
  'newRecoverySalt',
  'newRecoveryVerifierSalt',
  'newRecoveryVerifier',
];

export const POST = async (event: RequestEvent): Promise<Response> => {
  const body: unknown = await event.request.json();
  if (!requireFields<RecoverResetRequest>(body, RESET_FIELDS)) {
    return json({ error: 'invalid request body' }, { status: 400 });
  }

  // 限流先于 verifier 校验：错误 verifier 亦消耗额度，逐步触发 429（§8.5）。
  const rl = await checkAndConsume({
    ip: event.getClientAddress(),
    email: body.email,
    action: 'recover-reset',
  });
  if (!rl.allowed) {
    return new Response(null, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  // 取 userId + 存储 recoveryVerifier；不存在邮箱返回 null（→ 校验失败→403，不泄露存在性）。
  // authCtx===null 短路：先收窄 authCtx 为非 null，再 safeEqualVerifier 常量时间比较。
  const authCtx = await getRecoveryAuthContext(body.email);
  if (authCtx === null || !safeEqualVerifier(body.recoveryVerifier, authCtx.recoveryVerifier)) {
    return json({ error: 'invalid recovery key' }, { status: 403 });
  }

  // resetRecovery 内部：单事务原子更新 account.password + user(MP 盐+全 RK 材料) + vault(两包装)，
  // 事务提交后调 revokeAllSessions(userId)（旧会话全失效）。DEK/Blob 不变。
  await resetRecovery(authCtx.userId, body);
  return new Response(null, { status: 200 });
};
