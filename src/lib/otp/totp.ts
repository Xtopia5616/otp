// src/lib/otp/totp.ts — TOTP 计算 + 验证 (RFC 6238, Stage 3.2, CryptoSpec §10.4/§10.5)
// 纯函数，委托 generateHOTP。secret 为原始字节（同 hotp.ts 约定）。
import { generateHOTP } from './hotp';

/**
 * generateTOTP 参数。`secret` 为原始字节。
 * `period`/`time` 缺省时分别取 30 秒与当前时间。
 */
export interface GenerateTotpParams {
  /** 共享密钥原始字节 */
  secret: Uint8Array;
  /** HMAC 算法 */
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  /** 验证码位数 */
  digits: 6 | 8;
  /** TOTP 步长（秒），默认 30 */
  period?: number;
  /** 当前时间（epoch 秒），默认 Date.now()/1000 */
  time?: number;
}

/**
 * 计算 TOTP 验证码（RFC 6238）。
 *
 * 动态因子 T = floor(time / period)，委托 generateHOTP(counter=BigInt(T))。
 *
 * @returns 零填充的数字验证码字符串
 */
export async function generateTOTP(params: GenerateTotpParams): Promise<string> {
  const { secret, algorithm, digits, period = 30, time = Date.now() / 1000 } = params;
  const T = Math.floor(time / period);
  return generateHOTP({ secret, algorithm, digits, counter: BigInt(T) });
}

/**
 * verifyTOTP 参数。
 * `window` 为前后容忍周期数，默认 1（比对 [T-window, T+window]）。
 */
export interface VerifyTotpParams {
  /** 用户输入的验证码 */
  token: string;
  /** 共享密钥原始字节 */
  secret: Uint8Array;
  /** HMAC 算法 */
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  /** 验证码位数 */
  digits: 6 | 8;
  /** TOTP 步长（秒），默认 30 */
  period?: number;
  /** 容忍窗口（前后各 N 周期），默认 1 */
  window?: number;
  /** 当前时间（epoch 秒），默认 Date.now()/1000 */
  time?: number;
}

/**
 * 验证 TOTP 验证码（含前后窗口容忍，RFC 6238 §6）。
 *
 * 在 [T-window, T+window] 范围内逐一生成并比对；命中即返回 true。
 * CryptoSpec §10 验证窗口默认 ±1，防时钟漂移误判；不可放宽至 ±2 以上。
 *
 * 安全说明：`token === expected` 为非常量时间比较（短路返回）。这是**有意为之**——
 * 常量时间比较（Architecture §8.5 / Stage 4.13）仅用于服务端 `recoveryVerifier`（远程授权）；
 * 本函数为客户端本地验证（token 与本地生成值比对），无远程攻击者观测时序，规格未要求常量时间。
 *
 * @returns 是否验证通过
 */
export async function verifyTOTP(params: VerifyTotpParams): Promise<boolean> {
  const {
    token,
    secret,
    algorithm,
    digits,
    period = 30,
    window = 1,
    time = Date.now() / 1000,
  } = params;
  const T = Math.floor(time / period);
  for (let i = -window; i <= window; i++) {
    const expected = await generateHOTP({ secret, algorithm, digits, counter: BigInt(T + i) });
    if (token === expected) {
      return true;
    }
  }
  return false;
}
