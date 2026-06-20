# WebOTP 工程化与代码风格规范

**文档版本**: 1.0  
**更新日期**: 2026 年 6 月 20 日  
**文档密级**: 公开 (Public)  
**核心标签**: `TypeScript`, `Svelte 5`, `Drizzle ORM`, `ESLint`, `Prettier`, `Conventional Commits`

---

## 0. 变更摘要 (Changelog)

| 变更 | 说明 |
| :--- | :--- |
| 初版 | 首次发布工程化规范，覆盖 TypeScript 配置、代码风格、命名约定、Svelte 5 Runes 约定、服务端/客户端边界、错误处理层级、提交规范、Drizzle 约定、代码组织原则。 |

---

## 1. TypeScript 配置

### 1.1 核心原则

本项目为**零知识 (ZK)** 端到端加密系统。任何类型漏洞都可能导致密文序列化错误、盐值类型混淆或密钥材料泄漏。`strict` 模式是 ZK 密文交互的第一道防线。

**为什么 strict 对 ZK 密文交互至关重要**：

- **`strictNullChecks`**：加密操作的返回值可能是 `null`（如解包失败），忽略空值检查会导致密文字段静默丢失。
- **`noUncheckedIndexedAccess`**：`Uint8Array[index]` 访问返回 `number | undefined`，强制显式检查，杜绝数组越界读取时的未定义字节参与加密计算。
- **`strictFunctionTypes`**：回调函数参数类型逆变检查，防止将 `CryptoKey` 或 `Uint8Array` 传入不兼容的函数签名。

