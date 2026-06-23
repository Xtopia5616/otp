// src/lib/crypto/argon2.ts — Argon2id KEK/LAK/verifier 派生 (Stage 2.3, CryptoSpec §2 / §6)
// hash-wasm 纯 Wasm 实现。参数非法 / Wasm 加载失败 → KdfError，绝不静默降级。
import { argon2id } from 'hash-wasm';
import type { KdfParams } from '$lib/models/api';
import { KdfError } from '$lib/crypto/errors';
import { base64Encode } from '$lib/crypto/encoding';
import { secureWipe } from '$lib/crypto/secure-wipe';

/** Argon2id 输出长度，固定 32 字节（KEK / LAK / verifier 通用）。 */
const ARGON2ID_HASH_LENGTH = 32;

/**
 * 校验 KDF 参数结构合法性（salt 长度 + 各参数为正）。
 * 注：CryptoSpec §2.5 的生产阈值 memoryKiB≥8192 不在原语层强制——否则测试降速参数
 * (m=4096) 会被拒；生产阈值由注册层策略强制（Architecture §3.3）。
 */
function assertParams(salt: Uint8Array, params: KdfParams): void {
  if (salt.length !== 16) {
    throw new KdfError(`salt must be 16 bytes, got ${salt.length}`);
  }
  if (params.memoryKiB < 1) {
    throw new KdfError(`memoryKiB must be >= 1, got ${params.memoryKiB}`);
  }
  if (params.iterations < 1) {
    throw new KdfError(`iterations must be >= 1, got ${params.iterations}`);
  }
  if (params.parallelism < 1) {
    throw new KdfError(`parallelism must be >= 1, got ${params.parallelism}`);
  }
}

/**
 * 从根因子（MP 的 UTF-8 字节 或 RK 的原始字节）派生 32 字节 KEK 原始字节。
 * 用于 KEK_MP、KEK_RK 的派生（CryptoSpec §2.4）。
 *
 * 调用方负责导入为 CryptoKey 后 `secureWipe` 原始字节（CryptoSpec §9.2）。
 *
 * @param password - 根因子字节（MP 的 UTF-8 编码，或 RK 的原始 12 字节）
 * @param salt     - 16 字节盐（kdf_salt / recovery_salt，已 base64 解码）
 * @param params   - KDF 参数
 * @returns        - 32 字节 Uint8Array
 * @throws KdfError - salt 长度非法、参数非法、Wasm 加载/执行失败
 */
export async function deriveKEK(
  password: Uint8Array,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  assertParams(salt, params);

  try {
    return await argon2id({
      password,
      salt,
      parallelism: params.parallelism,
      memorySize: params.memoryKiB,
      iterations: params.iterations,
      hashLength: ARGON2ID_HASH_LENGTH,
      outputType: 'binary',
    });
  } catch (e) {
    throw new KdfError('argon2id derivation failed', { cause: e });
  }
}

/**
 * 派生 LAK（Login Authentication Key），提交 Better Auth 的"虚拟密码"（CryptoSpec §6）。
 * Argon2id(MP, login_salt, m, t, p) → 32 字节 → base64 字符串（约 44 字符）。
 *
 * @param mpBytes    - 主密码的 UTF-8 编码字节
 * @param loginSalt  - 16 字节登录盐（与 kdf_salt 互不复用）
 * @returns          - base64 编码的 LAK 字符串（44 字符）
 * @throws KdfError  - 参数非法 / Wasm 失败
 */
export async function deriveLAK(
  mpBytes: Uint8Array,
  loginSalt: Uint8Array,
  params: KdfParams,
): Promise<string> {
  const raw = await deriveKEK(mpBytes, loginSalt, params);
  const lak = base64Encode(raw);
  secureWipe(raw); // 擦除中间产物
  return lak;
}

/**
 * 派生 recoveryVerifier（RK 的 Argon2id 哈希，服务端常量时间校验以授权重置，CryptoSpec §1.1）。
 * Argon2id(RK, recovery_verifier_salt, m, t, p) → 32 字节 → base64 字符串。
 *
 * @param rkBytes         - 恢复密钥原始字节（12 字节）
 * @param verifierSalt    - 16 字节 verifier 盐（与 recovery_salt 互不复用）
 * @returns               - base64 编码的 verifier 字符串（44 字符）
 * @throws KdfError       - 参数非法 / Wasm 失败
 */
export async function deriveRecoveryVerifier(
  rkBytes: Uint8Array,
  verifierSalt: Uint8Array,
  params: KdfParams,
): Promise<string> {
  const raw = await deriveKEK(rkBytes, verifierSalt, params);
  const verifier = base64Encode(raw);
  secureWipe(raw); // 擦除中间产物
  return verifier;
}
