// src/lib/models/account.ts — 领域模型：OTP 账户 (Architecture §5.1)
// 纯类型层，零运行时依赖。

/**
 * OTP 账户（Architecture §5.1）。
 * 合并的唯一锚点为 `id`；`updatedAt` 为字段级仲裁依据；
 * `counter` 以字符串承载 bigint，避免 JSON number 精度丢失。
 */
export interface Account {
  /** UUID v4，客户端生成，全局唯一且不可变——三方合并的唯一锚点 */
  id: string;
  /** 算法类型 */
  type: 'totp' | 'hotp';
  /** 发行方，如 "GitHub"；用于分组与图标 */
  issuer: string | null;
  /** 账户标签，如用户名/邮箱 */
  label: string;
  /** base32（RFC 4648）共享密钥，大写、去填充、去空格存储 */
  secret: string;
  /** HMAC 算法，默认 SHA1（RFC 6238） */
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  /** 验证码位数，默认 6 */
  digits: 6 | 8;
  /** TOTP 步长（秒），默认 30；HOTP 忽略 */
  period: number;
  /** HOTP 计数器（字符串承载 bigint，JSON 安全；新建初值 "0"，单调递增）；TOTP 忽略 */
  counter: string | null;
  /** 可选图标标识 */
  icon: string | null;
  /** 创建时间（epoch ms） */
  createdAt: number;
  /** 最后修改时间（epoch ms）——合并的字段级仲裁依据 */
  updatedAt: number;
  /** 软删除墓碑；非空表示已删除，合并时拥有绝对优先级 */
  deletedAt: number | null;
}

/**
 * 账户草稿：otpauth 解析产物，缺少生命周期字段
 * （`id`/`createdAt`/`updatedAt`/`deletedAt`），由调用方补齐为完整 `Account`。
 * 新建账户 `deletedAt` 恒为 `null`，故不作为草稿必填字段。
 */
export type AccountDraft = Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/**
 * otpauth URI 解析结果（Stage 3 `parseOtpauthUri` 返回类型）。
 * 形状与 `AccountDraft` 一致：解析得到 OTP 配置字段，待调用方补齐生命周期字段。
 */
export type OtpauthParsed = AccountDraft;
