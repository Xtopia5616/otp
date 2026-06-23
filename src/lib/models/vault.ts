// src/lib/models/vault.ts — Vault API 契约 (Architecture §9.1)
// 纯类型层，零运行时依赖。

/** GET /api/vault 响应 */
export interface VaultResponse {
  version: number;
  /** 密文 Blob，结构 "v=1;iv=...;ct=..." */
  encryptedBlob: string;
  wrappedDekByMaster: string;
  wrappedDekByRecovery: string;
  /** ISO 时间戳 */
  updatedAt: string;
}

/** PUT /api/vault 请求体（CAS） */
export interface VaultPutRequest {
  expectedVersion: number;
  encryptedBlob: string;
}

/** PUT /api/vault 成功响应 */
export interface VaultPutResponse {
  version: number;
}

/**
 * PUT /api/vault 412 冲突响应体（Architecture §9.1 注）。
 * 仅含合并所需三字段；不含 `wrappedDekByRecovery`（恒定，仅重置才变）
 * 与 passkey_wrap 行（独立表，按需 GET /api/passkey-wraps）。
 */
export interface VaultConflictResponse {
  serverVersion: number;
  encryptedBlob: string;
  wrappedDekByMaster: string;
}

/** POST /api/vault 请求体（注册时初始化 Vault，version=1） */
export interface VaultCreateRequest {
  wrappedDekByMaster: string;
  wrappedDekByRecovery: string;
  /** 初始空账户列表加密结果 */
  encryptedBlob: string;
}

/** POST /api/vault 成功响应（恒为 1） */
export interface VaultCreateResponse {
  version: number;
}
