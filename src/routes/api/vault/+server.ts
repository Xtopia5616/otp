// src/routes/api/vault/+server.ts — Vault GET/POST/PUT (Stage 5 task 5.3/5.4/5.5)
// BA 会话鉴权 + 参数校验 + 调 server/db/vault + 错误码映射（412 三字段裁剪 / 409 重复）。
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { ConflictError, OccConflictError } from '$lib/models/errors';
import type { VaultCreateRequest, VaultPutRequest } from '$lib/models/vault';
import { getVault, initVault, updateVaultBlob } from '$lib/server/db/vault';
import { requireSession, requireFields } from '$lib/server/api-auth';

/** GET /api/vault → 200 VaultResponse；无会话→401。 */
export const GET = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;
  return json(await getVault(ctx.userId));
};

/** POST /api/vault → 201 {version:1}；已存在→409；无会话→401。 */
export const POST = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;

  const body: unknown = await event.request.json();
  if (
    !requireFields<VaultCreateRequest>(body, [
      'wrappedDekByMaster',
      'wrappedDekByRecovery',
      'encryptedBlob',
    ])
  ) {
    return json({ error: 'invalid request body' }, { status: 400 });
  }

  try {
    return json(await initVault(ctx.userId, body), { status: 201 });
  } catch (e) {
    if (e instanceof ConflictError) {
      return json({ error: 'vault already exists' }, { status: 409 });
    }
    throw e;
  }
};

/** PUT /api/vault → 200 {version}；OCC 冲突→412（仅三字段）；无会话→401。 */
export const PUT = async (event: RequestEvent): Promise<Response> => {
  const ctx = requireSession(event);
  if (ctx instanceof Response) return ctx;

  const raw = (await event.request.json()) as Partial<VaultPutRequest> | null;
  if (
    raw === null ||
    typeof raw.expectedVersion !== 'number' ||
    raw.encryptedBlob === undefined ||
    raw.encryptedBlob === ''
  ) {
    return json({ error: 'invalid request body' }, { status: 400 });
  }

  try {
    const version = await updateVaultBlob(ctx.userId, raw.expectedVersion, raw.encryptedBlob);
    return json({ version });
  } catch (e) {
    if (e instanceof OccConflictError) {
      // Architecture §9.1 VaultConflictResponse：严格三字段，不含 wrappedDekByRecovery/passkey 行。
      return json(
        {
          serverVersion: e.serverVersion,
          encryptedBlob: e.serverEncryptedBlob,
          wrappedDekByMaster: e.serverWrappedDekByMaster,
        },
        { status: 412 },
      );
    }
    throw e;
  }
};
