# 🛠️ WebOTP 开发环境搭建与依赖清单

**文档版本**: 1.0  
**更新日期**: 2026 年 6 月 20 日  
**前置文档**: [docs/Architecture.md](./Architecture.md) v1.1

---

## 0. 概述

本文档提供从零搭建 WebOTP 开发环境的完整指南，覆盖前置依赖、项目初始化、依赖清单、Argon2id Wasm 加载与 CSP 配置、环境变量、数据库初始化、本地启动验证以及目录结构约定。

> **重要**：本文档所有技术选型、版本号、配置均与 Architecture.md v1.1 保持一致。不得自行引入架构未提及的依赖。

---

## 1. 前置依赖

### 1.1 必装工具

| 工具 | 版本要求 | 验证命令 | 说明 |
| :--- | :--- | :--- | :--- |
| **Node.js** | ≥ 22.x LTS | `node -v` | SvelteKit 5 + Vite 6 要求 Node ≥ 18.13，推荐 LTS 22+ |
| **pnpm** | v9.x | `pnpm -v` | 项目统一包管理器（见架构 §2） |
| **PostgreSQL** | ≥ 16 | `psql --version` | Drizzle ORM 持久化层（见架构 §4） |

### 1.2 浏览器要求（WebAuthn PRF）

WebAuthn PRF 扩展（见架构 §7.5）需要浏览器支持 `extensions.prf`：

| 浏览器 | 最低版本 | 备注 |
| :--- | :--- | :--- |
| **Chrome / Edge** | ≥ 118 | PRF 扩展自 M118 起可用 |
| **Safari** | ≥ 17.4 | macOS 14.4+ / iOS 17.4+ |
| **Firefox** | — | 截至 2026 年尚不支持 PRF 扩展，可降级为主密码解锁 |

> **PRF 降级**：若浏览器不支持 PRF，系统自动回退至主密码（MP）解锁（见架构 §7.5）。MP 登录/解锁路径在所有现代浏览器均可工作。

---

## 2. 项目初始化命令序列

### 2.1 创建 SvelteKit 项目

```bash
# 创建 SvelteKit skeleton 项目
pnpm create svelte@latest webotp
cd webotp

# 交互式选项选择：
# ✔ Skeleton project
# ✔ TypeScript (strict)
# ✔ ESLint + Prettier
```

### 2.2 安装核心运行时依赖

```bash
# 前端框架
pnpm add @sveltejs/kit svelte

# 身份认证
pnpm add better-auth @better-auth/passkey

# 数据库 ORM
pnpm add drizzle-orm pg

# 密码学：Argon2id Wasm
pnpm add hash-wasm

# 本地存储
pnpm add idb

# UI 框架
pnpm add tailwindcss @tailwindcss/vite shadcn-svelte bits-ui

# 国际化
pnpm add @paraglide-js/paraglide-sveltekit
```

### 2.3 安装开发依赖

```bash
# 构建工具
pnpm add -D @sveltejs/adapter-node @sveltejs/vite-plugin-svelte vite

# 数据库迁移
pnpm add -D drizzle-kit @types/pg

# 类型与代码规范
pnpm add -D typescript eslint eslint-plugin-svelte prettier prettier-plugin-svelte

# 测试
pnpm add -D vitest @playwright/test

# Playwright 浏览器二进制
pnpm exec playwright install chromium
```

### 2.4 初始化 shadcn-svelte

```bash
pnpm dlx shadcn-svelte@latest init
# 按提示选择：New York style, Zinc 色系, CSS variables: yes
```

---

## 3. 依赖清单

### 3.1 dependencies（运行时）

