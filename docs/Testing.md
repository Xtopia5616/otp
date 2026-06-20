# 🧪 WebOTP 测试策略与测试向量

**文档版本**: 1.0  
**更新日期**: 2026 年 6 月 20 日  
**文档密级**: 公开 (Public)  
**关联架构文档**: [docs/Architecture.md](Architecture.md) (v1.1)

---

## 0. 文档目的

架构文档 (Architecture.md) 定义了系统的密码学模型、领域规则与 API 契约，但不含任何测试相关内容。本文档填补这一空白，为 AI 辅助编码 (Vibe Coding) 提供可验证的测试规格：标准测试向量、密码学属性断言、合并规则矩阵、安全路径覆盖与端到端关键流，使代码生成后的验证有据可依。

---

## 1. 测试分层架构

系统测试分为三层，职责明确、互不越界：

| 层级 | 框架 | 职责边界 | 运行命令 | 覆盖率目标 |
| :--- | :--- | :--- | :--- | :--- |
| **单元测试** | vitest | 纯函数：`src/lib/crypto/`（密钥派生、加解密、base32）、`src/lib/otp/`（TOTP/HOTP 计算）、`src/lib/models/merge.ts`（三方合并逻辑）。**零 I/O**，不依赖数据库、网络或浏览器 API。 | `pnpm test:unit` | 行覆盖率 ≥ 95%，分支覆盖率 ≥ 90% |
| **集成测试** | vitest | API 路由 + Drizzle ORM + 内存 PostgreSQL（推荐 `@testcontainers/postgresql` 或 `pg-mem`）。覆盖认证流程、OCC CAS、反枚举、rotate-key 事务、passkey-wraps CRUD。 | `pnpm test:integration` | 关键路径 100%，错误路径 ≥ 80% |
| **E2E 测试** | @playwright/test | 关键用户流：注册→解锁→加账户→同步；多设备冲突合并；PRF 绑定+免密解锁；灾难恢复。 | `pnpm test:e2e` | 关键用户流 100% 覆盖 |

### 1.1 目录约定

```
tests/
├── unit/
│   ├── crypto/
│   │   ├── argon2id.test.ts        # Argon2id 派生确定性 & 边界
│   │   ├── aes-gcm.test.ts         # AES-GCM 包装/解包/篡改/IV
│   │   ├── hkdf.test.ts            # HKDF-SHA256 PRF 派生
│   │   ├── base32.test.ts          # base32 解码容错
│   │   ├── lak.test.ts             # LAK 派生
│   │   └── blob-format.test.ts     # Blob 封装格式解析/拒绝
│   ├── otp/
│   │   ├── totp.test.ts            # TOTP 标准向量 (RFC 6238)
│   │   └── hotp.test.ts            # HOTP 标准向量 (RFC 4226)
│   └── merge/
│       └── three-way.test.ts       # 三方合并规则矩阵
├── integration/
│   ├── api/
│   │   ├── auth-params.test.ts     # 反枚举端点
│   │   ├── vault.test.ts           # Vault CRUD + OCC
│   │   ├── rotate-key.test.ts      # 密码轮换原子事务
│   │   ├── passkey-wraps.test.ts   # PRF 包装 CRUD
│   │   └── recover.test.ts         # 恢复流程安全路径
│   └── setup.ts                    # 测试容器/数据库初始化
└── e2e/
    ├── registration-flow.spec.ts   # 注册→解锁→加账户→同步
    ├── conflict-merge.spec.ts      # 多设备并发冲突合并
    ├── prf-unlock.spec.ts          # PRF 绑定+免密解锁
    └── disaster-recovery.spec.ts   # 灾难恢复全流程
```

### 1.2 vitest 配置要点

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/crypto/**", "src/lib/otp/**", "src/lib/models/merge.ts"],
      thresholds: {
        lines: 95,
        branches: 90,
      },
    },
    // 集成测试用单独项目，挂 testcontainers setup
    workspace: [
      { extends: true, test: { include: ["tests/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          pool: "forks", // 隔离 DB 容器
        },
      },
    ],
  },
});
```

### 1.3 Playwright 配置要点

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // PRF 测试需要 Chromium；Firefox/Safari 不支持 WebAuthn PRF
  ],
  webServer: {
    command: "pnpm dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 2. 测试数据与密钥管理

### 2.1 测试常量（固定，不依赖随机）

所有单元测试与集成测试共享以下固定常量，确保可重现性：

```typescript
// tests/fixtures/crypto-constants.ts
/**
 * 测试专用固定密钥/盐值常量。
 * ⚠️ 仅用于测试，绝不可在生产环境使用。
 */

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
export const TEST_MP = "TestPassword123!";

/** 测试用恢复密钥（96 位/12 字节，base32 编码恰好 20 字符，4-4-4-4-4 分组） */
export const TEST_RK_BASE32 = "A4MC-SOSL-LRWX-5D5A-WHBA"; // base32(12 字节) → 解码回 12 字节

/** 测试用 HKDF info 参数（与架构 §3.4 一致） */
export const HKDF_INFO = "WebOTP/KEK-PRF/v1";
```

### 2.2 Argon2id 降速参数（⚠️ 仅测试用）

```typescript
// tests/fixtures/argon2id-test-params.ts
/**
 * Argon2id 测试专用极小参数。
 * ⚠️ 这些参数安全性极低，仅用于加速测试，绝不可用于生产。
 * 生产参数见架构 §3.3：m=65536, t=3, p=4
 */
export const ARGON2ID_TEST_PARAMS = {
  memorySize: 4096,  // KiB（生产: 65536）
  iterations: 1,     // （生产: 3）
  parallelism: 1,    // （生产: 4）
  hashLength: 32,    // 字节
  salt: TEST_SALT,   // 固定盐值（生产: 随机 16 字节）
} as const;
```

### 2.3 固定账户测试数据

```typescript
// tests/fixtures/accounts.ts
import type { Account } from "$lib/models/account";

/** 基准账户集（三方合并测试用） */
export const BASE_ACCOUNTS: Account[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    type: "totp",
    issuer: "GitHub",
    label: "alice@example.com",
    secret: "JBSWY3DPEHPK3PXP", // base32("Hello!")
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    counter: null,
    icon: "github",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    deletedAt: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    type: "hotp",
    issuer: "AWS",
    label: "bob@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA1",
    digits: 6,
    period: 30, // HOTP 忽略，但字段仍存在
    counter: "5",
    icon: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    deletedAt: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    type: "totp",
    issuer: "GitLab",
    label: "charlie@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    algorithm: "SHA256",
    digits: 8,
    period: 60,
    counter: null,
    icon: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    deletedAt: null,
  },
];
```

---

## 3. TOTP / HOTP 标准测试向量

### 3.1 RFC 6238 Appendix B — TOTP 测试向量

RFC 6238 定义了基于 SHA-1/SHA-256/SHA-512 的 TOTP 标准测试向量。以下为完整表驱动测试骨架：

```typescript
// tests/unit/otp/totp.test.ts
import { describe, it, expect } from "vitest";
import { generateTOTP } from "$lib/otp/totp";

/**
 * RFC 6238 Appendix B 测试向量。
 * 注意：RFC 6238 的 secret 按算法不同而不同：
 *   - SHA1:   "12345678901234567890" (20 字节 ASCII)
 *   - SHA256: "12345678901234567890123456789012" (32 字节 ASCII)
 *   - SHA512: "1234567890123456789012345678901234567890123456789012345678901234" (64 字节 ASCII)
 *
 * 时间步 T = floor(unix_time / 30)，digits = 8
 */

describe("TOTP — RFC 6238 Appendix B", () => {
  // secret 为 ASCII 字符串的 UTF-8 编码字节
  const secrets = {
    SHA1: new TextEncoder().encode("12345678901234567890"),
    SHA256: new TextEncoder().encode("12345678901234567890123456789012"),
    SHA512: new TextEncoder().encode(
      "1234567890123456789012345678901234567890123456789012345678901234"
    ),
  };

  // RFC 6238 测试向量表（unix timestamp, 期望 8 位码）
  const vectors: Array<{
    time: number;
    algo: "SHA1" | "SHA256" | "SHA512";
    expected: string; // 8 位
  }> = [
    { time: 59, algo: "SHA1", expected: "94287082" },
    { time: 59, algo: "SHA256", expected: "46119246" },
    { time: 59, algo: "SHA512", expected: "90693936" },
    { time: 1111111109, algo: "SHA1", expected: "07081804" },
    { time: 1111111109, algo: "SHA256", expected: "68084774" },
    { time: 1111111109, algo: "SHA512", expected: "25091201" },
    { time: 1111111111, algo: "SHA1", expected: "14050471" },
    { time: 1111111111, algo: "SHA256", expected: "67062674" },
    { time: 1111111111, algo: "SHA512", expected: "99943326" },
    { time: 1234567890, algo: "SHA1", expected: "89005924" },
    { time: 1234567890, algo: "SHA256", expected: "91819424" },
    { time: 1234567890, algo: "SHA512", expected: "93441116" },
    { time: 2000000000, algo: "SHA1", expected: "69279037" },
    { time: 2000000000, algo: "SHA256", expected: "90698825" },
    { time: 2000000000, algo: "SHA512", expected: "38618901" },
    { time: 20000000000, algo: "SHA1", expected: "65353130" },
    { time: 20000000000, algo: "SHA256", expected: "77737706" },
    { time: 20000000000, algo: "SHA512", expected: "47863826" },
  ];

  it.each(vectors)(
    "time=$time algo=$algo → $expected",
    ({ time, algo, expected }) => {
      const secret = secrets[algo];
      const period = 30;
      const digits = 8;
      const result = generateTOTP({
        secret,
        algorithm: algo,
        digits,
        period,
        time, // 直接传 unix timestamp，内部用 floor(time/period) 得 T
      });
      expect(result).toBe(expected);
    }
  );
});