### 1.2 tsconfig.json 关键配置

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    // --- 严格模式 ---
    "strict": true,
    "noUncheckedIndexedAccess": true,    // 数组/对象索引访问强制 null 检查
    "strictNullChecks": true,            // 隐含于 strict，显式声明强调
    "strictFunctionTypes": true,         // 隐含于 strict，显式声明强调
    "noImplicitReturns": true,           // 加密函数不允许隐式返回 undefined

    // --- 模块系统 ---
    "verbatimModuleSyntax": true,        // import type 必须显式标注，避免运行时副作用导入
    "module": "ESNext",
    "moduleResolution": "bundler",       // SvelteKit 推荐
    "target": "ES2022",                  // 支持 Top-level await、structuredClone 等现代 API
    "lib": ["ES2022", "DOM", "DOM.Iterable"],

    // --- 路径别名 ---
    "baseUrl": ".",
    "paths": {
      "$lib/*": ["src/lib/*"],
      "$server/*": ["src/lib/server/*"]
    },

    // --- 输出 ---
    "outDir": ".svelte-kit/types",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // --- 其他 ---
    "esModuleInterop": true,
    "forceConsistentCasingInImports": true,
    "skipLibCheck": true,
    "isolatedModules": true               // esbuild/Svelte 编译器要求
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules"]
}
```

### 1.3 关键规则说明

| 配置项 | 值 | 理由 |
| :--- | :--- | :--- |
| `strict` | `true` | 开启全部严格检查；ZK 系统不允许隐式 `any` 或未定义行为 |
| `noUncheckedIndexedAccess` | `true` | `arr[i]` 返回 `T \| undefined`，防止密文字节越界读取 |
| `verbatimModuleSyntax` | `true` | `import type` 必须显式标注，避免类型导入意外产生运行时依赖 |
| `target` | `ES2022` | 支持 Top-level await（SvelteKit 服务端模块）、`structuredClone`（三方合并副本） |
| `moduleResolution` | `bundler` | SvelteKit 官方推荐，与 Vite 构建器一致 |

---

## 2. 代码风格

### 2.1 Prettier 配置

```jsonc
// .prettierrc
{
  "useTabs": false,
  "tabWidth": 2,
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

### 2.2 ESLint 配置

```js
// eslint.config.js（Flat Config 格式）
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier, // 关闭与 Prettier 冲突的规则
  {
    rules: {
      // --- 禁止项（ZK 安全相关）---
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }], // 生产代码禁 console.log，仅允许 warn/error

      // --- 类型安全 ---
      '@typescript-eslint/no-unnecessary-condition': 'error', // 条件表达式必须有理由
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // --- Svelte 特定 ---
      'svelte/no-at-html-tags': 'error', // 禁止 {@html}，防 XSS（ZK 数据解密后尤其危险）
      'svelte/require-event-dispatcher-types': 'error',
    },
  },
  {
    ignores: ['.svelte-kit/**', 'build/**', 'node_modules/**'],
  },
];
```

### 2.3 禁用项清单

| 规则 | 级别 | 理由 |
| :--- | :--- | :--- |
| `@typescript-eslint/no-explicit-any` | `error` | 隐式 `any` 会让密文序列化/反序列化绕过类型检查 |
| `no-console`（`console.log`） | `warn` | 生产代码不得输出日志，防止密文/盐值意外打印；`console.warn`/`console.error` 保留 |
| `svelte/no-at-html-tags` | `error` | 解密后的 OTP 种子/标签可能含恶意内容，禁止直接 HTML 注入 |

---

## 3. 命名约定

### 3.1 总览

| 上下文 | 约定 | 示例 |
| :--- | :--- | :--- |
| 前端字段 / JS 变量 | `camelCase` | `loginSalt`, `wrappedDekByMaster`, `isUnlocked` |
| 数据库列名 | `snake_case` | `login_salt`, `wrapped_dek_by_master`, `encrypted_blob` |
| Drizzle schema 字段 | `camelCase`（映射 `snake_case` 列） | `loginSalt: text("login_salt")` |
| 接口名 / 类型别名 | `PascalCase` | `Account`, `VaultResponse`, `CryptoError` |
| 文件名（通用） | `kebab-case` | `auth-params.ts`, `vault-sync.ts` |
| 文件名（Svelte 5 Runes 模块） | `kebab-case.svelte.ts` | `auth.svelte.ts`, `crypto.svelte.ts`, `vault.svelte.ts` |
| Svelte 组件 | `PascalCase.svelte` | `AccountCard.svelte`, `RecoveryDialog.svelte` |
| 常量 | `UPPER_SNAKE_CASE` | `ARGON2ID_DEFAULT_M`, `AES_GCM_IV_LENGTH` |
| 枚举成员 | `PascalCase` | `SyncStatus.Idle`, `SyncStatus.Conflict` |

### 3.2 Drizzle ORM 字段映射规则（见 Architecture §4）

Drizzle schema 定义时，字段名使用 `camelCase`，列名使用 `snake_case`：

```typescript
// src/lib/server/schema/user.ts
import { pgTable, text, integer } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  // camelCase 字段名 → snake_case 列名
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  kdfAlgo: text('kdf_algo').notNull().default('argon2id'),         // kdf_algo
  kdfMemoryKiB: integer('kdf_memory_kib').notNull().default(65536), // kdf_memory_kib
  kdfIterations: integer('kdf_iterations').notNull().default(3),    // kdf_iterations
  kdfParallelism: integer('kdf_parallelism').notNull().default(4),  // kdf_parallelism
  loginSalt: text('login_salt').notNull(),                          // login_salt
  kdfSalt: text('kdf_salt').notNull(),                              // kdf_salt
  recoverySalt: text('recovery_salt').notNull(),                    // recovery_salt
  recoveryVerifierSalt: text('recovery_verifier_salt').notNull(),   // recovery_verifier_salt
  recoveryVerifier: text('recovery_verifier').notNull(),            // recovery_verifier
  prfSalt: text('prf_salt'),                                        // prf_salt
});
```

**映射规则**：

- `camelCase` 字段名是 TypeScript/JS 侧的唯一标识符。
- `snake_case` 列名是 PostgreSQL 侧的物理列名。
- Drizzle 自动处理映射：查询结果以 `camelCase` 返回，SQL 生成以 `snake_case` 输出。
- API 契约（§9.1）的 JSON 字段也使用 `camelCase`，与前端一致。
- **禁止**在前端代码中直接使用 `snake_case` 字符串引用列名；所有数据库访问必须通过 Drizzle schema。

### 3.3 接口与类型别名

```typescript
// 接口：描述对象形状，用 interface
interface Account {
  id: string;
  type: 'totp' | 'hotp';
  // ...
}

// 类型别名：描述联合类型、工具类型、函数签名，用 type
type SyncStatus = 'idle' | 'dirty' | 'syncing' | 'conflict';
type HexDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

// 泛型工具类型
type Result<T, E extends WebOtpError> = { ok: true; value: T } | { ok: false; error: E };
```

### 3.4 文件组织命名

```
src/lib/
├── crypto/                  # 纯密码学函数（无状态、无副作用）
│   ├── argon2.ts            # Argon2id 派生
│   ├── aes-gcm.ts           # AES-GCM 加解密
│   ├── envelope.ts          # 信封加密组合逻辑
│   ├── kdf.ts               # HKDF-SHA256
│   └── encoding.ts          # base32/base64 编解码
├── models/                  # 领域模型接口
│   ├── account.ts           # Account 接口
│   └── vault.ts             # Vault 相关类型
├── otp/                     # OTP 计算引擎
│   ├── totp.ts
│   └── hotp.ts
├── server/                  # 服务端专用模块（含 import '$server-only'）
│   ├── db/                  # Drizzle schema 与连接
│   │   ├── index.ts
│   │   ├── schema/
│   │   │   ├── user.ts
│   │   │   ├── vault.ts
│   │   │   └── passkey-wrap.ts
│   │   └── migrate.ts
│   └── auth.ts              # Better Auth 服务端配置
├── state/                   # Svelte 5 Runes 状态模块
│   ├── auth.svelte.ts       # 身份与设备控制
│   ├── crypto.svelte.ts     # 内存安全与加解密状态
│   └── vault.svelte.ts      # 同步引擎
└── components/              # Svelte 组件
    ├── AccountCard.svelte
    └── RecoveryDialog.svelte
```

---

## 4. Svelte 5 Runes 使用约定

### 4.1 `$state` / `$derived` / `$effect` 使用边界

| Rune | 用途 | 禁止场景 |
| :--- | :--- | :--- |
| `$state` | 组件级或模块级可变响应式状态 | 不可用于存储加密密钥的原始 `Uint8Array`（锁定时需显式覆写，`$state` 的代理包装会干扰 `getRandomValues()` 覆写语义） |
| `$derived` | 纯计算派生，无副作用 | 不得调用异步操作或修改外部状态 |
| `$effect` | 副作用（定时器、事件监听、网络请求） | 不得在 `$effect` 内直接赋值其他 `$state`（可能触发无限循环）；不得用于同步计算 |

### 4.2 敏感状态必须放 `.svelte.ts` 模块

```typescript
// src/lib/state/crypto.svelte.ts
// ✅ 正确：敏感状态封装在模块级 Runes 文件中

// 模块级 $state，跨组件共享
let isUnlocked = $state(false);
let dekRef = $state<CryptoKey | null>(null); // extractable: false

export function getIsUnlocked() {
  return isUnlocked;
}

export function lock() {
  isUnlocked = false;
  dekRef = null;
}

export function unlock(dek: CryptoKey) {
  dekRef = dek;
  isUnlocked = true;
}
```

**理由**：`.svelte.ts` 文件在 Svelte 5 中被识别为 Runes 模块，其中的 `$state` 是模块级响应式状态（全局单例），而非组件实例级。将 DEK、`isUnlocked` 等敏感状态放在此处：

1. 确保状态生命周期独立于组件挂载/卸载（组件销毁不丢密钥）。
2. 集中管理内存擦除逻辑（`lock()` 一处覆写，所有消费者响应）。
3. 避免敏感数据通过组件 props 泄漏到组件树。

**禁止**：将 `CryptoKey` 或 `Uint8Array` 密钥材料通过 `$props` 传递给子组件。

### 4.3 `$effect` 副作用规则

```typescript
// ✅ 正确：$effect 用于副作用，不直接赋值其他 $state
$effect(() => {
  // 监听 syncStatus，触发同步
  if (vaultState.syncStatus === 'dirty') {
    const timeoutId = setTimeout(() => syncVault(), 300); // 防抖
    return () => clearTimeout(timeoutId); // 清理函数
  }
});

// ❌ 错误：$effect 内直接赋值其他 $state，可能触发无限循环
$effect(() => {
  if (vaultState.accounts.length > 0) {
    vaultState.syncStatus = 'dirty'; // ← 赋值触发重新执行 → 无限循环
  }
});
```

**规则**：

- `$effect` 的回调函数必须返回清理函数（如有定时器/事件监听）。
- `$effect` 内禁止赋值其他 `$state`，应通过事件处理器或显式函数调用。
- `$effect` 不保证执行时机（可能微任务延迟），不得用于需要同步完成的操作。

### 4.4 禁止废弃的 Svelte 4 Store 语法

```typescript
// ❌ 禁止：Svelte 4 writable/readable/derived store
import { writable } from 'svelte/store';
const count = writable(0);

// ❌ 禁止：$count 自动订阅语法（Svelte 4）
$: doubled = $count * 2;

// ✅ 正确：Svelte 5 Runes
let count = $state(0);
let doubled = $derived(count * 2);
```

**全面禁止**：

- `writable()` / `readable()` / `derived()` — 使用 `$state` / `$derived` 替代。
- `$store` 自动订阅语法 — 直接访问 Runes 变量。
- `$:` 响应式声明 — 使用 `$derived` 或 `$effect` 替代。
- `onMount` / `onDestroy` 中的副作用 — 使用 `$effect`（返回清理函数）替代。

> [建议] 如引入第三方库仍导出 Svelte 4 store，可用 `fromStore()` 桥接，但项目内部代码**必须**全部使用 Runes。

---

## 5. 服务端/客户端边界

### 5.1 环境变量访问

| 场景 | 导入来源 | 示例 |
| :--- | :--- | :--- |
| 构建时确定的服务端密钥 | `$env/static/private` | `DATABASE_URL`, `BETTER_AUTH_SECRET` |
| 运行时动态服务端变量 | `$env/dynamic/private` | Edge 环境变量、容器注入 |
| 客户端公开变量 | `$env/static/public` | `PUBLIC_APP_NAME` |

**规则**：

- 服务端环境变量**绝对禁止**以任何形式暴露到客户端 bundle。
- SvelteKit 在构建时会静态分析 `$env/static/private` 的导入，确保不会泄漏到客户端代码。

### 5.2 `server-only` 模块约定

所有密码学服务端逻辑、数据库访问、Better Auth 配置必须放在 `src/lib/server/` 目录下，并在模块入口添加显式保护：

```typescript
// src/lib/server/db/index.ts
import '$server-only'; // SvelteKit 内置守卫：客户端导入时抛出运行时错误

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

**规则**：

- `src/lib/server/` 下的所有模块**必须**在入口文件（或第一个执行的文件）中 `import '$server-only'`。
- 客户端代码（`src/routes/` 的 `+page.svelte`、`src/lib/state/`、`src/lib/components/`）**禁止**直接 import `src/lib/server/` 下的任何模块。
- 客户端需要服务端数据时，必须通过 SvelteKit `load` 函数（`+page.server.ts`）或 API 路由（`+server.ts`）间接获取。

### 5.3 代码边界检查

```
客户端（浏览器）               服务端（Node.js）
┌───────────────────┐         ┌───────────────────┐
│ src/lib/state/    │         │ src/lib/server/   │
│ src/lib/crypto/   │         │   db/             │
│ src/lib/otp/      │ ──────→ │   auth.ts         │
│ src/lib/components│  HTTP   │ src/routes/api/   │
│ src/routes/       │ <────── │   +server.ts      │
│   +page.svelte    │         │   +page.server.ts │
└───────────────────┘         └───────────────────┘
   纯客户端逻辑                   服务端逻辑 + DB
   Web Crypto API                Better Auth + Drizzle
```

**禁止**：

- 在客户端代码中 `import { db } from '$lib/server/db'`。
- 在 `+page.svelte` 中直接访问 `process.env`。
- 在服务端 `+server.ts` 中使用 `window`、`navigator`、`localStorage`。

---

## 6. 错误处理约定

### 6.1 自定义错误类层级

WebOTP 定义四类领域错误，形成扁平继承结构。所有自定义错误继承自统一基类 `WebOtpError`，便于类型守卫和统一捕获。
> **错误类物理位置约定（权威）**：错误类跨两文件存放，由依赖方向 `crypto/ → models/` 支撑（见 §9.1 依赖图）：
> - `src/lib/models/errors.ts`：基类 `WebOtpError`、`CryptoError`、以及非密码学错误 `OccConflictError`/`NetworkError`/`SessionRevokedError`/`ApiError` 及其子类（`RateLimitError`/`ForbiddenError`/`NotFoundError`/`ConflictError`/`ServerError`）。
> - `src/lib/crypto/errors.ts`：`CryptoError` 的细化子类 `DecryptionError`/`KdfError`/`EncodingError`，以及密文格式错误 `FormatError`。
> - `crypto/errors.ts` 仅 import `CryptoError` 基类自 `models/errors.ts`，**不**反向引入其他错误；`models/errors.ts` 零依赖。
> 此约定与 [Design.md](./Design.md) §10.3 一致。

```typescript
// src/lib/models/errors.ts

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
  readonly code = 'API_ERROR';
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
  constructor(response: Response, readonly retryAfter: number, options?: ErrorOptions) {
    super(response, '操作过于频繁', options);
  }
}