| 包名 | 版本范围 | 用途 | 架构章节 |
| :--- | :--- | :--- | :--- |
| `svelte` | `^5.0.0` | Svelte 5 Runes 引擎，`$state` 响应式 | §2、§6 |
| `@sveltejs/kit` | `^2.0.0` | 全栈框架：SSR、路由、API 端点 | §2 |
| `better-auth` | `^1.0.0` | 身份认证网关：会话、设备管理、限流 | §2、§7、§8 |
| `@better-auth/passkey` | `^1.0.0` | Better Auth Passkey 插件（WebAuthn PRF） | §7.5 |
| `drizzle-orm` | `^0.35.0` | TypeScript ORM，强类型 Schema + OCC | §2、§4 |
| `pg` | `^8.13.0` | PostgreSQL 客户端（Drizzle 底层驱动） | §2、§4 |
| `hash-wasm` | `^1.21.0` | Argon2id Wasm 实现（纯 Wasm，~30KB） | §2、§3.3 |
| `idb` | `^8.0.0` | IndexedDB Promise 封装，离线优先本地缓存 | §2、§7.2 |
| `tailwindcss` | `^4.0.0` | 原子化 CSS 框架 | §2 |
| `@tailwindcss/vite` | `^4.0.0` | Tailwind CSS 4 Vite 插件 | §2 |
| `shadcn-svelte` | `^1.0.0` | Svelte 5 组件库，基于 bits-ui | §2 |
| `bits-ui` | `^1.0.0` | shadcn-svelte 底层无样式原语组件 | §2 |
| `@paraglide-js/paraglide-sveltekit` | `^2.0.0` | 类型安全 i18n（编译时，无运行时） | §11 |

### 3.2 devDependencies（开发/构建）

| 包名 | 版本范围 | 用途 | 架构章节 |
| :--- | :--- | :--- | :--- |
| `@sveltejs/adapter-node` | `^5.0.0` | Node.js 适配器，生产部署 | §2 |
| `@sveltejs/vite-plugin-svelte` | `^4.0.0` | Svelte Vite 插件 | §2 |
| `vite` | `^6.0.0` | 构建工具 | §2 |
| `drizzle-kit` | `^0.25.0` | Schema 迁移生成/推送 | §4 |
| `@types/pg` | `^8.11.0` | PostgreSQL 类型定义 | §4 |
| `typescript` | `^5.6.0` | TypeScript 编译器（strict + noUncheckedIndexedAccess） | 代码风格 |
| `eslint` | `^9.0.0` | 代码检查 | 代码风格 |
| `eslint-plugin-svelte` | `^2.45.0` | Svelte ESLint 规则 | 代码风格 |
| `prettier` | `^3.4.0` | 代码格式化（2 空格、分号、单引号） | 代码风格 |
| `prettier-plugin-svelte` | `^3.3.0` | Prettier Svelte 支持 | 代码风格 |
| `vitest` | `^2.1.0` | 单元/集成测试框架 | 测试 |
| `@playwright/test` | `^1.49.0` | E2E 测试框架 | 测试 |

---

## 4. Argon2id Wasm 加载与 CSP 配置

### 4.1 hash-wasm 加载方式

`hash-wasm` 是纯 Wasm 库（~30KB），通过 Vite 的静态资源管线自动处理 `.wasm` 文件。**无需手动配置 Worker 或 Wasm 路径**。

```typescript
// src/lib/crypto/argon2.ts
import { argon2id } from 'hash-wasm';

/**
 * Argon2id 口令密钥派生（见架构 §3.3）
 * @param password - 输入口令（MP / RK，UTF-8 编码）
 * @param salt - 16 字节随机盐（base64 解码后传入）
 * @param params - KDF 参数 { m, t, p }，从 user 表读取
 * @returns 32 字节派生密钥（KEK 或 LAK）
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  params: { m: number; t: number; p: number }
): Promise<Uint8Array> {
  return argon2id({
    password: new TextEncoder().encode(password),
    salt,
    parallelism: params.p,     // 默认 4
    iterations: params.t,      // 默认 3
    memorySize: params.m,      // 默认 65536 KiB
    hashLength: 32,            // 输出 32 字节
    outputType: 'binary',
  });
}
```