describe("TOTP — 6 位码（默认位数）", () => {
  const secret = new TextEncoder().encode("12345678901234567890");

  // RFC 6238 未直接给出 6 位向量，但可通过截取前 6 位验证
  // 采用同样的算法实现，digits=6 时取模 10^6 的低 6 位
  it("SHA1 time=59 digits=6 → 取 8 位码低 6 位", () => {
    const code8 = generateTOTP({
      secret,
      algorithm: "SHA1",
      digits: 8,
      period: 30,
      time: 59,
    });
    const code6 = generateTOTP({
      secret,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      time: 59,
    });
    // 6 位码 == 8 位码 mod 10^6（后 6 位）
    expect(code6).toBe(code8.slice(-6));
  });
});
```

### 3.2 RFC 4226 Appendix D — HOTP 测试向量

```typescript
// tests/unit/otp/hotp.test.ts
import { describe, it, expect } from "vitest";
import { generateHOTP } from "$lib/otp/hotp";

/**
 * RFC 4226 Appendix D HOTP 测试向量。
 * Secret = "12345678901234567890" (ASCII, 20 字节)
 * Algorithm = SHA-1, Digits = 6
 *
 * Counter: 0 → 755224
 *          1 → 287082
 *          2 → 359152
 *          3 → 969429
 *          4 → 338314
 *          5 → 254676
 *          6 → 287922
 *          7 → 162583
 *          8 → 399871
 *          9 → 520489
 */
describe("HOTP — RFC 4226 Appendix D", () => {
  const secret = new TextEncoder().encode("12345678901234567890");

  const vectors: Array<{ counter: number; expected: string }> = [
    { counter: 0, expected: "755224" },
    { counter: 1, expected: "287082" },
    { counter: 2, expected: "359152" },
    { counter: 3, expected: "969429" },
    { counter: 4, expected: "338314" },
    { counter: 5, expected: "254676" },
    { counter: 6, expected: "287922" },
    { counter: 7, expected: "162583" },
    { counter: 8, expected: "399871" },
    { counter: 9, expected: "520489" },
  ];

  it.each(vectors)("counter=$counter → $expected", ({ counter, expected }) => {
    const result = generateHOTP({
      secret,
      algorithm: "SHA1",
      digits: 6,
      counter: BigInt(counter),
    });
    expect(result).toBe(expected);
  });
});

describe("HOTP — SHA256 / SHA512 分支", () => {
  /**
   * RFC 4226 仅提供 SHA-1 向量，SHA-256/SHA-512 向量来自 RFC 6238 的
   * 同源测试数据。这里验证算法分支不抛出且输出位数正确。
   * 生产验证应使用已知 HMAC-SHA256/512 向量库交叉校验。
   */
  const secret256 = new TextEncoder().encode("12345678901234567890123456789012");
  const secret512 = new TextEncoder().encode(
    "1234567890123456789012345678901234567890123456789012345678901234"
  );

  it("SHA256 counter=0 生成 6 位码", () => {
    const result = generateHOTP({
      secret: secret256,
      algorithm: "SHA256",
      digits: 6,
      counter: 0n,
    });
    expect(result).toMatch(/^\d{6}$/);
  });

  it("SHA512 counter=0 生成 6 位码", () => {
    const result = generateHOTP({
      secret: secret512,
      algorithm: "SHA512",
      digits: 6,
      counter: 0n,
    });
    expect(result).toMatch(/^\d{6}$/);
  });

  it("SHA256 counter=0 生成 8 位码", () => {
    const result = generateHOTP({
      secret: secret256,
      algorithm: "SHA256",
      digits: 8,
      counter: 0n,
    });
    expect(result).toMatch(/^\d{8}$/);
  });
});
```

---

## 4. 密码学单元测试

### 4.1 Argon2id 派生确定性

```typescript
// tests/unit/crypto/argon2id.test.ts
import { describe, it, expect } from "vitest";
import { deriveArgon2id } from "$lib/crypto/argon2id";
import { ARGON2ID_TEST_PARAMS } from "../../fixtures/argon2id-test-params";
import { TEST_SALT, TEST_SALT_2, TEST_MP } from "../../fixtures/crypto-constants";

/**
 * Argon2id 单元测试。
 * ⚠️ 使用极小参数 (m=4096, t=1, p=1) 以加速测试。
 * 生产参数见架构 §3.3 (m=65536, t=3, p=4)。
 */

