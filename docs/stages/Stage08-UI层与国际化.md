# Stage 8 — UI 层与国际化 (components/ + routes pages + paraglide/)

**阶段版本**: 1.0
**更新日期**: 2026-06-20
**前置阶段**: [Stage 3](./Stage03-OTP计算引擎.md)（otp/）、[Stage 6](./Stage06-客户端IO与浏览器能力层.md)（utils/）、[Stage 7](./Stage07-客户端状态层.md)（state/）
**关联规格**: [Design.md](../Design.md) §7、[UIInventory.md](../UIInventory.md) 全文、[Architecture.md](../Architecture.md) §11.3、[StateMachines.md](../StateMachines.md) §7

---

## 目标

实现全部 Svelte 5 UI 组件、页面路由、布局守卫与 paraglide 国际化。组件只 import `state/`/`otp/`/`models/`/`utils/`，**禁 import `server/`**，**禁经 `$props` 传 `CryptoKey`/`Uint8Array` 密钥材料**，**禁 `{@html}`**。i18n 全部文案走 paraglide 消息函数，无硬编码 UI 文案。

## 范围

| 类别 | 路径 |
| :--- | :--- |
| 组件 | `src/lib/components/{auth,otp,sync,settings,layout,ui}/*` |
| 页面路由 | `src/routes/{+layout,+page,+error,register,login,unlock,app/*,recover/*,error}/*` |
| i18n | `src/paraglide/*`、`project.inlang/*`、`messages/{zh,en}.json` |

## 前置依赖

Stage 3（`otp/` 计算引擎）、Stage 6（`utils/`）、Stage 7（`state/` 三模块）。shadcn-svelte 已 init（Stage 0）。

## 具体任务

- [ ] 8.1 paraglide 初始化：`project.inlang/` 配置 + `messages/{zh,en}.json`；键命名遵循 StateMachines §7.1（`{domain}.{context}.{element}[.{qualifier}]`，全小写点分，动态参数 `{paramName}` ICU 占位），初始键清单覆盖 §7.2（auth 域 login/register/unlock/session、sync 域、error 域、common 域）
- [ ] 8.2 `layout/SensitiveInput.svelte`：`type=password`，单向 `onSubmit: (value: string) => void` 回调（**不** `bind:value`），解锁/提交后自动清空 `.value=''`（UIInventory §3.5 / §8.5）
- [ ] 8.3 `layout/AppSidebar.svelte`（/app 侧栏导航）、`layout/AppHeader.svelte`（SyncStatusBadge + LockButton + 用户菜单 DropdownMenu）
- [ ] 8.4 `auth/{LoginForm,RegisterForm,UnlockForm,RecoverForm}.svelte`（UIInventory §3.4）
- [ ] 8.5 `otp/{OtpCodeDisplay,AccountItem,AccountList,AccountEditDialog,AddAccountDialog,ClockDriftWarning}.svelte`（UIInventory §3.1）
  - `OtpCodeDisplay`：TOTP 6/8 位码 + 倒计时环（Progress）；HOTP 6/8 位码 + 手动递增按钮
  - `AddAccountDialog`：Tabs（otpauth URI 解析 / 手动输入 / QR 扫描）
- [ ] 8.6 `sync/{SyncStatusBadge,LockButton}.svelte`（UIInventory §3.2）
- [ ] 8.7 `settings/{PasskeyManager,RecoveryKeyDisplay,ExportDialog,ChangePasswordForm}.svelte`（UIInventory §3.3）
  - `RecoveryKeyDisplay`：RK 20 字符 base32 4-4-4-4-4 分组展示 + 抄写确认（RK 仅注册/恢复后一次性传入，不持久化到状态）
  - `ExportDialog`：JSON/CSV 格式选择 + 下载（内存中解密明文，不落服务器）