**Wasm 文件路径**：Vite 构建时自动将 `hash-wasm` 的 `.wasm` 文件哈希命名输出到 `/_app/immutable/wasm/`，运行时通过相对路径加载。**无需手动放置 `.wasm` 到 `static/`**。

### 4.2 CSP 配置

见架构 §2 CSP 取舍。Argon2id Wasm 要求 `'wasm-unsafe-eval'`，但仍**严格禁止** `'unsafe-inline'` 与脚本侧 `'unsafe-eval'`。

在 `svelte.config.js` 中配置：

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    csp: {
      directives: {
        'script-src': [
          'self',
          'wasm-unsafe-eval',      // 允许 Wasm 编译（Argon2id hash-wasm）
          // ❌ 'unsafe-eval'      // 禁止 eval() / new Function()
          // ❌ 'unsafe-inline'    // 禁止内联脚本
        ],
        'style-src':  ['self'],              // Tailwind 走 <link> 外链
        'img-src':    ['self', 'data:'],     // data: 用于 issuer 图标
        'connect-src': ['self'],             // 仅同源 API
        'font-src':   ['self'],
        'base-uri':   ['self'],
        'form-action': ['self'],
      },
    },
  },
};

export default config;
```

**CSP 策略总结**：

| 指令 | 允许 | 禁止 | 原因 |
| :--- | :--- | :--- | :--- |
| `script-src` | `'self'` + `'wasm-unsafe-eval'` | `'unsafe-inline'`、`'unsafe-eval'` | Wasm 编译必须；XSS 防御底线 |
| `style-src` | `'self'` | `'unsafe-inline'` | Tailwind 走外链 |
| `connect-src` | `'self'` | `*` | Better Auth + Vault API 同源 |

---

## 5. 环境变量清单

在项目根目录创建 `.env` 文件（**勿提交至版本控制**）。同时维护 `.env.example` 作为模板。

### 5.1 环境变量表

| 变量名 | 必填 | 示例值 | 说明 |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | ✅ | `postgresql://webotp:dev@localhost:5432/webotp_dev` | PostgreSQL 连接字符串 |
| `BETTER_AUTH_SECRET` | ✅ | （64 字符随机 hex） | Better Auth 会话签名密钥，≥ 32 字节 |
| `BETTER_AUTH_URL` | ✅ | `http://localhost:5173` | 应用公开 URL（Better Auth 回调基址） |
| `SERVER_SECRET` | ✅ | （64 字符随机 hex） | 反枚举 HMAC 密钥（见 §5.3） |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 可选 | `http://localhost:5173` | CORS 受信源列表（多端口开发时追加） |

### 5.2 `.env.example` 模板

```bash
# 数据库连接
DATABASE_URL=postgresql://webotp:dev@localhost:5432/webotp_dev

# Better Auth 会话签名密钥（≥ 32 字节）
# 生成：openssl rand -hex 32
BETTER_AUTH_SECRET=

# 应用公开 URL（开发环境为 Vite dev server）
BETTER_AUTH_URL=http://localhost:5173

# 反枚举防御 HMAC 密钥（256 位随机 hex）
# 生成：openssl rand -hex 32
SERVER_SECRET=

# CORS 受信源（逗号分隔，可选）
# BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:5173
```

### 5.3 `SERVER_SECRET` 生成与用途

**用途**（见架构 §8.1）：服务端对 `GET /api/auth-params?email=` 端点使用 $HMAC(\text{email},\ \text{SERVER\_SECRET})$ 确定性派生**伪盐值**与**伪 KDF 参数**，对不存在邮箱返回形状/耗时一致的伪响应，杜绝时序枚举攻击。

```bash
# 生成方式：256 位随机 hex（64 字符）
openssl rand -hex 32
```