/** 权限不足（403） */
export class ForbiddenError extends ApiError {
  readonly code = 'FORBIDDEN';
  constructor(response: Response, options?: ErrorOptions) { super(response, '权限不足', options); }
}

/** 资源不存在（404） */
export class NotFoundError extends ApiError {
  readonly code = 'NOT_FOUND';
  constructor(response: Response, options?: ErrorOptions) { super(response, '资源不存在', options); }
}

/** 资源已存在（409） */
export class ConflictError extends ApiError {
  readonly code = 'CONFLICT';
  constructor(response: Response, options?: ErrorOptions) { super(response, '资源已存在', options); }
}

/** 服务端错误（5xx） */
export class ServerError extends ApiError {
  readonly code = 'SERVER_ERROR';
  constructor(response: Response, options?: ErrorOptions) { super(response, '服务暂时不可用', options); }
}

// --- CryptoError 细化子类（src/lib/crypto/errors.ts）---
/** AES-GCM 解密失败（AEAD 校验不过：密钥不匹配/密文篡改） */
export class DecryptionError extends CryptoError {
  readonly code = 'DECRYPTION_ERROR';
  constructor(message = '解密失败', options?: ErrorOptions) { super(message, 'decrypt', options); }
}

/** Argon2id 派生失败（参数非法/Wasm 加载失败） */
export class KdfError extends CryptoError {
  readonly code = 'KDF_ERROR';
  constructor(message: string, options?: ErrorOptions) { super(message, 'kdf', options); }
}

