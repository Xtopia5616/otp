// src/lib/otp/otpauth-uri.ts — otpauth URI 解析/构建 (Stage 3.3)
// 解析 otpauth:// URI 为 AccountDraft（待调用方补 id/createdAt/updatedAt/deletedAt）；
// 构建用于导出的 otpauth URI。
// 依赖 crypto/encoding 的 base32 编解码校验 secret；非法输入抛 EncodingError（Design §3.3 错误契约）。
import { base32Decode, base32Encode } from '$lib/crypto/encoding';
import { EncodingError } from '$lib/crypto/errors';
import type { Account, AccountDraft, OtpauthParsed } from '$lib/models/account';

const VALID_ALGORITHMS: Record<string, true> = { SHA1: true, SHA256: true, SHA512: true };
const DEFAULT_PERIOD = 30;

/**
 * 解析 otpauth URI 为 AccountDraft。
 *
 * 支持格式：`otpauth://{totp|hotp}/[Issuer:]label?secret=...&issuer=...&algorithm=...&digits=...&period=...&counter=...`
 *
 * 默认值：algorithm=SHA1、digits=6、period=30、HOTP counter="0"、TOTP counter=null。
 * secret 经 base32 解码校验并规范化为大写无填充形式（Account.secret 存储约定，Architecture §5.1）。
 *
 * @throws EncodingError — 非 otpauth 协议、非 totp/hotp 类型、缺 secret、secret 非 base32、参数非法
 */
export function parseOtpauthUri(uri: string): OtpauthParsed {
  // 1. URL 解析（otpauth 为非 special scheme，// 后 host 段承载类型）
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new EncodingError('otpauth parse failed: invalid URI');
  }

  if (url.protocol !== 'otpauth:') {
    throw new EncodingError('otpauth parse failed: not an otpauth URI');
  }

  // 2. 类型（host 段，大小写不敏感）
  const type = url.host.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') {
    throw new EncodingError(`otpauth parse failed: unsupported type '${url.host}'`);
  }

  // 3. 标签路径 [Issuer:]account —— 在解码前按字面 ':' 拆分，
  //    避免误拆 label 内被编码的 %3A（encodeURIComponent 将 ':' 编为 %3A）。
  const rawPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  let pathIssuer: string | null = null;
  let accountName: string;
  const colonIdx = rawPath.indexOf(':');
  try {
    if (colonIdx !== -1) {
      pathIssuer = decodeURIComponent(rawPath.slice(0, colonIdx));
      accountName = decodeURIComponent(rawPath.slice(colonIdx + 1));
    } else {
      accountName = decodeURIComponent(rawPath);
    }
  } catch {
    throw new EncodingError('otpauth parse failed: invalid percent-encoding in label');
  }

  // 4. 查询参数
  const params = url.searchParams;
  const secretParam = params.get('secret');
  if (secretParam === null) {
    throw new EncodingError('otpauth parse failed: missing secret');
  }

  // 5. 校验 + 规范化 secret（base32 解码失败抛 EncodingError，复用 crypto/encoding，Stage 3.4）
  const normalizedSecret = base32Encode(base32Decode(secretParam));

  // 6. algorithm（默认 SHA1，大小写不敏感）
  const algorithmParam = params.get('algorithm');
  const algorithm = (algorithmParam === null ? 'SHA1' : algorithmParam.toUpperCase()) as
    | 'SHA1'
    | 'SHA256'
    | 'SHA512';
  if (!VALID_ALGORITHMS[algorithm]) {
    throw new EncodingError(`otpauth parse failed: invalid algorithm '${algorithmParam}'`);
  }

  // 7. digits（默认 6）
  const digitsParam = params.get('digits');
  let digits: 6 | 8;
  if (digitsParam === null || digitsParam === '6') {
    digits = 6;
  } else if (digitsParam === '8') {
    digits = 8;
  } else {
    throw new EncodingError(`otpauth parse failed: invalid digits '${digitsParam}'`);
  }

  // 8. period（默认 30，须为正整数）
  const periodParam = params.get('period');
  let period = DEFAULT_PERIOD;
  if (periodParam !== null) {
    const parsed = Number(periodParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new EncodingError(`otpauth parse failed: invalid period '${periodParam}'`);
    }
    period = parsed;
  }

  // 9. counter（HOTP 默认 "0" 且须为非负整数字符串；TOTP 恒 null）
  let counter: string | null;
  if (type === 'hotp') {
    const counterParam = params.get('counter');
    if (counterParam === null) {
      counter = '0';
    } else if (/^\d+$/.test(counterParam)) {
      counter = counterParam;
    } else {
      throw new EncodingError(`otpauth parse failed: invalid counter '${counterParam}'`);
    }
  } else {
    counter = null;
  }

  // 10. issuer（query 参数优先，回退 label 前缀）
  //    空串 issuer（"?issuer="）视为缺失，回退 pathIssuer——避免空值覆盖 label 前缀。
  const issuerParam = params.get('issuer');
  const issuer = issuerParam !== null && issuerParam !== '' ? issuerParam : pathIssuer;

  return {
    type,
    issuer,
    label: accountName,
    secret: normalizedSecret,
    algorithm,
    digits,
    period,
    counter,
    icon: null,
  };
}

/**
 * 构建 otpauth URI（RFC 6238 otpauth 格式，用于导出）。
 *
 * path 段：`{Issuer}:{label}`（存在 issuer 时）或 `{label}`；':' 分隔符为字面量，
 * issuer/label 内的 ':' 经 encodeURIComponent 编为 %3A，确保解析时能正确还原。
 *
 * 接受 `Account`（导出场景，Design §3.3 / Stage03 3.3）或 `AccountDraft`——
 * `Account` 是 `AccountDraft` 的超集，结构兼容，生命周期字段（id/createdAt/updatedAt/deletedAt）被忽略。
 * 始终输出 period（即使 HOTP 不使用它）：保证 `parse → build → parse` 往返一致
 * （AccountDraft.period 为必填字段，Architecture §5.1）。
 */
export function buildOtpauthUri(account: Account | AccountDraft): string {
  const { type, issuer, label, secret, algorithm, digits, period, counter } = account;

  const encodedLabel = encodeURIComponent(label);
  const path = issuer === null ? encodedLabel : `${encodeURIComponent(issuer)}:${encodedLabel}`;

  const params = new URLSearchParams();
  params.set('secret', secret);
  if (issuer !== null) {
    params.set('issuer', issuer);
  }
  params.set('algorithm', algorithm);
  params.set('digits', String(digits));
  params.set('period', String(period));
  if (type === 'hotp') {
    params.set('counter', counter ?? '0');
  }

  return `otpauth://${type}/${path}?${params.toString()}`;
}
