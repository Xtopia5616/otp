// src/routes/api/vault/recover/init/+server.ts — 恢复初始化 (Stage 5 task 5.9)
// 无会话 + 限流：checkAndConsume → 存在邮箱返回真实 RecoverInitResponse /
// 不存在返回 derivePseudoRecoveryMaterial（形状一致）→ 200；超限→429 + Retry-After。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import type { RecoverInitRequest } from '$lib/models/api';
import { checkAndConsume } from '$lib/server/rate-limit';
import { derivePseudoRecoveryMaterial } from '$lib/server/anti-enumeration';
import { getRecoverMaterial } from '$lib/server/db/recover';
import { requireFields } from '$lib/server/api-auth';

export const POST = async (event: RequestEvent): Promise<Response> => {
  const body: unknown = await event.request.json();
  if (!requireFields<RecoverInitRequest>(body, ['email'])) {
    return json({ error: 'missing email' }, { status: 400 });
  }

  // IP + email 双维度限流（Architecture §8.5）；任一被拦→429 + Retry-After（秒）。
  const rl = await checkAndConsume({
    ip: event.getClientAddress(),
    email: body.email,
    action: 'recover-init',
  });
  if (!rl.allowed) {
    return new Response(null, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  const material = await getRecoverMaterial(body.email);
  // 不存在邮箱返回形状一致的伪材料（不泄露存在性，§8.1/§8.5）。
  return json(material ?? derivePseudoRecoveryMaterial(body.email));
};