/** base32/base64 编解码失败 */
export class EncodingError extends CryptoError {
  readonly code = 'ENCODING_ERROR';
  constructor(message: string, options?: ErrorOptions) { super(message, 'decode', options); }
}

/** 密文封装格式错误（解析失败、版本未知、IV 长度非法） */
export class FormatError extends CryptoError {
  readonly code = 'FORMAT_ERROR';
  constructor(message: string, options?: ErrorOptions) { super(message, 'decode', options); }
}
```

### 6.2 继承关系

```
WebOtpError (abstract)
├── CryptoError              // 密码学操作失败
│   ├── DecryptionError      // AEAD 解密失败
│   ├── KdfError             // Argon2id 派生失败
│   ├── EncodingError        // base32/base64 编解码失败
│   └── FormatError          // 密文封装格式错误（v=1;iv=;ct= 解析失败/版本未知）
├── OccConflictError         // OCC 版本冲突（412），携带 serverVersion/serverEncryptedBlob/serverWrappedDekByMaster
├── NetworkError             // 网络不可达 / 超时
├── SessionRevokedError      // 会话被吊销（401）
└── ApiError                 // HTTP 错误基类（携带 response/status）
    ├── RateLimitError       // 429 限流
    ├── ForbiddenError       // 403 权限不足
    ├── NotFoundError        // 404 资源不存在
    ├── ConflictError        // 409 资源已存在
    └── ServerError          // 5xx 服务端错误