- [ ] 8.8 shadcn-svelte 组件子集按 UIInventory §4 引入：Button/Card/Dialog/Input/Label/Select/Tabs/Badge/Alert/Tooltip/Toast/DropdownMenu/ScrollArea/Table/Sheet/Progress
- [ ] 8.9 路由：`src/routes/+page.svelte`（根重定向：未登录→/login、未解锁→/unlock、已解锁→/app）、`+layout.svelte`（路由守卫三态，UIInventory §5.1 公开路由白名单）、`+error.svelte`
- [ ] 8.10 路由：`register/`、`login/`、`unlock/+page.svelte`（UIInventory §6 解锁页交互：探测已绑定 Passkey→显示 Passkey 按钮；MP 输入 + 确认；底部"忘记密码？→/recover"）
- [ ] 8.11 路由：`app/+layout.svelte`（isUnlocked 守卫 + AppSidebar + AppHeader + ClockDriftWarning，UIInventory §5.2）、`app/+page.svelte`（OTP 列表，UIInventory §7）
- [ ] 8.12 路由：`app/settings/{+page,passkeys,change-password,export}/+page.svelte`
- [ ] 8.13 路由：`recover/+page.svelte`（输入 RK 验证）、`recover/reset/+page.svelte`（设置新 MP + 轮换 RK + 展示新 RK）
- [ ] 8.14 组件契约（Design §7.1 / Engineering §2.3/§4.2/§5.3）：只 import `state/`/`otp/`/`models/`/`utils/`；**禁** import `server/`；**禁**经 `$props` 传 `CryptoKey`/`Uint8Array` 密钥；**禁** `{@html}`；敏感输入用 `SensitiveInput`
- [ ] 8.15 OTP 列表交互（UIInventory §7）：搜索框（issuer/label 实时过滤）、按 issuer 分组（无 issuer 归"其他"，可折叠）、TOTP 倒计时环、HOTP 手动递增、复制按钮→写剪贴板→Toast→30s 清除
- [ ] 8.16 i18n 全部文案走 paraglide 消息函数，组件/页面无硬编码中文（除 `messages/*.json`）
- [ ] 8.17 禁用 Svelte 4 Store 语法（Engineering §4.4）：全用 `$state`/`$derived`/`$effect`，无 `writable`/`readable`/`$:`

## 验收标准

- `pnpm check` / `pnpm lint` 通过（含 `svelte/no-at-html-tags: error`）
- 各页面可渲染：`/login` `/register` `/unlock` `/app` `/app/settings/*` `/recover` `/recover/reset`
- 路由守卫三态正确（UIInventory §5.1）：未登录→`/login`；已登录未解锁→`/unlock`；已解锁放行
- i18n 键覆盖 StateMachines §7.2 初始清单；切换 locale 文案变化；动态参数（如 `{seconds}`/`{retryAfter}`）正确插值
- 组件不 import `server/`、不传密钥材料、无 `{@html}`（ESLint 强制）
- `madge --circular src/lib/` 无循环依赖
- 解锁页探测已绑定 Passkey（IndexedDB `passkey-wraps` 缓存）→显示 Passkey 按钮；无则仅 MP 输入

## 关键参考

- Design §7（components/ + paraglide/ 模块契约 + 禁止项）
- UIInventory §1（路由树）、§2（页面状态归属）、§3（组件清单）、§4（shadcn 选型）、§5（布局守卫）、§6（解锁页交互）、§7（OTP 列表交互）、附录 A（Props）
- Architecture §6（前端状态管理）、§11.2（数据导出）、§11.3（多语言）
- StateMachines §7（i18n 键命名规范 + 初始键清单）、§5（冲突解决 UI 流程文案）
- Engineering §2.3（禁 `{@html}`）、§4.2（敏感状态不传 props）、§4.4（禁 Svelte 4 Store）、§5.3（客户端/服务端边界）

## 风险与注意事项

- **`{@html}` 禁令**：解密后的 OTP 种子/issuer/label 可能含恶意内容，禁止直接 HTML 注入（Engineering §2.3，ESLint `svelte/no-at-html-tags: error`）。
- **密钥材料不传 props**：`CryptoKey`/`Uint8Array` 密钥不经 `$props` 传递，避免泄漏到组件树（Engineering §4.2）；解密/计算在 `state/`/`otp/` 完成，组件只接收明文结果。
- **`SensitiveInput` 单向**：不 `bind:value`，用 `onSubmit` 回调；提交后立即清空，防 string 副本驻留（Architecture §6.2 诚实定界）。
- **RK 一次性展示**：`RecoveryKeyDisplay` 仅注册/恢复后一次性传入 `recoveryKey` string，**不持久化到状态**（UIInventory §3.3）。
- **数据导出不落服务器**：`ExportDialog` 在内存中解密生成 JSON/CSV，浏览器端下载（Architecture §11.2）。
- **QR 扫描**：若实现，用 `jsQR`（纯 JS 无 Wasm）+ `<video>` + `<canvas>`，不引入额外 UI 库（UIInventory §4 建议）。