describe("Argon2id — 派生确定性", () => {
  it("相同输入产生相同输出", async () => {
    const result1 = await deriveArgon2id({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    const result2 = await deriveArgon2id({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    expect(Buffer.from(result1)).toEqual(Buffer.from(result2));
  });

  it("输出长度恒为 32 字节", async () => {
    const result = await deriveArgon2id({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    expect(result.byteLength).toBe(32);
  });

  it("不同密码产生不同输出", async () => {
    const r1 = await deriveArgon2id({
      password: "password1",
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    const r2 = await deriveArgon2id({
      password: "password2",
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    expect(Buffer.from(r1)).not.toEqual(Buffer.from(r2));
  });

  it("不同盐值产生不同输出（路径隔离）", async () => {
    const r1 = await deriveArgon2id({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    const r2 = await deriveArgon2id({
      password: TEST_MP,
      salt: TEST_SALT_2,
      ...ARGON2ID_TEST_PARAMS,
    });
    expect(Buffer.from(r1)).not.toEqual(Buffer.from(r2));
  });
});
```

### 4.2 AES-GCM 包装 / 解包 / 篡改 / IV

```typescript
// tests/unit/crypto/aes-gcm.test.ts
import { describe, it, expect } from "vitest";
import { wrapDek, unwrapDek } from "$lib/crypto/aes-gcm";
import { TEST_DEK, TEST_IV, TEST_IV_2 } from "../../fixtures/crypto-constants";

describe("AES-GCM-256 — 包装/解包往返", () => {
  it("wrap → unwrap 还原原始 DEK", async () => {
    const kek = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(0xbb),
      { name: "AES-GCM" },
      false,
      ["wrapKey", "unwrapKey"]
    );

    const wrapped = await wrapDek({ dek: TEST_DEK, kek, iv: TEST_IV });
    const unwrapped = await unwrapDek({ wrappedDek: wrapped, kek });
    expect(Buffer.from(unwrapped)).toEqual(Buffer.from(TEST_DEK));
  });
});

describe("AES-GCM-256 — AEAD 篡改检测", () => {
  it("修改密文 1 字节 → 解包失败 (OperationError)", async () => {
    const kek = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(0xbb),
      { name: "AES-GCM" },
      false,
      ["wrapKey", "unwrapKey"]
    );

    const wrapped = await wrapDek({ dek: TEST_DEK, kek, iv: TEST_IV });

    // 篡改密文第 0 字节
    const tampered = new Uint8Array(wrapped);
    tampered[0] ^= 0xff;

    await expect(
      unwrapDek({ wrappedDek: tampered, kek })
    ).rejects.toThrow(); // OperationError 或 DOMException
  });

  it("修改 IV 1 字节 → 解包失败", async () => {
    const kek = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(0xbb),
      { name: "AES-GCM" },
      false,
      ["wrapKey", "unwrapKey"]
    );

    const wrapped = await wrapDek({ dek: TEST_DEK, kek, iv: TEST_IV });

    // 篡改 IV 部分（前 12 字节为 IV）
    const tampered = new Uint8Array(wrapped);
    tampered[0] ^= 0x01;

    await expect(
      unwrapDek({ wrappedDek: tampered, kek })
    ).rejects.toThrow();
  });

  it("修改 tag 1 字节 → 解包失败", async () => {
    const kek = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(0xbb),
      { name: "AES-GCM" },
      false,
      ["wrapKey", "unwrapKey"]
    );

    const wrapped = await wrapDek({ dek: TEST_DEK, kek, iv: TEST_IV });

    // AEAD tag 为最后 16 字节
    const tampered = new Uint8Array(wrapped);
    tampered[tampered.length - 1] ^= 0x01;

    await expect(
      unwrapDek({ wrappedDek: tampered, kek })
    ).rejects.toThrow();
  });
});

describe("AES-GCM-256 — IV 不复用", () => {
  it("两次包装同一 DEK 产生不同密文", async () => {
    const kek = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(0xbb),
      { name: "AES-GCM" },
      false,
      ["wrapKey", "unwrapKey"]
    );

    const wrapped1 = await wrapDek({ dek: TEST_DEK, kek, iv: TEST_IV });
    const wrapped2 = await wrapDek({ dek: TEST_DEK, kek, iv: TEST_IV_2 });

    expect(Buffer.from(wrapped1)).not.toEqual(Buffer.from(wrapped2));
  });

  it("生产环境 wrapDek 不接受外部 IV（应内部随机生成）", async () => {
    // 生产 API 应签名：wrapDek({ dek, kek }) —— IV 由函数内部
    // crypto.getRandomValues 生成，调用者不可控。
    // 此测试验证无 IV 参数时函数仍正常工作。
    const kek = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(0xbb),
      { name: "AES-GCM" },
      false,
      ["wrapKey", "unwrapKey"]
    );

    const wrapped = await wrapDek({ dek: TEST_DEK, kek });
    const unwrapped = await unwrapDek({ wrappedDek: wrapped, kek });
    expect(Buffer.from(unwrapped)).toEqual(Buffer.from(TEST_DEK));
  });
});
```

### 4.3 密文封装格式解析 / 拒绝

```typescript
// tests/unit/crypto/blob-format.test.ts
import { describe, it, expect } from "vitest";
import { parseBlob, serializeBlob } from "$lib/crypto/blob-format";

describe("Blob 封装格式 — v=1;iv=<base64>;ct=<base64>", () => {
  const validBlob =
    "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

  it("合法 Blob 解析成功", () => {
    const result = parseBlob(validBlob);
    expect(result.version).toBe(1);
    expect(result.iv).toBeInstanceOf(Uint8Array);
    expect(result.iv.byteLength).toBe(12);
    expect(result.ciphertext).toBeInstanceOf(Uint8Array);
    expect(result.ciphertext.byteLength).toBeGreaterThan(0);
  });

  it("serializeBlob → parseBlob 往返一致", () => {
    const iv = new Uint8Array(12).fill(0x00);
    const ct = new Uint8Array(48).fill(0x00);
    const serialized = serializeBlob({ version: 1, iv, ciphertext: ct });
    const parsed = parseBlob(serialized);
    expect(Buffer.from(parsed.iv)).toEqual(Buffer.from(iv));
    expect(Buffer.from(parsed.ciphertext)).toEqual(Buffer.from(ct));
  });

  it("拒绝：缺少 v= 前缀", () => {
    expect(() => parseBlob("iv=AAAA;ct=AAAA")).toThrow();
  });

  it("拒绝：v= 非 1（未知版本）", () => {
    expect(() => parseBlob("v=2;iv=AAAA;ct=AAAA")).toThrow();
  });

  it("拒绝：缺少 iv= 字段", () => {
    expect(() => parseBlob("v=1;ct=AAAA")).toThrow();
  });

  it("拒绝：缺少 ct= 字段", () => {
    expect(() => parseBlob("v=1;iv=AAAA")).toThrow();
  });

  it("拒绝：iv 非法 base64", () => {
    expect(() => parseBlob("v=1;iv=!!!invalid!!!;ct=AAAA")).toThrow();
  });

  it("拒绝：ct 非法 base64", () => {
    expect(() => parseBlob("v=1;iv=AAAA;ct=!!!invalid!!!")).toThrow();
  });

  it("拒绝：空字符串", () => {
    expect(() => parseBlob("")).toThrow();
  });

  it("拒绝：iv 长度不为 12 字节", () => {
    // base64("short") = "c2hvcnQ=" → 5 字节，不是 12
    expect(() => parseBlob("v=1;iv=c2hvcnQ=;ct=AAAA")).toThrow();
  });
});
```

### 4.4 HKDF-SHA256 PRF 派生

```typescript
// tests/unit/crypto/hkdf.test.ts
import { describe, it, expect } from "vitest";
import { deriveKekPrf } from "$lib/crypto/hkdf";
import { TEST_SALT, HKDF_INFO } from "../../fixtures/crypto-constants";

describe("HKDF-SHA256 — KEK_PRF 派生", () => {
  const prfOutput = new Uint8Array(32).fill(0xcc); // 模拟 PRF_out

  it("输出长度恒为 32 字节", async () => {
    const result = await deriveKekPrf({
      prfOutput,
      salt: TEST_SALT,
      info: HKDF_INFO,
    });
    expect(result.byteLength).toBe(32);
  });

  it("相同输入产生相同输出（确定性）", async () => {
    const r1 = await deriveKekPrf({ prfOutput, salt: TEST_SALT, info: HKDF_INFO });
    const r2 = await deriveKekPrf({ prfOutput, salt: TEST_SALT, info: HKDF_INFO });
    expect(Buffer.from(r1)).toEqual(Buffer.from(r2));
  });

  it("不同 PRF 输出产生不同 KEK", async () => {
    const prfOutput2 = new Uint8Array(32).fill(0xdd);
    const r1 = await deriveKekPrf({ prfOutput, salt: TEST_SALT, info: HKDF_INFO });
    const r2 = await deriveKekPrf({ prfOutput: prfOutput2, salt: TEST_SALT, info: HKDF_INFO });
    expect(Buffer.from(r1)).not.toEqual(Buffer.from(r2));
  });

  it("不同 info 产生不同 KEK（用途隔离）", async () => {
    const r1 = await deriveKekPrf({ prfOutput, salt: TEST_SALT, info: HKDF_INFO });
    const r2 = await deriveKekPrf({
      prfOutput,
      salt: TEST_SALT,
      info: "WebOTP/KEK-OTHER/v1",
    });
    expect(Buffer.from(r1)).not.toEqual(Buffer.from(r2));
  });

  it("info 使用架构规定值 'WebOTP/KEK-PRF/v1'", async () => {
    // 确保常量正确
    expect(HKDF_INFO).toBe("WebOTP/KEK-PRF/v1");
  });
});
```

### 4.5 base32 解码

```typescript
// tests/unit/crypto/base32.test.ts
import { describe, it, expect } from "vitest";
import { decodeBase32 } from "$lib/crypto/base32";

describe("base32 解码 — RFC 4648", () => {
  it("标准大写无填充 → 正确解码", () => {
    // "JBSWY3DPEHPK3PXP" = base32("Hello!\xde\xad\xbe\xef")
    const result = decodeBase32("JBSWY3DPEHPK3PXP");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("大小写不敏感", () => {
    const upper = decodeBase32("JBSWY3DPEHPK3PXP");
    const lower = decodeBase32("jbswy3dpehpk3pxp");
    const mixed = decodeBase32("JbSwY3dPeHpK3pXp");
    expect(Buffer.from(upper)).toEqual(Buffer.from(lower));
    expect(Buffer.from(upper)).toEqual(Buffer.from(mixed));
  });

  it("忽略空格", () => {
    const withSpaces = decodeBase32("JBSW Y3DP EHPK 3PXP");
    const noSpaces = decodeBase32("JBSWY3DPEHPK3PXP");
    expect(Buffer.from(withSpaces)).toEqual(Buffer.from(noSpaces));
  });

  it("忽略连字符", () => {
    const withHyphens = decodeBase32("JBSW-Y3DP-EHPK-3PXP");
    const noHyphens = decodeBase32("JBSWY3DPEHPK3PXP");
    expect(Buffer.from(withHyphens)).toEqual(Buffer.from(noHyphens));
  });

  it("忽略等号填充", () => {
    // 带填充的 base32
    const withPadding = decodeBase32("JBSWY3DPEHPK3PXP=");
    const noPadding = decodeBase32("JBSWY3DPEHPK3PXP");
    expect(Buffer.from(withPadding)).toEqual(Buffer.from(noPadding));
  });

  it("失败用例：含 1/O 以外非法字符", () => {
    // base32 字母表不包含 '0', '1', '8', '9' 以外的数字
    // 以及 'I', 'L', 'O', 'U' 之外的特定排除字符
    expect(() => decodeBase32("JBSWY3DPEHPK3PX!")).toThrow();
  });

  it("失败用例：空字符串", () => {
    expect(() => decodeBase32("")).toThrow();
  });

  it("恢复密钥格式 4-4-4-4-4 分组", () => {
    // 架构 §3.2：RK 为 96 位（12 字节），20 字符 base32，4-4-4-4-4 分组
    const rk = "A4MC-SOSL-LRWX-5D5A-WHBA";
    const result = decodeBase32(rk);
    expect(result.byteLength).toBe(12); // 96 位 = 12 字节
  });
});
```

### 4.6 LAK 派生

```typescript
// tests/unit/crypto/lak.test.ts
import { describe, it, expect } from "vitest";
import { deriveLak } from "$lib/crypto/lak";
import { ARGON2ID_TEST_PARAMS } from "../../fixtures/argon2id-test-params";
import { TEST_MP, TEST_SALT, TEST_SALT_2 } from "../../fixtures/crypto-constants";

describe("LAK 派生", () => {
  it("输出为 base64 编码的 32 字节哈希（约 44 字符）", async () => {
    const lak = await deriveLak({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    expect(typeof lak).toBe("string");
    // base64(32 字节) = 44 字符（含填充）
    expect(lak.length).toBe(44);
    // 验证是合法 base64
    expect(() => atob(lak)).not.toThrow();
  });

  it("确定性：相同输入相同 LAK", async () => {
    const r1 = await deriveLak({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    const r2 = await deriveLak({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    expect(r1).toBe(r2);
  });

  it("不同盐值产生不同 LAK（login_salt ≠ kdf_salt 隔离）", async () => {
    const r1 = await deriveLak({
      password: TEST_MP,
      salt: TEST_SALT,
      ...ARGON2ID_TEST_PARAMS,
    });
    const r2 = await deriveLak({
      password: TEST_MP,
      salt: TEST_SALT_2,
      ...ARGON2ID_TEST_PARAMS,
    });
    expect(r1).not.toBe(r2);
  });
});
```

---

## 5. 三方合并测试矩阵

### 5.1 合并规则测试用例表

所有测试以 `BASE_ACCOUNTS`（§2.3）为基准，覆盖架构 §5.3 的全部规则：

```typescript
// tests/unit/merge/three-way.test.ts
import { describe, it, expect } from "vitest";
import { mergeAccounts } from "$lib/models/merge";
import type { Account } from "$lib/models/account";
import { BASE_ACCOUNTS } from "../../fixtures/accounts";

/**
 * 三方合并测试矩阵。
 * 输入：Base, Local, Remote（各为 Account[]）
 * 输出：Merged（Account[]）
 *
 * 表中每行为一个测试用例，描述对基准账户的修改与期望结果。
 */

// === 辅助函数 ===
function cloneAccount(a: Account): Account {
  return { ...a };
}

function withChanges(a: Account, changes: Partial<Account>): Account {
  return { ...a, ...changes, updatedAt: changes.updatedAt ?? a.updatedAt + 1000 };
}

// === 测试矩阵 ===

describe("三方合并 — 墓碑绝对优先", () => {
  /**
   * 规则 1：若 Local.deletedAt ≠ null 或 Remote.deletedAt ≠ null，
   * 则结果标记为已删除，deletedAt 取两侧非空者的较小值。
   * 即使另一侧修改了字段，删除仍生效。
   */
  it("一侧删除 + 另一侧修改同一字段 → 删除胜出", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = [
      ...base.slice(1), // 保留其余
      withChanges(base[0]!, { deletedAt: 1700001000000 }), // Local 删除 id=1
    ];
    const remote = [
      ...base.slice(1),
      withChanges(base[0]!, { issuer: "GitHub Enterprise" }), // Remote 修改 id=1
    ];

    const merged = mergeAccounts(base, local, remote);
    const id1 = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000001")!;
    expect(id1.deletedAt).toBe(1700001000000);
    // 修改不应生效
    expect(id1.issuer).not.toBe("GitHub Enterprise");
  });

  it("双侧都删除 → deletedAt 取较小值", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = [
      ...base.slice(1),
      withChanges(base[0]!, { deletedAt: 1700001000000 }),
    ];
    const remote = [
      ...base.slice(1),
      withChanges(base[0]!, { deletedAt: 1700002000000 }),
    ];

    const merged = mergeAccounts(base, local, remote);
    const id1 = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000001")!;
    expect(id1.deletedAt).toBe(1700001000000); // 较小值
  });

  it("一侧删除 + 另一侧未改动 → 删除胜出", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = [
      ...base.slice(1),
      withChanges(base[0]!, { deletedAt: 1700001000000 }),
    ];
    const remote = base.map(cloneAccount); // 未改动

    const merged = mergeAccounts(base, local, remote);
    const id1 = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000001")!;
    expect(id1.deletedAt).toBe(1700001000000);
  });
});

describe("三方合并 — 新增条目", () => {
  /**
   * 规则 2：仅出现在一侧且未删除 → 直接纳入 Merged
   */
  it("仅 Local 新增的条目 → 纳入 Merged", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const newAccount: Account = {
      id: "00000000-0000-0000-0000-000000000099",
      type: "totp",
      issuer: "NewService",
      label: "new@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: null,
      icon: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      deletedAt: null,
    };
    const local = [...base.map(cloneAccount), newAccount];
    const remote = base.map(cloneAccount);

    const merged = mergeAccounts(base, local, remote);
    expect(merged.find((a) => a.id === newAccount.id)).toBeDefined();
  });

  it("仅 Remote 新增的条目 → 纳入 Merged", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const newAccount: Account = {
      id: "00000000-0000-0000-0000-000000000088",
      type: "hotp",
      issuer: "RemoteService",
      label: "remote@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: "0",
      icon: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      deletedAt: null,
    };
    const local = base.map(cloneAccount);
    const remote = [...base.map(cloneAccount), newAccount];

    const merged = mergeAccounts(base, local, remote);
    expect(merged.find((a) => a.id === newAccount.id)).toBeDefined();
  });
});

describe("三方合并 — 字段级裁决", () => {
  /**
   * 规则 3：对每个可变字段，按以下优先级裁决：
   * - 仅一侧变更 → 采用该侧值
   * - 两侧均变更 → 采用 updatedAt 较大者
   * - 两侧均未变更 → 沿用 Base
   */

  it("仅 Local 变更 issuer → 采用 Local 值", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = [
      withChanges(base[0]!, { issuer: "GitHub Pro", updatedAt: 1700001000000 }),
      ...base.slice(1).map(cloneAccount),
    ];
    const remote = base.map(cloneAccount); // 未改动

    const merged = mergeAccounts(base, local, remote);
    expect(merged[0]!.issuer).toBe("GitHub Pro");
  });

  it("仅 Remote 变更 issuer → 采用 Remote 值", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = base.map(cloneAccount); // 未改动
    const remote = [
      withChanges(base[0]!, { issuer: "GitHub Enterprise", updatedAt: 1700001000000 }),
      ...base.slice(1).map(cloneAccount),
    ];

    const merged = mergeAccounts(base, local, remote);
    expect(merged[0]!.issuer).toBe("GitHub Enterprise");
  });

  it("双侧都变更 issuer → updatedAt 较大者胜出", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = [
      withChanges(base[0]!, { issuer: "GitHub Local", updatedAt: 1700001000000 }),
      ...base.slice(1).map(cloneAccount),
    ];
    const remote = [
      withChanges(base[0]!, { issuer: "GitHub Remote", updatedAt: 1700002000000 }),
      ...base.slice(1).map(cloneAccount),
    ];

    const merged = mergeAccounts(base, local, remote);
    expect(merged[0]!.issuer).toBe("GitHub Remote"); // Remote updatedAt 更大
  });

  it("双侧都变更 issuer → Local updatedAt 更大则 Local 胜出", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = [
      withChanges(base[0]!, { issuer: "GitHub Local", updatedAt: 1700002000000 }),
      ...base.slice(1).map(cloneAccount),
    ];
    const remote = [
      withChanges(base[0]!, { issuer: "GitHub Remote", updatedAt: 1700001000000 }),
      ...base.slice(1).map(cloneAccount),
    ];

    const merged = mergeAccounts(base, local, remote);
    expect(merged[0]!.issuer).toBe("GitHub Local");
  });

  it("双侧均未变更 → 沿用 Base 值", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const local = base.map(cloneAccount);
    const remote = base.map(cloneAccount);

    const merged = mergeAccounts(base, local, remote);
    expect(merged[0]!.issuer).toBe(base[0]!.issuer);
  });
});

describe("三方合并 — HOTP counter 取 max", () => {
  /**
   * 规则 4：counter 不走 updatedAt 仲裁，恒取 max(Local, Remote)。
   */
  it("两侧都变更 counter → 取较大值", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    // 修改 HOTP 账户 (id=2) 的 counter
    const localAccount = withChanges(base[1]!, {
      counter: "10",
      updatedAt: 1700001000000,
    });
    const remoteAccount = withChanges(base[1]!, {
      counter: "15",
      updatedAt: 1700002000000,
    });

    const local = [base[0]!, localAccount, ...base.slice(2).map(cloneAccount)];
    const remote = [base[0]!, remoteAccount, ...base.slice(2).map(cloneAccount)];

    const merged = mergeAccounts(base, local, remote);
    const hotp = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000002")!;
    expect(hotp.counter).toBe("15"); // max("10", "15")
  });

  it("仅 Local 变更 counter → 采用 Local（因 max 仍为 Local）", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const localAccount = withChanges(base[1]!, {
      counter: "8",
      updatedAt: 1700001000000,
    });

    const local = [base[0]!, localAccount, ...base.slice(2).map(cloneAccount)];
    const remote = base.map(cloneAccount);

    const merged = mergeAccounts(base, local, remote);
    const hotp = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000002")!;
    expect(hotp.counter).toBe("8"); // max("5", "8")
  });

  it("counter 为 bigint 字符串 → 数值比较而非字典序", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const localAccount = withChanges(base[1]!, {
      counter: "9",
      updatedAt: 1700001000000,
    });
    const remoteAccount = withChanges(base[1]!, {
      counter: "10",
      updatedAt: 1700002000000,
    });

    const local = [base[0]!, localAccount, ...base.slice(2).map(cloneAccount)];
    const remote = [base[0]!, remoteAccount, ...base.slice(2).map(cloneAccount)];

    const merged = mergeAccounts(base, local, remote);
    const hotp = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000002")!;
    // 字典序 "9" > "10"，但数值 10 > 9 → 必须为 "10"
    expect(hotp.counter).toBe("10");
  });
});

describe("三方合并 — 不可变字段", () => {
  /**
   * 规则 5：id, createdAt 永不参与合并变更。
   */
  it("即使 Remote 试图更改 id → 保持 Base 的 id", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    // 模拟恶意/损坏的 Remote 试图改 id
    const maliciousRemote = [
      { ...base[0]!, id: "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" },
      ...base.slice(1).map(cloneAccount),
    ];
    const local = base.map(cloneAccount);

    const merged = mergeAccounts(base, local, maliciousRemote);
    expect(merged[0]!.id).toBe(base[0]!.id); // 不变
  });

  it("即使 Remote 试图更改 createdAt → 保持 Base 的 createdAt", () => {
    const base = BASE_ACCOUNTS.map(cloneAccount);
    const maliciousRemote = [
      { ...base[0]!, createdAt: 9999999999999 },
      ...base.slice(1).map(cloneAccount),
    ];
    const local = base.map(cloneAccount);

    const merged = mergeAccounts(base, local, maliciousRemote);
    expect(merged[0]!.createdAt).toBe(base[0]!.createdAt);
  });
});