```

### 6.3 错误抛出 vs Result 返回的取舍

| 场景 | 策略 | 理由 |
| :--- | :--- | :--- |
| 加解密操作 | 抛出 `CryptoError` | 失败是异常路径（正常不应发生），调用方需要立即中止流程 |
| 网络请求 | 抛出 `NetworkError` | 失败路径需由状态机捕获，统一进入 offline/conflict 分支 |
| OCC 冲突 | 抛出 `OccConflictError` | 携带合并所需的远程数据，状态机需捕获后执行三方合并 |
| 会话校验 | 抛出 `SessionRevokedError` | 需由全局拦截器捕获，强制锁定并跳转登录页 |
| OTP 计算 | `otp/` 模块内部函数抛出 `CryptoError` 子类（`EncodingError`），签名 `Promise<string>`（与 CryptoSpec §10 一致）；`Result` 类型作为**调用侧可选**包装工具，由调用方按需使用，不强制 | 模块内部保持 CryptoSpec 的抛错语义，避免与 CryptoSpec 不一致；`Result` 模式仍可用于 UI/高频调用侧避免 try/catch 开销，但属调用方职责而非模块契约 |

```typescript
// Result 类型工具（调用侧可选包装，非 otp/ 模块契约）
type Result<T, E extends WebOtpError> = { ok: true; value: T } | { ok: false; error: E };

// otp/ 模块内部签名（权威，与 CryptoSpec §10 一致）：抛 CryptoError 子类
//   async function generateTotp(...): Promise<string>  // 失败抛 EncodingError

// 调用侧按需包装为 Result（示例）：
function toResult<T>(promise: Promise<T>): Promise<Result<T, WebOtpError>> {
  return promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
}
```

### 6.4 禁止吞异常

```typescript
// ❌ 禁止：空 catch 吞异常
try {
  await decryptBlob(blob, dek);
} catch (e) {
  // 静默忽略 → 数据损坏无感知
}

// ❌ 禁止：catch 只 console.log
try {
  await decryptBlob(blob, dek);
} catch (e) {
  console.log('Decryption failed:', e); // 生产代码不应有 console.log
}

