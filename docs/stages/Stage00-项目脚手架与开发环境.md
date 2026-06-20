# Stage 0 — 项目脚手架与开发环境

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: 无（greenfield 起点）
**关联规格**: [DevSetup.md](../DevSetup.md)、[Engineering.md](../Engineering.md) §1–§2、[Design.md](../Design.md) 附录 A

---

## 目标

从零搭建 WebOTP 开发环境与工程基座，使后续每个阶段的代码都有可编译、可测试、可 lint 的落点。本阶段不写任何业务逻辑，只产出配置、依赖、目录骨架与测试/CI 管线，确保 `pnpm dev` 可启动、`pnpm check/lint/test` 已接通、PostgreSQL 可连接。

## 范围

| 类别 | 产物 |
| :--- | :--- |
| 项目骨架 | SvelteKit skeleton（TypeScript strict + ESLint + Prettier） |
| 依赖 | 运行时 + 开发依赖全套（DevSetup §3） |
| 配置 | tsconfig / prettier / eslint / svelte.config(CSP) / drizzle.config / vitest / playwright / package.json scripts |
| 环境 | .env / .env.example |
| 目录骨架 | src/lib/{models,crypto,otp,webauthn,utils,api-client,state,server,components}、src/routes、tests/{unit,integration,e2e}、drizzle/ |
| CI | .github/workflows/ci.yml |

## 前置依赖

无。仓库当前仅有 docs/，本阶段为第一行代码。

## 具体任务

- [ ] 0.1 `pnpm create svelte@latest webotp` 初始化 SvelteKit skeleton（TypeScript strict + ESLint + Prettier），项目就地初始化于当前目录
- [ ] 0.2 按 DevSetup §2.2 / §3.1 安装运行时依赖：`svelte` `@sveltejs/kit` `better-auth` `@better-auth/passkey` `drizzle-orm` `pg` `hash-wasm` `idb` `tailwindcss` `@tailwindcss/vite` `shadcn-svelte` `bits-ui` `@paraglide-js/paraglide-sveltekit`
- [ ] 0.3 按 DevSetup §2.3 / §3.2 安装开发依赖：`@sveltejs/adapter-node` `@sveltejs/vite-plugin-svelte` `vite` `drizzle-kit` `@types/pg` `typescript` `eslint` `eslint-plugin-svelte` `prettier` `prettier-plugin-svelte` `vitest` `@playwright/test`；执行 `pnpm exec playwright install chromium`
- [ ] 0.4 `pnpm dlx shadcn-svelte@latest init`（New York style / Zinc 色系 / CSS variables: yes）
- [ ] 0.5 配置 `tsconfig.json`（Engineering §1.2）：`strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `moduleResolution: bundler` + `target: ES2022` + paths `$lib/*` `$server/*`
- [ ] 0.6 配置 `.prettierrc`（Engineering §2.1）+ `eslint.config.js` flat config（Engineering §2.2：`no-explicit-any: error`、`svelte/no-at-html-tags: error`、`no-console: warn`、`consistent-type-imports: error`）
- [ ] 0.7 配置 `svelte.config.js`：`adapter-node` + CSP（DevSetup §4.2：`script-src self + wasm-unsafe-eval`，禁 `unsafe-inline`/`unsafe-eval`；`style-src self`；`connect-src self`；`img-src self data:`）
- [ ] 0.8 创建 `.env` / `.env.example`（DevSetup §5.1：`DATABASE_URL` `BETTER_AUTH_SECRET` `BETTER_AUTH_URL` `SERVER_SECRET`；用 `openssl rand -hex 32` 生成后两者）
- [ ] 0.9 配置 `drizzle.config.ts`（DevSetup §6.1）；`createdb webotp_dev`（或 Docker postgres:16）；验证 `psql $DATABASE_URL -c "SELECT 1"`
- [ ] 0.10 配置 `vitest.config.ts`（Testing §1.2：unit + integration 双 workspace，coverage include `src/lib/crypto/**` `src/lib/otp/**`，阈值 lines 95 / branches 90，integration 用 `pool: forks`）
- [ ] 0.11 配置 `playwright.config.ts`（Testing §1.3：testDir `tests/e2e`、chromium、`webServer: pnpm dev` port 5173、`trace: on-first-retry`）
- [ ] 0.12 创建目录骨架（Design 附录 A / DevSetup §8）：`src/lib/{models,crypto,otp,webauthn,utils,api-client,state,server/{db/{schema},},components/{auth,otp,sync,settings,layout,ui}}`、`src/routes`、`tests/{unit,integration,e2e}`、`drizzle/`、`static/`
- [ ] 0.13 配置 `package.json` scripts（DevSetup §9）：`dev` `build` `preview` `check` `lint` `format` `format:check` `test` `test:unit` `test:integration` `test:e2e` `typecheck` `drizzle-kit generate/push/migrate/studio`
- [ ] 0.14 CI 工作流 `.github/workflows/ci.yml`：`typecheck` / `lint` / `test:unit` / `test:integration` / `test:e2e` / `format:check` + `madge --circular src/lib/`（Engineering §9.2）
- [ ] 0.15 安装 `madge` 作为 devDependency 以支持循环依赖静态校验
- [ ] 0.16 空应用冒烟：`pnpm dev` 启动 → `http://localhost:5173/` 返回 200 或 302；`pnpm check` / `pnpm lint` 零错误

## 验收标准

- `pnpm dev` 启动，根路径返回 200 或 302（DevSetup §7.3）
- `pnpm check`、`pnpm lint`、`pnpm format:check` 零错误
- `pnpm test` 运行通过（无测试时 vitest 正常退出 0）
- `pnpm drizzle-kit push` 能连接 PostgreSQL（schema 为空亦验证连通）
- `madge --circular src/lib/` 无循环依赖
- 目录骨架与 Design.md 附录 A 一致；`src/lib/server/` 各模块入口预留 `import '$server-only'` 占位
- CI 工作流可在本地用 `act` 或推送后触发全绿

## 关键参考

- DevSetup §1–§10（命令序列、依赖清单、CSP、环境变量、目录结构、工作流速查）
- Engineering §1（tsconfig）、§2（Prettier/ESLint）、§7.3（PR 检查清单）、§9.2（madge 循环依赖）
- Testing §1.2 / §1.3（vitest / playwright 配置）
- Design 附录 A（模块文件清单总览）

## 风险与注意事项

- **CSP 与 Wasm**：`hash-wasm` 要求 `'wasm-unsafe-eval'`，但必须**严格禁止** `'unsafe-inline'` 与脚本侧 `'unsafe-eval'`（Architecture §2 CSP 取舍）。漏配会导致后续 Argon2id 加载失败或 XSS 防线失守。
- **Node ≥ 22 / IPv6**：PostgreSQL 连接若 `ECONNREFUSED ::1:5432`，`DATABASE_URL` 用 `127.0.0.1` 替代 `localhost`（DevSetup 附录 A）。
- **版本锁定**：所有依赖版本范围以 DevSetup §3 为准，不得自行引入架构未提及的依赖（DevSetup §0）。
- **`verbatimModuleSyntax`**：后续阶段所有 type-only import 必须显式 `import type`，本阶段配置即生效，需在 Stage 1 起严格遵守。