```typescript
// src/lib/server/anti-enum.ts — 伪盐值派生示例
import { createHmac } from 'node:crypto';

/**
 * 对不存在邮箱确定性派生伪盐值（见架构 §8.1）
 * 输出格式与真实盐值一致：base64 编码，24 字符（16 字节）
 */
export function deriveFakeSalt(email: string): string {
  return createHmac('sha256', process.env.SERVER_SECRET!)
    .update(email)
    .digest('base64')
    .slice(0, 24); // 16 字节 → base64 24 字符
}
```

**轮换注意事项**：

| 场景 | 操作 | 影响 |
| :--- | :--- | :--- |
| 常规轮换 | 更新 `.env` 中 `SERVER_SECRET`，重启服务 | 仅影响反枚举伪参数的确定性，用户无感 |
| 密钥泄露 | **立即轮换**，排查泄露路径 | 伪参数可被预测，枚举防御失效 |
| 生产环境 | 使用密钥管理服务（AWS Secrets Manager / Vault） | 勿硬编码或明文存储 |

> `SERVER_SECRET` **独立于** `BETTER_AUTH_SECRET`，前者仅用于反枚举 HMAC，后者用于会话签名。二者**必须不同**。

---

## 6. 数据库初始化

### 6.1 Drizzle 配置文件

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 6.2 初始化工作流

```bash
# 1. 创建数据库
createdb webotp_dev
# 或使用 Docker：
# docker run -d --name webotp-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=webotp_dev -p 5432:5432 postgres:16

# 2. 生成迁移文件（根据 Schema 生成 SQL）
pnpm drizzle-kit generate

# 3. 推送 Schema 到数据库（开发环境推荐，直接同步 DDL）
pnpm drizzle-kit push

# 4. 生产环境使用 migrate（执行迁移文件，带事务）
pnpm drizzle-kit migrate
```

### 6.3 迁移命名约定

```bash
# 生成命名迁移（推荐，便于 review）
pnpm drizzle-kit generate --name init_schema
# 输出: drizzle/0000_init_schema.sql
```

> **开发环境**优先使用 `push`（即时同步，无需维护迁移历史）；**生产环境**必须使用 `generate` + `migrate`（可审计、可回滚）。

---

## 7. 本地启动与验证

### 7.1 启动开发服务器

```bash
# 确保 PostgreSQL 运行中且 Schema 已推送
pnpm drizzle-kit push

# 启动 Vite 开发服务器（默认端口 5173）
pnpm dev
```

启动后控制台输出类似：

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

### 7.2 访问路径

| 路径 | 说明 |
| :--- | :--- |
| `http://localhost:5173/` | 首页（未登录 → 重定向至登录页） |
| `http://localhost:5173/auth/login` | 登录页 |
| `http://localhost:5173/auth/register` | 注册页 |
| `http://localhost:5173/dashboard` | OTP 账户仪表盘（需登录 + 解锁） |

### 7.3 健康检查

```bash
# 验证 SvelteKit 服务存活
curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/
# 预期: 200 或 302（重定向至登录）

# 验证 PostgreSQL 连接
psql $DATABASE_URL -c "SELECT 1;"
# 预期: 返回 1

# 验证 Schema 已创建
psql $DATABASE_URL -c "\dt"
# 预期: 看到 user / vault / passkey_wrap / session 等表
```

### 7.4 首次注册冒烟测试

1. 访问 `http://localhost:5173/auth/register`。
2. 输入邮箱与主密码（MP），提交注册。
3. 注册成功后应自动登录并跳转至 Dashboard。
4. 检查数据库（冒烟验证零知识数据已写入）：

```bash
psql $DATABASE_URL -c "SELECT id, email, kdf_algo, login_salt IS NOT NULL AS has_login_salt, prf_salt IS NOT NULL AS has_prf_salt FROM \"user\";"
# 预期: 看到注册的邮箱，kdf_algo='argon2id'，has_login_salt=true
# 注意: prf_salt 初始为 NULL（首次绑定 Passkey 时生成）

psql $DATABASE_URL -c "SELECT user_id, version, length(encrypted_blob) AS blob_len FROM vault;"
# 预期: version=1，blob_len > 0（初始空账户列表加密结果）
```