// ✅ 正确：显式处理或向上抛出
try {
  await decryptBlob(blob, dek);
} catch (e) {
  if (e instanceof CryptoError) {
    throw e; // 向上抛出，由状态机处理
  }
  throw new CryptoError('Blob 解密失败', 'decrypt', { cause: e });
}
```

**规则**：

- `catch` 块**必须**做以下三件事之一：(1) 显式处理错误、(2) 重新抛出、(3) 转换为自定义错误后抛出。
- 生产代码**禁止** `console.log`（ESLint `no-console` 规则强制）。
- 加密操作的 catch 块**禁止**返回默认值（如空数组、空字符串）假装成功。

---

## 7. 提交与分支规范

### 7.1 Conventional Commits

所有提交消息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**类型 (type)**：

| 类型 | 说明 | 示例 |
| :--- | :--- | :--- |
| `feat` | 新功能 | `feat(vault): implement 3-way merge engine` |
| `fix` | 修复 | `fix(crypto): prevent IV reuse in AES-GCM encrypt` |
| `docs` | 文档 | `docs: add engineering spec v1.0` |
| `refactor` | 重构（不改变行为） | `refactor(auth): extract session check to interceptor` |
| `test` | 测试 | `test(otp): add RFC 6238 TOTP vectors` |
| `chore` | 构建/工具链 | `chore(deps): upgrade drizzle-orm to 0.36` |
| `style` | 代码格式（不影响逻辑） | `style: run prettier on src/lib/crypto/` |
| `perf` | 性能优化 | `perf(argon2): use wasm memory pooling` |
| `ci` | CI/CD 配置 | `ci: add Playwright E2E to GitHub Actions` |

**作用域 (scope)**（可选，推荐使用）：

| 作用域 | 对应目录 |
| :--- | :--- |
| `crypto` | `src/lib/crypto/` |
| `vault` | `src/lib/state/vault.svelte.ts` + `src/routes/api/vault/` |
| `auth` | `src/lib/state/auth.svelte.ts` + `src/routes/api/auth/` |
| `otp` | `src/lib/otp/` |
| `db` | `src/lib/server/db/` |
| `ui` | `src/lib/components/` |
| `deps` | `package.json` |

### 7.2 分支命名

| 分支类型 | 格式 | 示例 |
| :--- | :--- | :--- |
| 功能分支 | `feat/<描述>` | `feat/vault-3way-merge` |
| 修复分支 | `fix/<描述>` | `fix/argon2-salt-encoding` |
| 文档分支 | `docs/<描述>` | `docs/engineering-spec` |
| 重构分支 | `refactor/<描述>` | `refactor/crypto-module-split` |
| 发布分支 | `release/<版本>` | `release/1.0.0` |

**规则**：

- 分支名使用小写 `kebab-case`。
- 主分支为 `main`，禁止直接推送。
- 所有变更通过 PR 合并。

### 7.3 PR 检查清单

每个 PR 合并前**必须**通过以下检查：

- [ ] `pnpm typecheck` — TypeScript 严格类型检查通过
- [ ] `pnpm lint` — ESLint（含 `eslint-plugin-svelte`）无错误
- [ ] `pnpm test` — Vitest 单元/集成测试通过
- [ ] `pnpm test:e2e` — Playwright E2E 测试通过（影响 UI/流程的变更）
- [ ] `pnpm format:check` — Prettier 格式检查通过

---

## 8. Drizzle ORM 约定

### 8.1 Schema 文件组织

```
src/lib/server/db/
├── index.ts              # 数据库连接与 drizzle 实例导出
├── schema/
│   ├── index.ts          # 汇总导出所有 schema
│   ├── user.ts           # user 表（见 Architecture §4）
│   ├── vault.ts          # vault 表
│   └── passkey-wrap.ts   # passkey_wrap 表
└── migrate.ts            # 运行迁移的脚本
```

**规则**：

- 每个表独占一个 schema 文件，文件名与表名对应（`kebab-case`）。
- `schema/index.ts` 汇总导出，`db/index.ts` 导入时传入 `drizzle(client, { schema })`。
- schema 文件**只包含表定义与类型导出**，不包含查询逻辑。

### 8.2 迁移命名

```
drizzle/
├── migrations/
│   ├── 0000_initial_schema.sql
│   ├── 0001_add_prf_salt.sql
│   └── meta/
│       ├── _journal.json      # Drizzle 自动生成
│       └── 0000_snapshot.json  # Drizzle 自动生成
└── drizzle.config.ts
```

**迁移命名规则**：

- 使用 Drizzle Kit 自动生成的序号前缀（`0000_`, `0001_`, ...）。
- 描述性后缀使用 `snake_case`：`0000_initial_schema`。
- 生成命令：`pnpm drizzle-kit generate`。
- 应用命令：`pnpm drizzle-kit migrate`（生产）或 `pnpm drizzle-kit push`（开发快速原型）。

### 8.3 事务使用

WebOTP 的关键写操作必须在 Drizzle 事务内完成，确保原子性（见 Architecture §8.2）：

```typescript
// src/lib/server/db/vault.ts
import { db } from './index';
import { vault } from './schema/vault';
import { user } from './schema/user';
import { eq, and } from 'drizzle-orm';

/**
 * CAS 更新 Vault Blob（OCC）
 * 成功返回新 version，冲突抛出 OccConflictError
 */
export async function updateVaultBlob(
  userId: string,
  expectedVersion: number,
  encryptedBlob: string,
): Promise<number> {
  const result = await db
    .update(vault)
    .set({
      encryptedBlob,
      version: vault.version + 1, // Drizzle 生成 version = version + 1
      updatedAt: new Date(),
    })
    .where(and(eq(vault.userId, userId), eq(vault.version, expectedVersion)))
    .returning({ newVersion: vault.version });

  if (result.length === 0) {
    // OCC 冲突：expectedVersion 与服务端不匹配
    const current = await db
      .select({
        version: vault.version,
        encryptedBlob: vault.encryptedBlob,
        wrappedDekByMaster: vault.wrappedDekByMaster,
      })
      .from(vault)
      .where(eq(vault.userId, userId))
      .limit(1);

    const row = current[0]!; // userId 是 PK，必存在
    throw new OccConflictError(
      `OCC 冲突：期望版本 ${expectedVersion}，实际版本 ${row.version}`,
      row.version,
      row.encryptedBlob,
      row.wrappedDekByMaster,
    );
  }

  return result[0]!.newVersion;
}