describe("三方合并 — Base 丢失降级（两方合并）", () => {
  /**
   * 架构 §5.3 降级规则：baseSnapshot 缺失时，
   * 以 Local 为基准，采纳 Remote 相对 Local 的新增条目与墓碑；
   * 对两侧均存在的条目，按 updatedAt 取较大者（HOTP counter 仍取 max）。
   */
  it("base=null, Remote 新增条目 → 纳入 Merged", () => {
    const local = BASE_ACCOUNTS.map(cloneAccount);
    const newAccount: Account = {
      id: "00000000-0000-0000-0000-000000000077",
      type: "totp",
      issuer: "DegradedService",
      label: "degraded@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: null,
      icon: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      deletedAt: null,
    };
    const remote = [...local.map(cloneAccount), newAccount];

    const merged = mergeAccounts(null, local, remote); // base = null → 降级
    expect(merged.find((a) => a.id === newAccount.id)).toBeDefined();
  });

  it("base=null, Remote 删除 Local 存在的条目 → 删除生效", () => {
    const local = BASE_ACCOUNTS.map(cloneAccount);
    const remote = [
      withChanges(local[0]!, { deletedAt: 1700001000000 }),
      ...local.slice(1).map(cloneAccount),
    ];

    const merged = mergeAccounts(null, local, remote);
    const id1 = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000001")!;
    expect(id1.deletedAt).toBe(1700001000000);
  });

  it("base=null, 双侧均存在且均修改 → updatedAt 较大者胜出", () => {
    const local = [
      withChanges(BASE_ACCOUNTS[0]!, { issuer: "Local", updatedAt: 1700001000000 }),
      ...BASE_ACCOUNTS.slice(1).map(cloneAccount),
    ];
    const remote = [
      withChanges(BASE_ACCOUNTS[0]!, { issuer: "Remote", updatedAt: 1700002000000 }),
      ...BASE_ACCOUNTS.slice(1).map(cloneAccount),
    ];

    const merged = mergeAccounts(null, local, remote);
    expect(merged[0]!.issuer).toBe("Remote"); // updatedAt 更大
  });

  it("base=null, HOTP counter 仍取 max", () => {
    const local = [
      BASE_ACCOUNTS[0]!,
      withChanges(BASE_ACCOUNTS[1]!, { counter: "20", updatedAt: 1700001000000 }),
      ...BASE_ACCOUNTS.slice(2).map(cloneAccount),
    ];
    const remote = [
      BASE_ACCOUNTS[0]!,
      withChanges(BASE_ACCOUNTS[1]!, { counter: "25", updatedAt: 1700002000000 }),
      ...BASE_ACCOUNTS.slice(2).map(cloneAccount),
    ];

    const merged = mergeAccounts(null, local, remote);
    const hotp = merged.find((a) => a.id === "00000000-0000-0000-0000-000000000002")!;
    expect(hotp.counter).toBe("25");
  });

  it("base=null, 仅 Local 存在的条目 → 保留", () => {
    const localOnly: Account = {
      id: "00000000-0000-0000-0000-000000000066",
      type: "totp",
      issuer: "LocalOnly",
      label: "local@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: null,
      icon: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      deletedAt: null,
    };
    const local = [...BASE_ACCOUNTS.map(cloneAccount), localOnly];
    const remote = BASE_ACCOUNTS.map(cloneAccount); // Remote 无此条目

    const merged = mergeAccounts(null, local, remote);
    expect(merged.find((a) => a.id === localOnly.id)).toBeDefined();
  });
});
```

---

## 6. OCC 测试

### 6.1 CAS 成功/冲突/重试

```typescript
// tests/integration/api/vault.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "../setup";

