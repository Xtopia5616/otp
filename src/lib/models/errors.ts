// src/lib/models/errors.ts — 错误类基类与非 crypto 子类 (Engineering §6.1)
// 零依赖。CryptoError 细化子类（DecryptionError/KdfError/EncodingError/FormatError）
// 归 src/lib/crypto/errors.ts（Stage 2），不在本文件。

/**
 * WebOTP 统一错误基类
 * 所有领域错误的父类，便于 catch 时类型守卫
 */
export abstract class WebOtpError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/**
 * 密码学操作错误
 * 触发场景：AEAD 解密失败（密钥不匹配/密文篡改）、Argon2id 参数非法、base32 解码失败
 * 被 StateMachines.md 引用：解锁流程、Blob 解密、RK 验证
 */
export class CryptoError extends WebOtpError {
  readonly code = 'CRYPTO_ERROR';

  constructor(
    message: string,
    /** 失败的具体操作，用于日志和调试（不暴露密钥材料） */
    readonly operation: 'encrypt' | 'decrypt' | 'kdf' | 'wrap' | 'unwrap' | 'decode',
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * OCC 版本冲突错误
 * 触发场景：PUT /api/vault 返回 412 Precondition Failed
 * 被 StateMachines.md 引用：同步状态机 conflict 分支，触发三方合并
 */
export class OccConflictError extends WebOtpError {
  readonly code = 'OCC_CONFLICT';

  constructor(
    message: string,
    /** 服务端当前版本号 */
    readonly serverVersion: number,
    /** 服务端当前加密 Blob */
    readonly serverEncryptedBlob: string,
    /** 服务端当前 wrappedDekByMaster（用于检测是否被轮换） */
    readonly serverWrappedDekByMaster: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * 网络错误
 * 触发场景：fetch 失败、超时、断网
 * 被 StateMachines.md 引用：同步状态机 offline 分支，进入离线模式
 */
export class NetworkError extends WebOtpError {
  readonly code = 'NETWORK_ERROR';

  constructor(
    message: string,
    /** 原始错误（fetch 抛出的 TypeError 等） */
    readonly cause?: Error,
    /** HTTP 状态码（如为 HTTP 错误） */
    readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * 会话吊销错误
 * 触发场景：API 返回 401 Unauthorized（会话被其他设备吊销，见 Architecture §8.3）
 * 被 StateMachines.md 引用：auth 状态机 → 强制锁定 → 跳转登录页
 */
export class SessionRevokedError extends WebOtpError {
  readonly code = 'SESSION_REVOKED';

  constructor(message = '会话已被吊销，请重新登录', options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * HTTP 错误基类
 * 触发场景：所有非 2xx HTTP 响应（412/401 由 OccConflictError/SessionRevokedError 专用）
 * 携带原始 Response 供调用方读取 body/headers
 */
export class ApiError extends WebOtpError {
  // 显式标注 string：基类字面量 'API_ERROR' 会阻止子类以各自字面量覆写（TS2416）
  readonly code: string = 'API_ERROR';
  readonly response: Response;
  readonly status: number;

  constructor(response: Response, message?: string, options?: ErrorOptions) {
    super(message ?? `HTTP ${response.status}`, options);
    this.response = response;
    this.status = response.status;
  }
}

/** 限流错误（429） */
export class RateLimitError extends ApiError {
  readonly code = 'RATE_LIMIT';
  constructor(
    response: Response,
    readonly retryAfter: number,
    options?: ErrorOptions,
  ) {
    super(response, '操作过于频繁', options);
  }
}

/** 权限不足（403） */
export class ForbiddenError extends ApiError {
  readonly code = 'FORBIDDEN';
  constructor(response: Response, options?: ErrorOptions) {
    super(response, '权限不足', options);
  }
}

/** 资源不存在（404） */
export class NotFoundError extends ApiError {
  readonly code = 'NOT_FOUND';
  constructor(response: Response, options?: ErrorOptions) {
    super(response, '资源不存在', options);
  }
}

/** 资源已存在（409） */
export class ConflictError extends ApiError {
  readonly code = 'CONFLICT';
  constructor(response: Response, options?: ErrorOptions) {
    super(response, '资源已存在', options);
  }
}

/** 服务端错误（5xx） */
export class ServerError extends ApiError {
  readonly code = 'SERVER_ERROR';
  constructor(response: Response, options?: ErrorOptions) {
    super(response, '服务暂时不可用', options);
  }
}