/**
 * 密码轮换原子事务（Architecture §8.2）
 * 在单事务内更新 LAK、盐值、wrappedDekByMaster
 */
export async function rotateMasterPassword(
  userId: string,
  params: {
    newLak: string;
    newLoginSalt: string;
    newKdfSalt: string;
    newWrappedDekByMaster: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. 更新 Better Auth 密码哈希（通过 Better Auth 服务端 API）
    await tx
      .update(user)
      .set({
        loginSalt: params.newLoginSalt,
        kdfSalt: params.newKdfSalt,
      })
      .where(eq(user.id, userId));

    // 2. 更新 wrappedDekByMaster（同一 DEK 的新包装）
    await tx
      .update(vault)
      .set({ wrappedDekByMaster: params.newWrappedDekByMaster })
      .where(eq(vault.userId, userId));

    // 3. Blob 与 wrappedDekByRecovery、passkey_wrap 不动（DEK 恒定）
  });

  // 4. 事务提交后，吊销其他设备会话（非事务内，Best Auth API 调用）
  // 见 src/lib/server/auth.ts revokeOtherSessions()
}
```

**规则**：

- `PUT /api/vault`（Blob 更新）使用 CAS 条件更新，不使用显式事务（单条 UPDATE 即原子）。
- `POST /api/vault/rotate-key`（密码轮换）**必须**使用 `db.transaction()`，确保盐值、`wrappedDekByMaster`、Better Auth 密码哈希在同一事务内更新。
- `POST /api/vault/recover/reset`（恢复重置）**必须**使用 `db.transaction()`，确保所有密钥材料原子更新。
- `POST /api/passkey-wraps`（Passkey 绑定）不需要事务（单行插入，不涉及 `vault` 表）。

---

## 9. 代码组织原则

### 9.1 模块边界

```
src/lib/
├── crypto/        → 纯函数，无副作用，无状态（可独立测试）
├── otp/           → 纯函数，依赖 crypto/ 的 HMAC
├── models/        → 纯类型定义，无运行时代码
├── state/         → Svelte 5 Runes 状态模块（.svelte.ts），有副作用
├── server/        → 服务端专用，import '$server-only'
└── components/    → Svelte UI 组件
```

**依赖方向**（单向箭头表示"可 import"）：

```
components/ → state/ → crypto/ ← otp/
              state/ → models/
crypto/     → models/   # 新增：crypto/errors.ts 继承 models/errors.ts 的 CryptoError 基类
server/     → crypto/
server/     → models/
```
> **新增边说明**：`crypto/ → models/` 为本版新增（见 [Design.md](./Design.md) §10.2）——`crypto/errors.ts` 中的 `DecryptionError`/`KdfError`/`EncodingError`/`FormatError` 继承 `models/errors.ts` 的 `CryptoError` 基类，仅用于错误基类，最小且单向。`crypto/` 仍**不得** import `state/` 或 `server/`。

**禁止**：

- `crypto/` 不得 import `state/` 或 `server/`（纯函数不依赖运行时状态）。
- `models/` 不得 import 任何其他模块（纯类型定义，零依赖）。
- `components/` 不得 import `server/`（客户端/服务端边界）。

### 9.2 禁止循环依赖

```
// ❌ 禁止：A → B → A
// crypto/envelope.ts import crypto/aes-gcm.ts
// crypto/aes-gcm.ts import crypto/envelope.ts

// ✅ 正确：单向依赖
// crypto/envelope.ts → crypto/aes-gcm.ts（envelope 调用 aes-gcm）
// crypto/aes-gcm.ts → 无内部依赖（底层工具）
```

**检测方法**：

- ESLint `import/no-cycle` 规则（推荐开启）。
- CI 中运行 `madge --circular src/lib/` 静态分析。

### 9.3 crypto 模块纯函数化

`src/lib/crypto/` 下的所有模块**必须**是纯函数：

```typescript
// src/lib/crypto/aes-gcm.ts

// ✅ 纯函数：相同输入 → 相同输出（加密因 IV 随机，密文不同，但行为确定）
export async function encryptAesGcm(
  plaintext: Uint8Array,
  key: CryptoKey,
  iv: Uint8Array, // 显式传入 IV，不在函数内生成 → 可测试
): Promise<Uint8Array> {
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    plaintext,
  );
  return new Uint8Array(ciphertext);
}