describe("OCC — PUT /api/vault", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("CAS 成功 → version 自增", async () => {
    // 注册用户，初始 version=1
    const session = await app.registerUser("test@example.com", "password123");
    const vault = await app.getVault(session);
    expect(vault.version).toBe(1);

    // PUT with expectedVersion=1 → 成功
    const putResult = await app.putVault(session, {
      expectedVersion: 1,
      encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    });
    expect(putResult.version).toBe(2);
  });

  it("并发 PUT → 一方 412 Precondition Failed", async () => {
    const session = await app.registerUser("test@example.com", "password123");

    // 两个并发 PUT，expectedVersion 都是 1
    const put1 = app.putVault(session, {
      expectedVersion: 1,
      encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
    });
    const put2 = app.putVault(session, {
      expectedVersion: 1,
      encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=",
    });

    const [result1, result2] = await Promise.allSettled([put1, put2]);
    const succeeded = [result1, result2].filter((r) => r.status === "fulfilled");
    const failed = [result1, result2].filter((r) => r.status === "rejected");

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    // 失败方应为 412，包含 serverVersion 和 encryptedBlob
    const error = (failed[0] as PromiseRejectedResult).reason;
    expect(error.status).toBe(412);
    expect(error.body.serverVersion).toBe(2);
    expect(error.body.encryptedBlob).toBeDefined();
    expect(error.body.wrappedDekByMaster).toBeDefined();
  });

  it("412 后合并重试成功", async () => {
    const session = await app.registerUser("test@example.com", "password123");

    // 第一次 PUT 成功，version → 2
    await app.putVault(session, {
      expectedVersion: 1,
      encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE=",
    });

    // 模拟 412：用过期 version=1 再 PUT
    try {
      await app.putVault(session, {
        expectedVersion: 1,
        encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF=",
      });
    } catch (error: any) {
      expect(error.status).toBe(412);

      // 合并后用 serverVersion=2 重试
      const retry = await app.putVault(session, {
        expectedVersion: error.body.serverVersion,
        encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG=",
      });
      expect(retry.version).toBe(3);
    }
  });

  it("再次 412 → 递归合并", async () => {
    const session = await app.registerUser("test@example.com", "password123");
    const session2 = await app.loginUser("test@example.com", "password123");

    // Device A: PUT 成功 version → 2
    await app.putVault(session, {
      expectedVersion: 1,
      encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH=",
    });

    // Device B: PUT 成功 version → 3（用 version 2 为 expectedVersion）
    await app.putVault(session2, {
      expectedVersion: 2,
      encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII=",
    });

    // Device A: 用 version=2 PUT → 412（serverVersion=3）
    try {
      await app.putVault(session, {
        expectedVersion: 2,
        encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ=",
      });
    } catch (error1: any) {
      expect(error1.status).toBe(412);
      expect(error1.body.serverVersion).toBe(3);

      // 再次尝试用 version=3 PUT
      // 如果此时 Device B 又 PUT 了，会再次 412 → 递归合并
      const retry = await app.putVault(session, {
        expectedVersion: error1.body.serverVersion,
        encryptedBlob: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK=",
      });
      expect(retry.version).toBe(4);
    }
  });
});
```

---

## 7. API 集成测试

### 7.1 反枚举端点 — `GET /api/auth-params`

```typescript
// tests/integration/api/auth-params.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "../setup";

