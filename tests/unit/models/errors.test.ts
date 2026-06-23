// tests/unit/models/errors.test.ts — 错误类单测 (Stage 1.7)
// 覆盖：各子类可实例化、code 字段正确、instanceof WebOtpError 成立、
// OccConflictError 三字段可读、SessionRevokedError 默认消息、ApiError 子类携带 response/status。
import { describe, it, expect } from 'vitest';
import {
  WebOtpError,
  CryptoError,
  OccConflictError,
  NetworkError,
  SessionRevokedError,
  ApiError,
  RateLimitError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServerError,
} from '$lib/models/errors';

describe('WebOtpError base', () => {
  it('sets name to the concrete constructor name', () => {
    expect(new CryptoError('boom', 'encrypt').name).toBe('CryptoError');
    expect(new SessionRevokedError().name).toBe('SessionRevokedError');
  });

  it('propagates message', () => {
    expect(new CryptoError('boom', 'encrypt').message).toBe('boom');
  });
});

describe('CryptoError', () => {
  it('carries code and operation', () => {
    const err = new CryptoError('kdf failed', 'kdf');
    expect(err.code).toBe('CRYPTO_ERROR');
    expect(err.operation).toBe('kdf');
    expect(err).toBeInstanceOf(WebOtpError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('OccConflictError', () => {
  it('carries the three server fields', () => {
    const err = new OccConflictError('conflict', 7, 'blob-ct', 'wrap-ct');
    expect(err.code).toBe('OCC_CONFLICT');
    expect(err.serverVersion).toBe(7);
    expect(err.serverEncryptedBlob).toBe('blob-ct');
    expect(err.serverWrappedDekByMaster).toBe('wrap-ct');
    expect(err).toBeInstanceOf(WebOtpError);
  });
});

describe('NetworkError', () => {
  it('carries optional cause and statusCode', () => {
    const cause = new TypeError('fetch failed');
    const err = new NetworkError('offline', cause, 500);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.cause).toBe(cause);
    expect(err.statusCode).toBe(500);
    expect(err).toBeInstanceOf(WebOtpError);
  });

  it('allows omitting cause and statusCode', () => {
    const err = new NetworkError('timeout');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.cause).toBeUndefined();
    expect(err.statusCode).toBeUndefined();
  });
});

describe('SessionRevokedError', () => {
  it('uses the default message when none given', () => {
    const err = new SessionRevokedError();
    expect(err.code).toBe('SESSION_REVOKED');
    expect(err.message).toBe('会话已被吊销，请重新登录');
    expect(err).toBeInstanceOf(WebOtpError);
  });

  it('accepts a custom message', () => {
    expect(new SessionRevokedError('custom').message).toBe('custom');
  });
});

describe('ApiError', () => {
  it('carries response, status and a default message', () => {
    const res = new Response(null, { status: 418 });
    const err = new ApiError(res);
    expect(err.code).toBe('API_ERROR');
    expect(err.response).toBe(res);
    expect(err.status).toBe(418);
    expect(err.message).toBe('HTTP 418');
    expect(err).toBeInstanceOf(WebOtpError);
  });

  it('accepts a custom message', () => {
    const res = new Response(null, { status: 400 });
    expect(new ApiError(res, 'bad').message).toBe('bad');
  });
});

describe('ApiError subclasses', () => {
  it('RateLimitError carries retryAfter and inherits ApiError', () => {
    const res = new Response(null, { status: 429 });
    const err = new RateLimitError(res, 30);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.retryAfter).toBe(30);
    expect(err.status).toBe(429);
    expect(err.response).toBe(res);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(WebOtpError);
  });

  it('ForbiddenError', () => {
    const err = new ForbiddenError(new Response(null, { status: 403 }));
    expect(err.code).toBe('FORBIDDEN');
    expect(err.status).toBe(403);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('NotFoundError', () => {
    const err = new NotFoundError(new Response(null, { status: 404 }));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('ConflictError', () => {
    const err = new ConflictError(new Response(null, { status: 409 }));
    expect(err.code).toBe('CONFLICT');
    expect(err.status).toBe(409);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('ServerError', () => {
    const err = new ServerError(new Response(null, { status: 500 }));
    expect(err.code).toBe('SERVER_ERROR');
    expect(err.status).toBe(500);
    expect(err).toBeInstanceOf(ApiError);
  });
});