// ✅ 便利函数：内部生成 IV，但委托给纯函数
export async function encryptAesGcmRandomIv(
  plaintext: Uint8Array,
  key: CryptoKey,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await encryptAesGcm(plaintext, key, iv);
  return { ciphertext, iv };
}
```

**规则**：

- 核心加解密函数接收所有输入作为参数（包括 IV），不在函数内部生成随机数。
- 便利函数（如 `encryptAesGcmRandomIv`）可内部生成 IV，但**委托**给纯函数核心。
- 纯函数**禁止**访问全局状态（如 `$state`）、浏览器 API（`localStorage`、`fetch`）。
- 所有纯函数必须可独立测试，无需 mock 任何依赖。

### 9.4 测试友好性

```typescript
// tests/crypto/aes-gcm.test.ts
import { describe, it, expect } from 'vitest';
import { encryptAesGcm, decryptAesGcm } from '$lib/crypto/aes-gcm';

describe('AES-GCM', () => {
  it('encrypt → decrypt roundtrip', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const plaintext = new TextEncoder().encode('hello WebOTP');
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await encryptAesGcm(plaintext, key, iv);
    const decrypted = await decryptAesGcm(ciphertext, key, iv);

    expect(new TextDecoder().decode(decrypted)).toBe('hello WebOTP');
  });

  it('wrong key throws CryptoError', async () => {
    const key1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const key2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const plaintext = new TextEncoder().encode('secret');
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await encryptAesGcm(plaintext, key1, iv);

    await expect(decryptAesGcm(ciphertext, key2, iv)).rejects.toThrow(CryptoError);
  });
});
```

---

## 附录 A. 目录结构总览

```
WebOTP/
├── docs/
│   ├── Architecture.md          # 系统架构设计文档 v1.1
│   ├── Engineering.md           # 本文档
│   ├── StateMachines.md         # 状态机与错误处理规格
│   ├── CryptoSpec.md            # 密码学实现规格
│   ├── UIInventory.md           # 前端架构与组件规格
│   └── TestingSpec.md           # 测试架构规格
├── src/
│   ├── lib/
│   │   ├── crypto/              # 纯密码学函数
│   │   ├── models/              # 领域模型接口
│   │   ├── otp/                 # OTP 计算引擎
│   │   ├── state/               # Svelte 5 Runes 状态模块
│   │   ├── server/              # 服务端专用模块
│   │   │   ├── db/              # Drizzle schema 与连接
│   │   │   └── auth.ts          # Better Auth 配置
│   │   └── components/          # Svelte UI 组件
│   └── routes/                  # SvelteKit 路由
├── tests/
│   ├── unit/                    # Vitest 单元测试
│   ├── integration/             # Vitest 集成测试
│   └── e2e/                     # Playwright E2E 测试
├── drizzle/
│   └── migrations/              # Drizzle 迁移文件
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── drizzle.config.ts
├── svelte.config.js
├── vite.config.ts
└── package.json
```

---

## 附录 B. 包管理器约定

- 包管理器：**pnpm v9**（使用 `pnpm-lock.yaml` 锁定）。
- 安装命令：`pnpm add <pkg>` / `pnpm add -D <pkg>`。
- 脚本运行：`pnpm <script>`（如 `pnpm dev`、`pnpm build`、`pnpm test`）。
- **禁止**使用 `npm` 或 `yarn`，避免 lock 文件冲突。

## 附录 C. base64 变体约定

| 数据类型 | 编码格式 | RFC | 说明 |
| :--- | :--- | :--- | :--- |
| 盐值（`*_salt`） | 标准 base64（含 `=` 填充） | RFC 4648 | DB 存储、API 传输 |
| `wrappedDek*` | 标准 base64（含 `=` 填充） | RFC 4648 | DB 存储、API 传输 |
| `encryptedBlob` | 标准 base64（含 `=` 填充） | RFC 4648 | `v=1;iv=<base64>;ct=<base64>` |
| WebAuthn `credentialId` | base64url（无填充） | RFC 4648 §5 | WebAuthn 规范要求 |

## 附录 D. 密码学参数快查

| 参数 | 值 | 说明 |
| :--- | :--- | :--- |
| AES-GCM 密钥长度 | 256 位 | `crypto.subtle.generateKey(..., { length: 256 }, ...)` |
| AES-GCM IV 长度 | 96 位 (12 字节) | 每次加密用 `crypto.getRandomValues(new Uint8Array(12))` 生成，**绝不复用** |
| AES-GCM tag 长度 | 128 位 | `tagLength: 128` |
| Argon2id m | 65536 KiB (64 MiB) | 内存成本 |
| Argon2id t | 3 | 时间成本（迭代次数） |
| Argon2id p | 4 | 并行线程数 |
| Argon2id salt | 16 字节随机 | 每用途独立盐值 |
| Argon2id output | 32 字节 | KEK / LAK 派生输出 |
| HKDF-SHA256 info | `"WebOTP/KEK-PRF/v1"` | 应用绑定 + 用途 + 版本 |
| HKDF-SHA256 output | 32 字节 | KEK_PRF 派生输出 |
| RK 长度 | 96 位（12 字节）随机 | 展示为 20 字符 base32，4-4-4-4-4 分组（12 字节 base32 恰好 20 字符） |