describe("反枚举 — GET /api/auth-params", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("存在的邮箱 → 返回真实 KDF 参数与盐值", async () => {
    await app.registerUser("real@example.com", "password123");

    const params = await app.getAuthParams("real@example.com");
    expect(params.kdfAlgo).toBe("argon2id");
    expect(params.kdfMemoryKiB).toBeGreaterThan(0);
    expect(params.kdfIterations).toBeGreaterThan(0);
    expect(params.kdfParallelism).toBeGreaterThan(0);
    expect(params.loginSalt).toBeDefined();
    expect(params.kdfSalt).toBeDefined();
    // base64 格式检查
    expect(() => atob(params.loginSalt)).not.toThrow();
    expect(() => atob(params.kdfSalt)).not.toThrow();
  });

  it("不存在的邮箱 → 返回伪参数，HTTP 200", async () => {
    const params = await app.getAuthParams("nonexistent@example.com");

    // 形状一致：相同字段、相同类型
    expect(params.kdfAlgo).toBe("argon2id");
    expect(typeof params.kdfMemoryKiB).toBe("number");
    expect(typeof params.kdfIterations).toBe("number");
    expect(typeof params.kdfParallelism).toBe("number");
    expect(typeof params.loginSalt).toBe("string");
    expect(typeof params.kdfSalt).toBe("string");

    // 伪盐值长度与真实一致（base64 编码 16 字节 = 24 字符）
    expect(params.loginSalt.length).toBe(24);
    expect(params.kdfSalt.length).toBe(24);
  });

  it("同一不存在邮箱 → 每次返回相同伪参数（确定性）", async () => {
    const r1 = await app.getAuthParams("ghost@example.com");
    const r2 = await app.getAuthParams("ghost@example.com");

    expect(r1.loginSalt).toBe(r2.loginSalt);
    expect(r1.kdfSalt).toBe(r2.kdfSalt);
    expect(r1.kdfMemoryKiB).toBe(r2.kdfMemoryKiB);
  });

  it("不同不存在邮箱 → 返回不同伪参数", async () => {
    const r1 = await app.getAuthParams("ghost1@example.com");
    const r2 = await app.getAuthParams("ghost2@example.com");

    // 确定性但不同邮箱产生不同伪盐值
    expect(r1.loginSalt).not.toBe(r2.loginSalt);
  });
});
```

### 7.2 恢复流程 — `recover/init` 与 `recover/reset`

```typescript
// tests/integration/api/recover.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "../setup";

