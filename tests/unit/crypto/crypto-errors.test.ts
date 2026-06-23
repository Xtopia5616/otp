// tests/unit/crypto/crypto-errors.test.ts — CryptoError 细化子类单测 (Stage 2.1)
// 覆盖：各子类可实例化、code/operation 正确、instanceof CryptoError 成立、DecryptionError 默认消息。
import { describe, it, expect } from 'vitest';
import { CryptoError } from '$lib/models/errors';
import { DecryptionError, KdfError, EncodingError, FormatError } from '$lib/crypto/errors';

describe('DecryptionError', () => {
  it('uses code DECRYPTION_ERROR and operation decrypt', () => {
    const e = new DecryptionError();
    expect(e.code).toBe('DECRYPTION_ERROR');
    expect(e.operation).toBe('decrypt');
  });

  it('has default message 解密失败', () => {
    expect(new DecryptionError().message).toBe('解密失败');
  });

  it('accepts a custom message', () => {
    expect(new DecryptionError('AEAD failed').message).toBe('AEAD failed');
  });

  it('is instanceof CryptoError', () => {
    expect(new DecryptionError()).toBeInstanceOf(CryptoError);
  });
});

describe('KdfError', () => {
  it('uses code KDF_ERROR and operation kdf', () => {
    const e = new KdfError('bad params');
    expect(e.code).toBe('KDF_ERROR');
    expect(e.operation).toBe('kdf');
    expect(e.message).toBe('bad params');
    expect(e).toBeInstanceOf(CryptoError);
  });
});

describe('EncodingError', () => {
  it('uses code ENCODING_ERROR and operation decode', () => {
    const e = new EncodingError('bad base32');
    expect(e.code).toBe('ENCODING_ERROR');
    expect(e.operation).toBe('decode');
    expect(e.message).toBe('bad base32');
    expect(e).toBeInstanceOf(CryptoError);
  });
});

describe('FormatError', () => {
  it('uses code FORMAT_ERROR and operation decode', () => {
    const e = new FormatError('bad envelope');
    expect(e.code).toBe('FORMAT_ERROR');
    expect(e.operation).toBe('decode');
    expect(e.message).toBe('bad envelope');
    expect(e).toBeInstanceOf(CryptoError);
  });
});

describe('CryptoError subclass operation isolation', () => {
  it('FormatError and EncodingError share operation decode (Engineering §6.1)', () => {
    expect(new FormatError('x').operation).toBe('decode');
    expect(new EncodingError('x').operation).toBe('decode');
  });

  it('DecryptionError and KdfError have distinct operations', () => {
    expect(new DecryptionError().operation).toBe('decrypt');
    expect(new KdfError('x').operation).toBe('kdf');
  });
});
