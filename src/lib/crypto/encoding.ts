// src/lib/crypto/encoding.ts — base32/base64 编解码 + Blob 封装格式 (Stage 2.2, CryptoSpec §4 / §7)
// 纯函数，无状态。非法输入显式抛 EncodingError/FormatError，绝不静默降级。
import { EncodingError, FormatError } from '$lib/crypto/errors';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ── base32 (RFC 4648) ──────────────────────────────────────────────

/**
 * RFC 4648 base32 解码。
 * 规范化（顺序固定）：移除空白/连字符 → 转大写 → 去尾部 `=` 填充。
 * 大小写不敏感；忽略空格/连字符/填充。
 *
 * @throws EncodingError — 空串、非法字符
 */
export function base32Decode(input: string): Uint8Array {
  // 1. 规范化：去空白/连字符、转大写、去尾部填充
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');

  if (cleaned.length === 0) {
    throw new EncodingError('base32 decode failed: empty input');
  }

  // 2. 验证字符集
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned.charAt(i);
    if (!BASE32_ALPHABET.includes(ch)) {
      throw new EncodingError(`base32 decode failed: invalid character at position ${i}: '${ch}'`);
    }
  }

  // 3. 解码：每 5 位 → 1 字节
  const outputLength = Math.floor((cleaned.length * 5) / 8);
  const output = new Uint8Array(outputLength);
  let bits = 0;
  let value = 0;
  let outputIndex = 0;

  for (let i = 0; i < cleaned.length; i++) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(cleaned.charAt(i));
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output[outputIndex++] = (value >>> bits) & 0xff;
    }
  }

  return output;
}

/**
 * RFC 4648 base32 编码（大写、无填充）。
 * 用于 RK 生成展示。
 */
export function base32Encode(bytes: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET.charAt((value >>> bits) & 0x1f);
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET.charAt((value << (5 - bits)) & 0x1f);
  }

  return result;
}

// ── base64 (RFC 4648 §4，标准，有填充) ────────────────────────────

/** 标准 base64 编码（RFC 4648 §4，有填充）。盐值/密文/verifier 通用。 */
export function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * 标准 base64 解码（RFC 4648 §4，有填充）。
 * @throws EncodingError — 非法 base64
 */
export function base64Decode(input: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(input);
  } catch {
    throw new EncodingError('base64 decode failed: invalid base64 input');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Blob 封装格式 (CryptoSpec §4) ─────────────────────────────────

/** Blob 封装解析结果 */
export interface ParsedBlob {
  /** 格式版本号（当前恒为 1） */
  version: number;
  /** 12 字节 IV */
  iv: Uint8Array;
  /** 密文 + 128 位 tag（≥ 16 字节） */
  ciphertext: Uint8Array;
}

/**
 * 将密文与 IV 序列化为封装格式字符串。
 * 格式：`v=<version>;iv=<base64>;ct=<base64>`（CryptoSpec §4.2）
 */
export function serializeBlob(parts: {
  version: number;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}): string {
  return `v=${parts.version};iv=${base64Encode(parts.iv)};ct=${base64Encode(parts.ciphertext)}`;
}

/**
 * 解析 Blob 封装格式字符串。
 *
 * 拒绝条件（均抛 FormatError）：字段缺失、`v≠1`、IV≠12 字节、非法 base64、
 * 密文过短（< 16 字节，AES-GCM 最小输出）、空串（CryptoSpec §4.3 / §4.4）。
 */
export function parseBlob(encoded: string): ParsedBlob {
  // 1. 必须为 3 个分号分隔字段
  const parts = encoded.split(';');
  if (parts.length !== 3) {
    throw new FormatError('invalid envelope format: expected 3 semicolon-separated parts');
  }

  const [vPart, ivPart, ctPart] = parts as [string, string, string];

  // 2. 版本号
  if (!vPart.startsWith('v=')) {
    throw new FormatError('invalid envelope format: missing version prefix');
  }
  const version = parseInt(vPart.slice(2), 10);
  if (Number.isNaN(version) || version !== 1) {
    throw new FormatError(`unsupported envelope version: ${vPart.slice(2)}`);
  }

  // 3. IV（必须 12 字节）
  if (!ivPart.startsWith('iv=')) {
    throw new FormatError('invalid envelope format: missing iv prefix');
  }
  let iv: Uint8Array;
  try {
    iv = base64Decode(ivPart.slice(3));
  } catch {
    throw new FormatError('invalid envelope format: iv is not valid base64');
  }
  if (iv.length !== 12) {
    throw new FormatError(`invalid IV length: expected 12 bytes, got ${iv.length}`);
  }

  // 4. 密文（≥ 16 字节：AES-GCM 空明文 + 128 位 tag）
  if (!ctPart.startsWith('ct=')) {
    throw new FormatError('invalid envelope format: missing ct prefix');
  }
  let ciphertext: Uint8Array;
  try {
    ciphertext = base64Decode(ctPart.slice(3));
  } catch {
    throw new FormatError('invalid envelope format: ct is not valid base64');
  }
  if (ciphertext.length < 16) {
    throw new FormatError(`ciphertext too short: expected >= 16 bytes, got ${ciphertext.length}`);
  }

  return { version, iv, ciphertext };
}