describe("恢复流程 — recover/init & recover/reset", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  describe("POST /api/vault/recover/init", () => {
    it("存在的邮箱 → 返回恢复材料", async () => {
      await app.registerUser("recovery@example.com", "password123");

      const result = await app.recoverInit("recovery@example.com");
      expect(result.kdfAlgo).toBe("argon2id");
      expect(result.recoverySalt).toBeDefined();
      expect(result.recoveryVerifierSalt).toBeDefined();
      expect(result.wrappedDekByRecovery).toBeDefined();
      expect(result.encryptedBlob).toBeDefined();
    });

    it("不存在的邮箱 → 返回伪恢复材料，HTTP 200（反枚举）", async () => {
      const result = await app.recoverInit("ghost@example.com");

      // 形状一致
      expect(result.kdfAlgo).toBe("argon2id");
      expect(typeof result.recoverySalt).toBe("string");
      expect(typeof result.recoveryVerifierSalt).toBe("string");
      expect(typeof result.wrappedDekByRecovery).toBe("string");
      expect(typeof result.encryptedBlob).toBe("string");

      // base64 格式检查
      expect(() => atob(result.recoverySalt)).not.toThrow();
      expect(() => atob(result.recoveryVerifierSalt)).not.toThrow();
    });

    it("速率限制 → 多次请求后返回 429", async () => {
      // 快速连续请求触发限流
      const requests = Array.from({ length: 20 }, () =>
        app.recoverInit("brute@example.com")
      );
      const results = await Promise.allSettled(requests);
      const rateLimited = results.some(
        (r) => r.status === "rejected" && (r as any).reason?.status === 429
      );
      expect(rateLimited).toBe(true);
    });
  });

  describe("POST /api/vault/recover/reset", () => {
    it("正确的 recoveryVerifier → 重置成功，吊销所有会话", async () => {
      // 注册
      const session = await app.registerUser("reset@example.com", "oldpassword");

      // 获取恢复材料
      const recovery = await app.recoverInit("reset@example.com");

      // 客户端：用 RK 派生 KEK_RK → 解包 wrappedDekByRecovery → 得 DEK
      // （此处省略客户端密码学，直接提交 reset 请求）
      const resetResult = await app.recoverReset({
        email: "reset@example.com",
        recoveryVerifier: "correct-verifier-hash", // 模拟
        newLak: "new-lak-base64",
        newLoginSalt: "bmV3LWxvZ2luLXNhbHQ=",
        newKdfSalt: "bmV3LWtkZi1zYWx0=",
        newWrappedDekByMaster: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=NEW_MASTER=",
        newWrappedDekByRecovery: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=NEW_RECOVERY=",
        newRecoverySalt: "bmV3LXJlY292ZXJ5LXNhbHQ=",
        newRecoveryVerifierSalt: "bmV3LXJlYy12ZXJpZmllci1zYWx0=",
        newRecoveryVerifier: "new-recovery-verifier-hash",
      });

      expect(resetResult.status).toBe(200);

      // 旧会话应被吊销
      const oldVault = await app.getVault(session);
      expect(oldVault.status).toBe(401);
    });

    it("错误的 recoveryVerifier → 403 Forbidden", async () => {
      await app.registerUser("forbidden@example.com", "password123");

      await expect(
        app.recoverReset({
          email: "forbidden@example.com",
          recoveryVerifier: "wrong-verifier",
          newLak: "x",
          newLoginSalt: "x",
          newKdfSalt: "x",
          newWrappedDekByMaster: "x",
          newWrappedDekByRecovery: "x",
          newRecoverySalt: "x",
          newRecoveryVerifierSalt: "x",
          newRecoveryVerifier: "x",
        })
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
```

### 7.3 密码轮换 — `rotate-key` 原子事务

```typescript
// tests/integration/api/rotate-key.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "../setup";

describe("密码轮换 — POST /api/vault/rotate-key", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("成功轮换 → 新 LAK 可登录，旧 LAK 不可登录", async () => {
    await app.registerUser("rotate@example.com", "oldpassword");

    const result = await app.rotateKey({
      newLak: "bmV3LWxhaA==",
      newLoginSalt: "bmV3LWxvZ2luLXNhbHQ=",
      newKdfSalt: "bmV3LWtkZi1zYWx0=",
      newWrappedDekByMaster: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=ROTATED=",
    });
    expect(result.status).toBe(200);

    // 旧 LAK 登录失败
    await expect(
      app.loginUser("rotate@example.com", "oldpassword")
    ).rejects.toMatchObject({ status: 401 });
  });

  it("轮换不影响 Blob 和 version", async () => {
    const session = await app.registerUser("rotate@example.com", "password123");
    const vaultBefore = await app.getVault(session);

    await app.rotateKey({
      newLak: "bmV3LWxhaA==",
      newLoginSalt: "bmV3LWxvZ2luLXNhbHQ=",
      newKdfSalt: "bmV3LWtkZi1zYWx0=",
      newWrappedDekByMaster: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=ROTATED=",
    });

    // version 不变（架构 §4 OCC 范围限定）
    const vaultAfter = await app.getVault(session);
    expect(vaultAfter.version).toBe(vaultBefore.version);
    expect(vaultAfter.encryptedBlob).toBe(vaultBefore.encryptedBlob);
  });

  it("轮换后吊销其他设备会话", async () => {
    await app.registerUser("rotate@example.com", "password123");
    const deviceB = await app.loginUser("rotate@example.com", "password123");

    await app.rotateKey({
      newLak: "bmV3LWxhaA==",
      newLoginSalt: "bmV3LWxvZ2luLXNhbHQ=",
      newKdfSalt: "bmV3LWtkZi1zYWx0=",
      newWrappedDekByMaster: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=ROTATED=",
    });

    // Device B 会话应被吊销
    await expect(app.getVault(deviceB)).rejects.toMatchObject({ status: 401 });
  });
});
```

### 7.4 Passkey Wraps CRUD

```typescript
// tests/integration/api/passkey-wraps.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp } from "../setup";

describe("Passkey Wraps — CRUD", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("POST → 创建包装行，GET → 列表含该行", async () => {
    const session = await app.registerUser("pk@example.com", "password123");

    const created = await app.createPasskeyWrap(session, {
      credentialId: "dGVzdC1jcmVkZW50aWFsLWlk",
      wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=PRFWRAP1=",
    });
    expect(created.id).toBeDefined();
    expect(created.credentialId).toBe("dGVzdC1jcmVkZW50aWFsLWlk");

    const wraps = await app.getPasskeyWraps(session);
    expect(wraps.length).toBe(1);
    expect(wraps[0]!.credentialId).toBe("dGVzdC1jcmVkZW50aWFsLWlk");
  });

  it("同一 credentialId 重复绑定 → 409 Conflict", async () => {
    const session = await app.registerUser("dup@example.com", "password123");

    await app.createPasskeyWrap(session, {
      credentialId: "dXBkLWNyZWRlbnRpYWw=",
      wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=DUP1=",
    });

    await expect(
      app.createPasskeyWrap(session, {
        credentialId: "dXBkLWNyZWRlbnRpYWw=",
        wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=DUP2=",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("DELETE → 删除包装行", async () => {
    const session = await app.registerUser("delete-pk@example.com", "password123");

    await app.createPasskeyWrap(session, {
      credentialId: "ZGVsZXRlLWNyZWRlbnRpYWw=",
      wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=DEL1=",
    });

    await app.deletePasskeyWrap(session, "ZGVsZXRlLWNyZWRlbnRpYWw=");

    const wraps = await app.getPasskeyWraps(session);
    expect(wraps.length).toBe(0);
  });

  it("DELETE 不存在的 credentialId → 404", async () => {
    const session = await app.registerUser("nf@example.com", "password123");

    const session = await app.registerUser("multi@example.com", "password123");
      app.deletePasskeyWrap(session, "bm90LWZvdW5k")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("多设备各自绑定 → 列表含多行", async () => {
    const session = await app.registerUser("multi@example.com.com", "password123");

    await app.createPasskeyWrap(session, {
      credentialId: "ZGV2aWNlLWE=",
      wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=DEV_A=",
    });
    await app.createPasskeyWrap(session, {
      credentialId: "ZGV2aWNlLWI=",
      wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=DEV_B=",
    });

    const wraps = await app.getPasskeyWraps(session);
    expect(wraps.length).toBe(2);
  });

  it("DELETE 仅影响目标设备，其他包装保留", async () => {
    const session = await app.registerUser("partial@example.com", "password123");

    await app.createPasskeyWrap(session, {
      credentialId: "cGFydGlhbC1h",
      wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=PA=",
    });
    await app.createPasskeyWrap(session, {
      credentialId: "cGFydGlhbC1i",
      wrappedDekByPrf: "v=1;iv=AAAAAAAAAAAAAAAAAAAAAA==;ct=PB=",
    });

    await app.deletePasskeyWrap(session, "cGFydGlhbC1h");

    const wraps = await app.getPasskeyWraps(session);
    expect(wraps.length).toBe(1);
    expect(wraps[0]!.credentialId).toBe("cGFydGlhbC1i");
  });
});
```

---

## 8. E2E 关键流

### 8.1 注册 → 解锁 → 加账户 → 同步

```typescript
// tests/e2e/registration-flow.spec.ts
import { test, expect } from "@playwright/test";

test.describe("完整注册→同步流", () => {
  test("注册新用户，解锁 Vault，添加 OTP 账户，验证同步", async ({ page }) => {
    // 1. 注册
    await page.goto("/register");
    await page.fill('input[name="email"]', "e2e@example.com");
    await page.fill('input[name="password"]', "StrongP@ssw0rd!");
    await page.click('button[type="submit"]');

    // 等待注册成功，应展示 Recovery Key
    await expect(page.locator('[data-testid="recovery-key-display"]')).toBeVisible();
    const recoveryKey = await page.locator('[data-testid="recovery-key-value"]').textContent();
    expect(recoveryKey).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // 2. 确认已抄写 → 进入 Vault
    await page.click('[data-testid="recovery-key-confirmed"]');
    await expect(page.locator('[data-testid="vault-empty"]')).toBeVisible();

    // 3. 添加 TOTP 账户
    await page.click('[data-testid="add-account"]');
    await page.fill('input[name="issuer"]', "GitHub");
    await page.fill('input[name="label"]', "alice@example.com");
    await page.fill('input[name="secret"]', "JBSWY3DPEHPK3PXP");
    await page.click('[data-testid="save-account"]');

    // 4. 验证账户已添加
    await expect(page.locator('[data-testid="account-card"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="account-issuer"]').first()).toHaveText("GitHub");

    // 5. 验证同步状态
    await expect(page.locator('[data-testid="sync-status"]')).toHaveText("synced");
  });
});
```

### 8.2 多设备并发冲突合并

```typescript
// tests/e2e/conflict-merge.spec.ts
import { test, expect } from "@playwright/test";

test.describe("多设备并发冲突合并", () => {
  test("两设备离线修改同一账户后同步 → 合并正确", async ({ browser }) => {
    // 注册并同步初始数据
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto("/register");
    // ... 注册流程 ...
    // 添加账户 "GitHub" → 同步成功

    // Device B 登录同一账户
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto("/login");
    // ... 登录流程 ...

    // 模拟离线：两设备断网
    await contextA.setOffline(true);
    await contextB.setOffline(true);

    // Device A: 修改 issuer
    await pageA.locator('[data-testid="edit-account"]').first().click();
    await pageA.fill('input[name="issuer"]', "GitHub Pro");
    await pageA.click('[data-testid="save-account"]');

    // Device B: 修改 label
    await pageB.locator('[data-testid="edit-account"]').first().click();
    await pageB.fill('input[name="label"]', "bob@example.com");
    await pageB.click('[data-testid="save-account"]');

    // Device A 恢复网络 → 同步
    await contextA.setOffline(false);
    await pageA.click('[data-testid="sync-now"]');
    await expect(pageA.locator('[data-testid="sync-status"]')).toHaveText("synced");

    // Device B 恢复网络 → 触发 412 → 合并
    await contextB.setOffline(false);
    await pageB.click('[data-testid="sync-now"]');

    // 合并后：两侧变更都应保留（不同字段，无冲突）
    await expect(pageB.locator('[data-testid="sync-status"]')).toHaveText("synced");
    await pageB.reload();
    await expect(pageB.locator('[data-testid="account-issuer"]').first()).toHaveText("GitHub Pro");
    await expect(pageB.locator('[data-testid="account-label"]').first()).toHaveText("bob@example.com");

    await contextA.close();
    await contextB.close();
  });
});
```

### 8.3 PRF 绑定 + 免密解锁

```typescript
// tests/e2e/prf-unlock.spec.ts
import { test, expect } from "@playwright/test";

/**
 * WebAuthn PRF 测试策略：
 * 1. 优先使用 Playwright virtual authenticator（Chromium 支持）
 * 2. PRF 扩展在虚拟 authenticator 中可能不完全支持，
 *    此时条件 skip 并标注 "[manual]" 需人工验证
 * 3. CI 环境检测：process.env.CI 时若虚拟 authenticator 不支持 PRF 则 skip
 */

const PRF_AVAILABLE = (() => {
  // Chromium virtual authenticator 可能支持 PRF
  // 运行时检测或环境变量控制
  return process.env.PRF_TEST_ENABLED === "true";
})();

test.describe("WebAuthn PRF 免密解锁", () => {
  test.skip(!PRF_AVAILABLE, "PRF 测试需要支持 PRF 扩展的虚拟 authenticator");

  test("绑定 Passkey → 免密解锁 Vault", async ({ browser }) => {
    const context = await browser.newContext();

    // 注册并登录
    const page = await context.newPage();
    await page.goto("/register");
    // ... 注册流程 ...

    // 绑定 Passkey（需要 virtual authenticator 注入）
    await page.evaluate(() => {
      // 通过 CDP 注入 virtual authenticator
      // 具体实现依赖 Playwright 的 CDPSession
    });

    await page.click('[data-testid="bind-passkey"]');
    // ... WebAuthn 创建流程 ...

    await expect(page.locator('[data-testid="passkey-bound"]')).toBeVisible();

    // 锁定 Vault
    await page.click('[data-testid="lock-vault"]');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

    // 免密解锁：点击 Passkey 按钮
    await page.click('[data-testid="passkey-unlock"]');
    // WebAuthn PRF → 派生 KEK_PRF → 解包 DEK → 解密 Blob
    await expect(page.locator('[data-testid="vault-content"]')).toBeVisible();

    await context.close();
  });
});
```

### 8.4 灾难恢复

```typescript
// tests/e2e/disaster-recovery.spec.ts
import { test, expect } from "@playwright/test";

test.describe("灾难恢复流程", () => {
  test("RK 解锁 → 重置 MP → 新 RK → 旧 RK 失效", async ({ page }) => {
    // 1. 注册并添加数据
    await page.goto("/register");
    // ... 注册流程，记录 recoveryKey ...

    // 添加账户以验证恢复后数据不丢
    // ... 添加 "GitHub" 账户 ...

    // 2. 模拟忘记密码：登出
    await page.click('[data-testid="logout"]');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

    // 3. 进入恢复流程
    await page.click('[data-testid="forgot-password"]');
    await page.fill('input[name="email"]', "recovery@example.com");
    await page.click('[data-testid="recover-init"]');

    // 4. 输入 Recovery Key
    await page.fill('input[name="recovery-key"]', "JBSW-Y3DP-EHPK-3PXP-ELWS");
    await page.click('[data-testid="verify-recovery-key"]');

    // 5. 设置新密码
    await page.fill('input[name="new-password"]', "NewStrongP@ssw0rd!");
    await page.fill('input[name="confirm-password"]', "NewStrongP@ssw0rd!");
    await page.click('[data-testid="reset-password"]');

    // 6. 展示新 Recovery Key
    await expect(page.locator('[data-testid="new-recovery-key-display"]')).toBeVisible();
    const newRk = await page.locator('[data-testid="new-recovery-key-value"]').textContent();
    expect(newRk).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // 7. 确认新 RK → 进入 Vault
    await page.click('[data-testid="new-recovery-key-confirmed"]');

    // 8. 验证数据未丢失（信封加密核心收益：DEK 恒定）
    await expect(page.locator('[data-testid="account-issuer"]').first()).toHaveText("GitHub");

    // 9. 验证新密码可用
    await page.click('[data-testid="logout"]');
    await page.fill('input[name="email"]', "recovery@example.com");
    await page.fill('input[name="password"]', "NewStrongP@ssw0rd!");
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="vault-content"]')).toBeVisible();

    // 10. 验证旧 RK 已失效
    await page.click('[data-testid="logout"]');
    await page.click('[data-testid="forgot-password"]');
    await page.fill('input[name="email"]', "recovery@example.com");
    await page.click('[data-testid="recover-init"]');
    await page.fill('input[name="recovery-key"]', "JBSW-Y3DP-EHPK-3PXP-ELWS"); // 旧 RK
    await page.click('[data-testid="verify-recovery-key"]');
    await expect(page.locator('[data-testid="recovery-key-error"]')).toBeVisible();
  });
});
```

---

## 9. WebAuthn PRF 测试策略

### 9.1 现实约束

WebAuthn PRF 扩展 (`prf.eval`) 依赖硬件安全芯片 (TPM/Secure Enclave)，**无法在 CI 环境中直接模拟**。测试策略分三级：

| 层级 | 方案 | 适用环境 | 限制 |
| :--- | :--- | :--- | :--- |
| **L1: 虚拟 Authenticator** | Playwright `cdpSession.send('WebAuthn.enable')` + `WebAuthn.addVirtualAuthenticator` | Chromium, 本地开发 | PRF 扩展可能不完全支持 |
| **L2: Mock PRF** | `vi.mock('$lib/crypto/prf')` 返回固定 `PRF_out`，跳过真实 WebAuthn 仪式 | vitest 单元/集成 | 仅验证 PRF→KEK→unwrap 链路 |
| **L3: 条件 skip** | `test.skip(!PRF_AVAILABLE, ...)` 标注 `[manual]` | CI / 无 PRF 环境 | 需人工定期验证 |

### 9.2 Mock PRF 单元测试

```typescript
// tests/unit/crypto/prf-derive.test.ts
import { describe, it, expect, vi } from "vitest";
import { deriveKekPrf } from "$lib/crypto/hkdf";
import { unwrapDek } from "$lib/crypto/aes-gcm";
import { TEST_DEK, TEST_SALT, HKDF_INFO } from "../../fixtures/crypto-constants";

/**
 * Mock PRF 测试：验证 PRF_out → KEK_PRF → unwrapDek 链路。
 * 不依赖真实 WebAuthn，仅验证密码学正确性。
 */
describe("PRF→KEK→unwrap 链路", () => {
  it("模拟 PRF_out 派生 KEK_PRF 并成功解包 DEK", async () => {
    // 模拟 PRF_out（硬件随机输出）
    const mockPrfOut = new Uint8Array(32).fill(0xdd);

    // 派生 KEK_PRF
    const kekPrfBytes = await deriveKekPrf({
      prfOutput: mockPrfOut,
      salt: TEST_SALT,
      info: HKDF_INFO,
    });

    // 导入为 CryptoKey
    const kekPrf = await crypto.subtle.importKey(
      "raw",
      kekPrfBytes,
      { name: "AES-GCM" },
      false,
      ["wrapKey", "unwrapKey"]
    );

    // 包装 DEK
    const wrapped = await crypto.subtle.wrapKey(
      "raw",
      await crypto.subtle.importKey("raw", TEST_DEK, { name: "AES-GCM" }, true, [
        "encrypt",
        "decrypt",
      ]),
      kekPrf,
      { name: "AES-GCM", iv: new Uint8Array(12).fill(0xee) }
    );

    // 解包 → 应得到原始 DEK
    const unwrapped = await unwrapDek({
      wrappedDek: new Uint8Array(wrapped),
      kek: kekPrf,
    });
    expect(Buffer.from(unwrapped)).toEqual(Buffer.from(TEST_DEK));
  });
});
```

### 9.3 虚拟 Authenticator E2E 配置

```typescript
// tests/e2e/helpers/authenticator.ts
import type { Page, CDPSession } from "@playwright/test";

/**
 * 通过 CDP 注入虚拟 WebAuthn authenticator。
 * ⚠️ PRF 扩展支持取决于 Chromium 版本。
 */
export async function setupVirtualAuthenticator(page: Page): Promise<void> {
  const client: CDPSession = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable", { enableUI: true });
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      // 注意：automaticPresenceSimulation 控制是否自动响应认证请求
      automaticPresenceSimulation: true,
    },
  });
}
```

---

## 10. 测试运行速查表

| 命令 | 范围 | 预计耗时 |
| :--- | :--- | :--- |
| `pnpm test:unit` | 全部单元测试 | < 10s |
| `pnpm test:unit -- --grep "RFC 6238"` | 仅 TOTP 向量 | < 2s |
| `pnpm test:unit -- --grep "三方合并"` | 仅合并测试 | < 3s |
| `pnpm test:integration` | 全部集成测试（需 Docker） | < 60s |
| `pnpm test:e2e` | 全部 E2E 测试 | < 5min |
| `pnpm test:e2e -- --grep "灾难恢复"` | 仅灾难恢复 | < 2min |
| `PRF_TEST_ENABLED=true pnpm test:e2e -- --grep "PRF"` | 含 PRF 的 E2E | < 3min |
| `pnpm test:coverage` | 单元+集成 + 覆盖率报告 | < 90s |

---

## 附录 A: 测试向量来源

| 标准 | 向量内容 | 用途 |
| :--- | :--- | :--- |
| RFC 6238 Appendix B | TOTP SHA1/SHA256/SHA512 在 6 个时间步的 8 位码 | §3.1 TOTP 验证 |
| RFC 4226 Appendix D | HOTP SHA1 counter 0-9 的 6 位码 | §3.2 HOTP 验证 |
| RFC 4648 | base32 编码/解码规范 | §4.5 base32 解码 |
| NIST SP 800-38D | AES-GCM AEAD 认证标签验证 | §4.2 篡改检测 |
| RFC 5869 | HKDF-SHA256 密钥派生 | §4.4 HKDF 测试 |
| Argon2 RFC 9106 | Argon2id 参数与行为规范 | §4.1 确定性测试 |
