// src/lib/server/db/passkey-wrap.ts — passkey_wrap 表 CRUD (Design §5.1, task 4.7)
// 不动 vault 行、不参与 OCC。credentialId 唯一冲突→ConflictError；行不存在→NotFoundError。
// 依赖方向：db → schema + models。
import '$server-only';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { ConflictError, NotFoundError } from '$lib/models/errors';
import type { PasskeyWrapCreateRequest, PasskeyWrapRow } from '$lib/models/api';

import { db } from './index';
import { passkeyWrap } from './schema';

/** 列出本用户全部 PRF 包装（解锁页探测已绑定 Passkey）。 */
export async function listPasskeyWraps(userId: string): Promise<PasskeyWrapRow[]> {
  const rows = await db
    .select({
      id: passkeyWrap.id,
      credentialId: passkeyWrap.credentialId,
      wrappedDekByPrf: passkeyWrap.wrappedDekByPrf,
      createdAt: passkeyWrap.createdAt,
    })
    .from(passkeyWrap)
    .where(eq(passkeyWrap.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    credentialId: r.credentialId,
    wrappedDekByPrf: r.wrappedDekByPrf,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * 绑定一个 Passkey 的 PRF 包装。
 * credentialId 唯一冲突（PG 23505）→ ConflictError。id 由本函数生成（请求体不含 id）。
 */
export async function createPasskeyWrap(
  userId: string,
  req: PasskeyWrapCreateRequest,
): Promise<PasskeyWrapRow> {
  const id = randomUUID();
  try {
    const [row] = await db
      .insert(passkeyWrap)
      .values({
        id,
        userId,
        credentialId: req.credentialId,
        wrappedDekByPrf: req.wrappedDekByPrf,
      })
      .returning({
        id: passkeyWrap.id,
        credentialId: passkeyWrap.credentialId,
        wrappedDekByPrf: passkeyWrap.wrappedDekByPrf,
        createdAt: passkeyWrap.createdAt,
      });

    if (!row) {
      throw new ConflictError(new Response(null, { status: 409 }), { cause: '插入未返回行' });
    }

    return {
      id: row.id,
      credentialId: row.credentialId,
      wrappedDekByPrf: row.wrappedDekByPrf,
      createdAt: row.createdAt.toISOString(),
    };
  } catch (e) {
    // PG 唯一约束违反（credential_id_unique）→ 23505。
    // drizzle-orm 0.45 将 pg 错误包装为 DrizzleQueryError，PG code 位于 .cause.code。
    const code =
      typeof e === 'object' && e !== null && 'cause' in e
        ? (e as { cause?: { code?: string } }).cause?.code
        : (e as { code?: string }).code;
    if (code === '23505') {
      throw new ConflictError(new Response(null, { status: 409 }), { cause: e });
    }
    throw e;
  }
}

/**
 * 撤销指定 Passkey 的 PRF 包装。
 * 行不存在（userId + credentialId 无匹配）→ NotFoundError。
 */
export async function deletePasskeyWrap(userId: string, credentialId: string): Promise<void> {
  const deleted = await db
    .delete(passkeyWrap)
    .where(and(eq(passkeyWrap.userId, userId), eq(passkeyWrap.credentialId, credentialId)))
    .returning({ id: passkeyWrap.id });

  if (deleted.length === 0) {
    throw new NotFoundError(new Response(null, { status: 404 }));
  }
}
