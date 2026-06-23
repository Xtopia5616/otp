// tests/fixtures/crypto-constants.ts — 测试专用固定密钥/盐值常量 (Testing §2.1)
// ⚠️ 仅用于测试，绝不可在生产环境使用。

/** 固定 256 位 DEK（32 字节全 0x01） */
export const TEST_DEK = new Uint8Array(32).fill(0x01);

/** 固定 96 位 IV（12 字节全 0x02）—— 仅用于确定性测试，生产必须随机 */
export const TEST_IV = new Uint8Array(12).fill(0x02);

/** 第二组 IV，用于 IV 不复用断言 */
export const TEST_IV_2 = new Uint8Array(12).fill(0x03);

/** 固定 16 字节盐值 */
export const TEST_SALT = new Uint8Array(16).fill(0xaa);

/** 第二组盐值，用于不同派生路径隔离断言 */
export const TEST_SALT_2 = new Uint8Array(16).fill(0xbb);

/** 测试用主密码 */
export const TEST_MP = 'TestPassword123!';

/** 测试用恢复密钥（96 位/12 字节，base32 编码恰好 20 字符，4-4-4-4-4 分组） */
export const TEST_RK_BASE32 = 'A4MC-SOSL-LRWX-5D5A-WHBA';

/** 测试用 HKDF info 参数（与架构 §3.4 / CryptoSpec §5.4 一致） */
export const HKDF_INFO = 'WebOTP/KEK-PRF/v1';