5. 尝试登出再登录，验证会话机制。
6. 打开浏览器 DevTools → Application → IndexedDB → `webotp` 数据库，确认离线缓存已沉淀。

---

## 8. 目录结构约定

```
webotp/
├── docs/
│   ├── Architecture.md          # 系统架构设计文档 v1.1
│   └── DevSetup.md              # 本文档
├── drizzle/                     # Drizzle 迁移文件（generate 产物）
│   └── 0000_init_schema.sql
├── src/
│   ├── lib/
│   │   ├── crypto/              # 密码学核心（见架构 §3）
│   │   │   ├── argon2.ts        #   Argon2id Wasm 封装（hash-wasm）
│   │   │   ├── envelope.ts      #   信封加密：DEK 生成/KEK 包装/解包
│   │   │   ├── aes-gcm.ts       #   AES-GCM-256 加解密（SubtleCrypto）
│   │   │   └── kdf.ts           #   LAK / KEK 派生路由
│   │   ├── state/               # 前端状态管理（Svelte 5 Runes，见架构 §6）
│   │   │   ├── auth.svelte.ts   #   身份认证状态（Better Auth 客户端）
│   │   │   ├── crypto.svelte.ts #   DEK 内存管理/锁定/擦除
│   │   │   └── vault.svelte.ts  #   Vault 同步引擎（OCC + 三方合并）
│   │   ├── server/              # 后端逻辑（SvelteKit server-only）
│   │   │   ├── schema.ts        #   Drizzle ORM Schema（见架构 §4）
│   │   │   ├── auth.ts          #   Better Auth 服务端配置
│   │   │   ├── db.ts            #   数据库连接实例
│   │   │   └── anti-enum.ts     #   反枚举伪参数派生（见架构 §8.1）
│   │   ├── models/              # 领域类型定义（见架构 §5）
│   │   │   └── account.ts       #   Account 接口 + 合并类型
│   │   ├── otp/                 # OTP 计算引擎（见架构 §5.2）
│   │   │   ├── totp.ts          #   TOTP 生成（RFC 6238）
│   │   │   └── hotp.ts          #   HOTP 生成（RFC 4226）
│   │   └── components/          # Svelte 5 UI 组件（见架构 §2、§11）
│   │       ├── otp-card.ts      #   OTP 账户卡片
│   │       ├── vault-list.ts    #   账户列表/搜索
│   │       └── sync-status.ts   #   同步状态指示器
│   └── routes/                  # SvelteKit 文件路由（见架构 §7、§9）
│       ├── +layout.svelte       #   全局布局（CSP meta / 主题）
│       ├── +layout.server.ts    #   全局服务端加载
│       ├── auth/
│       │   ├── login/           #   登录页（§7.2）
│       │   └── register/        #   注册页（§7.1）
│       ├── dashboard/
│       │   └── +page.svelte     #   OTP 仪表盘（需解锁态）
│       └── api/
│           ├── auth-params/     #   GET 反枚举端点（§8.1）
│           ├── auth/[...all]/   #   Better Auth catch-all
│           ├── vault/           #   Vault CRUD（§9）
│           └── passkey-wraps/   #   Passkey PRF 包装（§9）
├── static/                      # 静态资源（图标、manifest.json）
├── tests/
│   ├── unit/                    # Vitest 单元测试
│   └── e2e/                     # Playwright E2E 测试
├── drizzle.config.ts            # Drizzle Kit 配置
├── svelte.config.js             # SvelteKit 配置（含 CSP）
├── vite.config.ts               # Vite 配置
├── tsconfig.json                # TypeScript strict + noUncheckedIndexedAccess
├── .env                         # 环境变量（勿提交）
├── .env.example                 # 环境变量模板（提交）
└── package.json
```

