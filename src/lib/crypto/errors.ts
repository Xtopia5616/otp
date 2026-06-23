// src/lib/crypto/errors.ts — CryptoError 细化子类 (Stage 2.1, Engineering §6.1, CryptoSpec §4.5)
// 物理位置约定（权威）：CryptoError 基类在 models/errors.ts，细化子类在本文件。
// 仅 import CryptoError 基类自 models/errors.ts，不反向引入其他错误（依赖边 crypto/ → models/ 单向）。
import { CryptoError } from '$lib/models/errors';

/**
 * AEAD 解密/认证失败（密钥不匹配或密文篡改）。
 * 触发：AES-GCM tag 校验失败、Blob JSON 解析失败。
 * operation = 'decrypt'。
 */
export class DecryptionError extends CryptoError {
  readonly code = 'DECRYPTION_ERROR';
  constructor(message = '解密失败', options?: ErrorOptions) {
    super(message, 'decrypt', options);
  }
}

/**
 * Argon2id 派生失败（参数非法 / Wasm 加载失败）。
 * operation = 'kdf'。
 */
export class KdfError extends CryptoError {
  readonly code = 'KDF_ERROR';
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'kdf', options);
  }
}

/**
 * base32/base64 编解码失败（非法字符、空串）。
 * operation = 'decode'。
 */
export class EncodingError extends CryptoError {
  readonly code = 'ENCODING_ERROR';
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'decode', options);
  }
}

/**
 * 密文封装格式错误（解析失败、版本未知、IV 长度非法、字段缺失）。
 * operation = 'decode'（与 EncodingError 同为 'decode'，Engineering §6.1）。
 */
export class FormatError extends CryptoError {
  readonly code = 'FORMAT_ERROR';
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'decode', options);
  }
}
