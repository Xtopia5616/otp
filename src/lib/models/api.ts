// src/lib/models/api.ts — API 请求/响应契约 + KdfParams (Architecture §9.1 + CryptoSpec §2.3)
// 纯类型层，零运行时依赖。

/** KDF 参数（CryptoSpec §2.3），从 user 表读取或由 GET /api/auth-params 返回 */
export interface KdfParams {
  algo: 'argon2id';
  /** m，推荐 65536 */
  memoryKiB: number;
  /** t，推荐 3 */
  iterations: number;
  /** p，推荐 4 */
  parallelism: number;
}

/** GET /api/auth-params?email= 响应（反枚举端点，不存在邮箱返回伪参数） */
export interface AuthParamsResponse {
  kdfAlgo: 'argon2id';
  kdfMemoryKiB: number;
  kdfIterations: number;
  kdfParallelism: number;
  /** base64 */
  loginSalt: string;
  /** base64 */
  kdfSalt: string;
  /** 用户级盐；null = 未绑定 Passkey */
  prfSalt: string | null;
}

/** POST /api/vault/rotate-key 请求体（不动 Blob/version） */
export interface RotateKeyRequest {
  /** 新 LAK（服务器再哈希） */
  newLak: string;
  newLoginSalt: string;
  newKdfSalt: string;
  /** 新 KEK_MP 包装的同一 DEK */
  newWrappedDekByMaster: string;
}

/** POST /api/passkey-wraps 请求体（绑定一个 Passkey 的 PRF 包装；不动 vault 行，不参与 OCC） */
export interface PasskeyWrapCreateRequest {
  /** WebAuthn 凭证 ID（base64url） */
  credentialId: string;
  /** "v=1;iv=...;ct=..." */
  wrappedDekByPrf: string;
}

/** GET /api/passkey-wraps 行类型 */
export interface PasskeyWrapRow {
  id: string;
  credentialId: string;
  wrappedDekByPrf: string;
  /** ISO */
  createdAt: string;
}

/** POST /api/vault/recover/init 请求体（无会话，限流） */
export interface RecoverInitRequest {
  email: string;
}

/** POST /api/vault/recover/init 响应（无会话，限流） */
export interface RecoverInitResponse {
  kdfAlgo: 'argon2id';
  kdfMemoryKiB: number;
  kdfIterations: number;
  kdfParallelism: number;
  /** KEK_RK 派生盐 */
  recoverySalt: string;
  /** recoveryVerifier 派生盐 */
  recoveryVerifierSalt: string;
  wrappedDekByRecovery: string;
  encryptedBlob: string;
}

/** POST /api/vault/recover/reset 请求体（无会话） */
export interface RecoverResetRequest {
  email: string;
  /** 旧 RK 派生的 verifier，服务端常量时间校验以授权重置 */
  recoveryVerifier: string;
  newLak: string;
  newLoginSalt: string;
  newKdfSalt: string;
  /** 新 KEK_MP 包装同一 DEK */
  newWrappedDekByMaster: string;
  /** 新 RK + 新 recovery_salt 包装同一 DEK */
  newWrappedDekByRecovery: string;
  /** 新 RK 的 KEK 派生盐 */
  newRecoverySalt: string;
  /** 新 RK 的 verifier 派生盐 */
  newRecoveryVerifierSalt: string;
  /** 新 RK 的 Argon2id 哈希，覆盖旧 verifier */
  newRecoveryVerifier: string;
}
