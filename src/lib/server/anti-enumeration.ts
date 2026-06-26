// src/lib/server/anti-enumeration.ts — 反枚举伪参数 (Design §5.3 / Architecture §8.1/§8.5, task 4.11)
// 对不存在邮箱确定性派生形状/耗时一致的伪 AuthParamsResponse 与伪 RecoverInitResponse。
// HMAC(email, SERVER_SECRET) 确定性派生；字段/base64 长度/类型与真实响应完全一致。
import '$server-only';
import { createHmac } from 'node:crypto';
import { SERVER_SECRET } from '$env/static/private';
import type { AuthParamsResponse, RecoverInitResponse } from '$lib/models/api';

// 真实盐均为 16 字节 → base64 恒 24 字符；伪盐须一致。
const SALT_BYTES = 16;
const IV_BYTES = 12; // Blob 封装 IV 12 字节 → base64 16 字符
const CT_BYTES = 32; // 伪密文长度（真实 Blob 长度随账户数变化，此处取代表性长度）
const PSEUDO_KDF = {
  kdfAlgo: 'argon2id' as const,
  kdfMemoryKiB: 65536,
  kdfIterations: 3,
  kdfParallelism: 4,
};

/**
 * 经 HMAC-SHA256(email, SERVER_SECRET) 确定性派生 n 字节伪随机（domain 分隔）。
 * 同一 email 恒得同一输出（确定性）；不同 email 输出不可预测（SERVER_SECRET 私有）。
 * n≤32 直接取 HMAC 摘要前 n 字节；n>32 按 RFC 5869 HKDF-Expand 链式扩展。
 */
function deriveBytes(email: string, domain: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  let off = 0;
  let counter = 0;
  let prev: Buffer | undefined;
  while (off < n) {
    const h = createHmac('sha256', SERVER_SECRET);
    h.update(`${domain}:${email}`);
    if (prev) h.update(prev);
    h.update(Buffer.from([counter]));
    const block = h.digest(); // 32 字节
    const take = Math.min(block.length, n - off);
    out.set(block.subarray(0, take), off);
    off += take;
    prev = block;
    counter++;
  }
  return out;
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/**
 * 派生伪 AuthParamsResponse（不存在邮箱）。
 * loginSalt/kdfSalt 为 16 字节伪盐（base64 24 字符，与真实一致）；prfSalt=null
 * （与「未绑定 Passkey」真实状态一致——绑定 Passkey 的真实用户的 prfSalt 非空属已知残留）。
 */
export function derivePseudoAuthParams(email: string): AuthParamsResponse {
  return {
    ...PSEUDO_KDF,
    loginSalt: b64(deriveBytes(email, 'loginSalt', SALT_BYTES)),
    kdfSalt: b64(deriveBytes(email, 'kdfSalt', SALT_BYTES)),
    prfSalt: null,
  };
}

/**
 * 派生伪 RecoverInitResponse（不存在邮箱）。
 * recoverySalt/recoveryVerifierSalt 为 16 字节伪盐（base64 24 字符，与真实一致）；
 * wrappedDekByRecovery/encryptedBlob 为形状一致的伪 "v=1;iv=...;ct=..." 封装串。
 */
export function derivePseudoRecoveryMaterial(email: string): RecoverInitResponse {
  const wrap = `v=1;iv=${b64(deriveBytes(email, 'wrapIv', IV_BYTES))};ct=${b64(deriveBytes(email, 'wrapCt', CT_BYTES))}`;
  const blob = `v=1;iv=${b64(deriveBytes(email, 'blobIv', IV_BYTES))};ct=${b64(deriveBytes(email, 'blobCt', CT_BYTES))}`;
  return {
    ...PSEUDO_KDF,
    recoverySalt: b64(deriveBytes(email, 'recoverySalt', SALT_BYTES)),
    recoveryVerifierSalt: b64(deriveBytes(email, 'recoveryVerifierSalt', SALT_BYTES)),
    wrappedDekByRecovery: wrap,
    encryptedBlob: blob,
  };
}