### 8.1 各目录职责说明

| 目录 | 职责 | 约束 |
| :--- | :--- | :--- |
| `src/lib/crypto/` | 密码学原语封装（Argon2id、AES-GCM、信封加密） | **不得**在非 crypto 目录直接调用 `SubtleCrypto` 或 `hash-wasm`；所有加解密通过此层统一入口 |
| `src/lib/state/` | Svelte 5 Runes 响应式状态（`$state`/`$derived`） | 敏感 `$state`（DEK 等）必须在锁定时覆写擦除（见架构 §6.2） |
| `src/lib/server/` | 仅服务端运行的代码（Node.js API、数据库操作） | **严禁**引入客户端代码；`+server.ts` 通过 `$lib/server/` 访问 |
| `src/lib/models/` | 纯类型定义（接口、类型别名） | 不含业务逻辑，不依赖运行时 API |
| `src/lib/otp/` | TOTP/HOTP 算法实现 | 仅处理已解码的字节种子，base32 解码由调用方负责 |
| `src/lib/components/` | Svelte 5 UI 组件（`.svelte`） | 无状态逻辑通过 props + callback 传递；**不直接**持有 DEK |
| `src/routes/` | SvelteKit 文件路由（`+page.svelte`、`+server.ts`） | API 路由放 `src/routes/api/`；页面放 `src/routes/<page>/` |

---

## 9. 开发工作流速查

| 命令 | 用途 |
| :--- | :--- |
| `pnpm dev` | 启动 Vite 开发服务器（HMR） |
| `pnpm build` | 生产构建 |
| `pnpm preview` | 本地预览生产构建 |
| `pnpm check` | SvelteKit 类型检查（`svelte-check`） |
| `pnpm test` | 运行 Vitest 单元测试 |
| `pnpm test:e2e` | 运行 Playwright E2E 测试 |
| `pnpm lint` | ESLint 检查 |
| `pnpm format` | Prettier 格式化 |
| `pnpm drizzle-kit generate` | 生成数据库迁移文件 |
| `pnpm drizzle-kit push` | 推送 Schema 到数据库（开发用） |
| `pnpm drizzle-kit migrate` | 执行迁移文件（生产用） |
| `pnpm drizzle-kit studio` | 启动 Drizzle Studio（数据库 GUI） |

---

## 10. 代码风格配置

```jsonc
// tsconfig.json（关键片段）
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

```javascript
// prettier.config.js
/** @type {import('prettier').Config} */
export default {
  singleQuote: true,    // 单引号
  semi: true,           // 带分号
  tabWidth: 2,          // 2 空格缩进
  useTabs: false,
  plugins: ['prettier-plugin-svelte'],
};
```

---

## 附录 A：常见问题

**Q: `hash-wasm` 报错 `WebAssembly.Compile is disallowed`？**  
A: CSP 配置缺少 `'wasm-unsafe-eval'`，见 §4.2。

**Q: PostgreSQL 连接拒绝 `ECONNREFUSED ::1:5432`？**  
A: Node.js ≥ 17 默认优先 IPv6。在 `DATABASE_URL` 中显式使用 `127.0.0.1` 替代 `localhost`，或在 `pg_hba.conf` 启用 IPv6 监听。

**Q: `drizzle-kit push` 报 `relation "user" already exists`？**  
A: Drizzle 的 `push` 命令是幂等增量同步。若表已存在但 Schema 变更不兼容，先手动 `DROP TABLE` 或使用 `generate` + `migrate` 走迁移流程。

**Q: 浏览器报 `prf` 扩展不支持？**  
A: 该浏览器/设备不支持 WebAuthn PRF。系统自动降级为 MP 登录（见架构 §7.5），功能不受影响。

**Q: Playwright 安装失败？**  
A: 确保系统已安装依赖库：`sudo apt install -y libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2`（Ubuntu/Debian）。
