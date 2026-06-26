// src/routes/api/auth-params/+server.ts — GET 取鉴权参数（公开，反枚举）(Stage 5 task 5.1)
// 存在邮箱→getAuthParamsByEmail；不存在→derivePseudoAuthParams（形状/耗时一致，§8.1）。
// 处理器薄：仅编排 + 参数校验；业务在 server/db + server/anti-enumeration。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { getAuthParamsByEmail } from '$lib/server/db/user';
import { derivePseudoAuthParams } from '$lib/server/anti-enumeration';

export const GET = async (event: RequestEvent): Promise<Response> => {
  const email = event.url.searchParams.get('email');
  if (email === null || email === '') {
    return json({ error: 'missing email' }, { status: 400 });
  }

  const params = await getAuthParamsByEmail(email);
  // 不存在邮箱返回确定性伪参数（与真实响应逐字段形状/base64 长度一致，不泄露存在性）。
  return json(params ?? derivePseudoAuthParams(email));
};
