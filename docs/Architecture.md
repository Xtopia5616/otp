# 🛡️ 云端同步零知识 OTP 验证器（WebOTP）：系统架构设计文档

**文档版本**: 1.1  
**更新日期**: 2026 年 6 月 20 日  
**文档密级**: 公开 (Public)  
**核心标签**: `Zero-Knowledge`, `E2EE`, `Envelope-Encryption`, `Svelte 5`, `Better Auth`, `Offline-First`, `WebAuthn PRF`, `Argon2id`

---

## 0. 变更摘要 (Changelog)

| 变更 | 说明 |
| :--- | :--- |
| **PRF 多设备化** | `wrappedDekByPrf` 由 `vault` 单字段迁出为独立 `passkey_wrap` 表（1:N，按 `credentialId` 索引），支持多设备多 Passkey 各自独立包装同一 $DEK$；`prf_salt` 定为用户级盐共用。新增 `GET/POST/DELETE /api/passkey-wraps` 端点。 |
| **恢复后强制轮换 RK** | `recover/reset` 在重置 MP 的同时生成新 $RK$、新 `recovery_salt`/`recovery_verifier_salt`、新 `wrappedDekByRecovery` 与新 `recoveryVerifier$；旧 $RK$ 立即失效，杜绝 RK 泄露后的永久重置能力。 |
| **DEK 轮换移除** | 删除 §3.6"恢复时可选轮换 DEK"描述，文档与 API 契约对齐为恒定 DEK 模型。 |
| **OCC 范围澄清** | 明确仅 `PUT /api/vault`（Blob 更新）自增 `version` 并参与 CAS；`rotate-key`、`passkey-wrap` 绑定/解绑、`recover/reset` 不动 Blob、不增版本、不要求 `expectedVersion`，互不打断并发同步。 |
| **RK 规格明确** | $RK$ 定为 96 位（12 字节）随机，以 20 字符 base32（RFC 4648，去填充，4-4-4-4-4 分组）展示抄写——12 字节 base32 恰好 20 字符，整字节对齐无信息损失。 |
| **登录流补全** | §7.2 补全新设备首次在线登录流；§7.4 重写以会话吊销（§8.2/§8.3）为再认证触发点，纠正"本地缓存被云端轮换失效"的不精确表述，区分 OCC 版本冲突与解密失败冲突。 |
| **合并降级规则** | §5.3 补充 `baseSnapshot` 丢失时的两方合并降级语义。 |
| **冗余清理** | `AuthParamsResponse` 去除与 `recover/init` 重复的 `recoverySalt`；离线缓存清单去除离线无需的 `loginSalt`/`recoverySalt`；`VaultConflictResponse` 去除已迁出的 `wrappedDekByPrf` 并注明省略 `wrappedDekByRecovery` 的原因。 |

---

## 1. 执行摘要 (Executive Summary)

本项目旨在构建一个极高安全级别、端到端加密 (E2EE) 的跨平台云端同步 OTP（一次性密码/两步验证）查看应用。

本系统基于严格的**零知识 (Zero-Knowledge, ZK)** 原则设计：服务器充当"盲"存储网关，用户的真实密码、加密密钥及 OTP 种子绝不以明文形式离开本地设备。本系统实现了**安全的离线优先闭环**，并结合**乐观并发控制 (OCC)** 与**客户端三方合并**策略，完美处理多设备并发写入及密码轮换冲突。配合现代化的 Svelte 5 响应式引擎与 WebAuthn PRF 硬件解锁技术，在提供军工级安全的同时，保障极致流畅的用户体验。

---

## 2. 系统架构与技术栈选型

系统采用现代化的全栈 Serverless/Edge 友好架构，严格分离"身份验证"与"加密数据"。

| 组件类别 | 技术选型 | 架构考量与优势 |
| :--- | :--- | :--- |
| **前端基座** | SvelteKit + Svelte 5 | 利用 Runes (`$state`) 提供极低开销的精细化响应式状态，利于及时追踪并销毁敏感内存。天然支持 SSR/SSG，配合 PWA 提供原生级体验。 |
| **UI 与样式** | Tailwind CSS + shadcn-svelte | 提供高度可定制、无障碍 (a11y) 的现代化组件库。配合 Svelte 5 实现零运行时开销的丝滑交互体验。 |
| **身份与网关** | Better Auth | 现代全栈 Auth 标准。提供强类型 API，内置安全的 HttpOnly 会话控制、多设备追踪、主动吊销及防暴力破解（Rate Limiting）机制。 |
| **后端/持久化** | Node.js + Drizzle ORM + PostgreSQL | Drizzle ORM 的强类型穿透保障前后端数据契约，其轻量级的原子事务控制是实现 OCC 数据同步的刚需。 |
| **密码学核心** | Web Crypto API (`SubtleCrypto`) + Argon2id (Wasm) | AEAD 与随机数走原生 `SubtleCrypto`；口令密钥派生采用 Argon2id（经 Wasm），抗 GPU/ASIC 攻击。详见 §3.3。 |
| **本地存储** | IndexedDB (`idb` 库) | 大容量、结构化持久化存储本地密文 (Blob) 及同步版本元数据，支撑"无网秒开"的离线优先策略。 |
| **解锁方式** | 主密码 (MP) + WebAuthn PRF (Passkeys) | MP 为注册/恢复的强制根因子；Passkey 经 Better Auth 注册后可实现免密登录与解锁（详见 §7.5）。 |

> **CSP 取舍**：v2.1 为维持最严格 CSP 而规避 Wasm。本版采用 Argon2id 必须引入 Wasm，因此 CSP 放宽为 `'wasm-unsafe-eval'`。仍**严格禁止** `'unsafe-inline'` 与脚本侧 `'unsafe-eval'`（`eval`/`Function` 构造器）。Wasm 模块以静态 `.wasm` 资源形式加载，不接受任意字符串编译。

---

## 3. 零知识密码学模型：信封加密密钥层级

本系统不信任服务器。所有的加密计算均在客户端内存中完成。

### 3.1 设计原则：信封加密 (Envelope Encryption)

v2.1 采用 $DEK = KDF(MP)$ 的直派生模型，导致密码轮换时必须重新加密整个 Vault Blob，且恢复密钥包与 PRF 包都会因 DEK 变更而失效。本版改为**信封加密**：

- **DEK (Data Encryption Key)**：注册时由 `crypto.getRandomValues()` 生成的 **256 位随机密钥**，**一旦生成永不更换**，仅用于 AES-GCM 加解密 Vault Blob。
- **KEK (Key Encryption Key)**：由各根因子（MP / RK / PRF）独立派生的密钥，**仅用于包装（加解密）DEK**，从不直接接触 Blob。

如此，Blob 始终由同一 DEK 加密；密码轮换、恢复、PRF 绑定都只是"换一个 KEK 重新包装同一个 DEK"，互不干扰。这是 Bitwarden / 1Password 采用的业界标准模型。

### 3.2 密钥与参数定义

| 符号 | 含义 | 离开设备? |
| :--- | :--- | :--- |
| $MP$ | Master Password，用户高强度主密码 | 否 |
| $RK$ | Recovery Key，96 位（12 字节）随机，以 20 字符 base32（RFC 4648，去填充，4-4-4-4-4 分组）展示抄写；恢复成功后强制轮换（§3.6） | 否 |
| $PRF_{out}$ | WebAuthn PRF 扩展输出的伪随机字节串 | 否 |
| $DEK$ | 256 位随机数据加密密钥（恒定） | 仅以密文（被包装）形式离开 |
| $KEK_{MP}$ | 主密码包装密钥 | 否（仅包装后的 DEK 离开） |
| $KEK_{RK}$ | 恢复密钥包装密钥 | 否 |
| $KEK_{PRF}$ | PRF 包装密钥 | 否 |
| $LAK$ | Login Authentication Key，提交给 Better Auth 的虚拟密码 | 是（以明文提交，服务器再哈希） |
| Salts | `login_salt` / `kdf_salt` / `recovery_salt` / `recovery_verifier_salt` / `prf_salt`，各 16 字节高熵随机；`prf_salt` 为用户级盐（首次绑定 Passkey 时生成，该用户所有 Passkey 共用） | 是（非机密，缓存在本地支持离线计算） |
| $recoveryVerifier$ | $Argon2id(RK,\ recovery\_verifier\_salt)$ 的哈希，注册时存服务器用于重置授权 | 是（仅哈希，非 $RK$ 本身；$RK$ 高熵 + Argon2id 抗暴力） |

### 3.3 Argon2id 参数

口令密钥派生统一采用 **Argon2id**（Wasm 实现）。参数按用户存储于 `user` 表，支持日后调优：

| 参数 | 推荐初值 | 说明 |
| :--- | :--- | :--- |
| $m$ (memory) | 65,536 KiB (64 MiB) | 内存成本，抗 GPU 并行。 |
| $t$ (iterations) | 3 | 时间成本。 |
| $p$ (parallelism) | 4 | 并行线程数。 |
| salt | 16 字节随机 | 每用途独立盐值。 |
| output | 32 字节 | KEK / LAK 派生输出长度。 |

> 移动端可酌情下调 $m$；参数随用户记录下发，客户端据参数本地计算，离线时从 IndexedDB 读取。

### 3.4 密钥派生与包装流

注册时一次性生成 $DEK$ 与全部盐值；随后各 KEK 独立包装同一 $DEK$：

**主密码路径**
$$KEK_{MP} = \text{Argon2id}(MP,\ kdf\_salt,\ m, t, p)$$
$$LAK = \text{Base64}(\text{Argon2id}(MP,\ login\_salt,\ m, t, p,\ \text{len}=32))$$
$$wrappedDek_{MP} = AES\text{-}GCM_{256}(DEK,\ KEK_{MP})$$

- $LAK$ 作为"虚拟密码"提交给 Better Auth，服务器对其再次哈希入库（由 Better Auth 内置口令哈希）。$LAK$ 为 32 字节 base64（约 44 字符），无 Bcrypt 72 字节截断之忧。
- $KEK_{MP}$ 导入为 `CryptoKey`（`extractable: false`），仅本地解包 $DEK$。

**恢复密钥路径**
$$KEK_{RK} = \text{Argon2id}(RK,\ recovery\_salt,\ m, t, p)$$
$$wrappedDek_{RK} = AES\text{-}GCM_{256}(DEK,\ KEK_{RK})$$
$$recoveryVerifier = \text{Argon2id}(RK,\ recovery\_verifier\_salt,\ m, t, p)$$

- $recoveryVerifier$ 存入服务器 `recovery_verifier` 字段，用于恢复重置端点的服务端授权（详见 §3.6、§8.5）；与 $KEK_{RK}$ 经不同盐派生，互不可逆推。
- $wrappedDek_{RK}$ 存入服务器 `wrapped_dek_by_recovery` 字段。
- $recovery\_salt$ 与 $kdf\_salt$ 相互独立，确保 RK 与 MP 派生路径语义隔离。

**PRF 路径（可选，绑定 Passkey 后；支持多设备多 Passkey）**
$$KEK_{PRF} = \text{HKDF-SHA256}(PRF_{out},\ prf\_salt)$$
$$wrappedDek_{PRF} = AES\text{-}GCM_{256}(DEK,\ KEK_{PRF})$$

- $PRF_{out}$ 来自 WebAuthn `prf.eval` 扩展，浏览器从设备安全芯片获取，**永不离开设备**。PRF 输出按凭证隔离：同一 $prf\_salt$ 在不同 Passkey 上产生不同的 $PRF_{out}$，故每个绑定的 Passkey 需各自独立包装同一 $DEK$。
- $prf\_salt$ 为**用户级**盐（存 `user.prf_salt`，首次绑定时生成，该用户所有 Passkey 共用），作为 HKDF 的 `salt` 输入将派生绑定到本 Vault 上下文。$PRF_{out}$ 已是硬件高熵伪随机输出，无需 Argon2id 慢哈希，HKDF-SHA256 即满足密钥派生强度。
- 每个 $wrappedDek_{PRF}$ 以独立行存入 `passkey_wrap` 表（按 `credentialId` 索引），支持多设备各自免密。该 Passkey 同时注册为 Better Auth 凭证：解锁时 `navigator.credentials.get` 的同一断言既由 Better Auth 验证以建立会话，又输出 $PRF_{out}$ 解包对应 $wrappedDek_{PRF}$ 得 $DEK$，实现彻底免密（详见 §7.5）。

**Vault Blob**
$$Blob = AES\text{-}GCM_{256}(\text{serialize}(Accounts),\ DEK)$$

- Blob 自始至终由恒定 $DEK$ 加密；任何根因子变更都不需要重新加密 Blob。

### 3.5 密码轮换的正确性保证

轮换主密码时：

1. 以旧 $KEK_{MP}$ 解包出 $DEK$（$DEK$ 不变）。
2. 派生新 $KEK'_{MP} = \text{Argon2id}(MP_{new},\ kdf\_salt_{new})$ 与新 $LAK'$。
3. 用 $KEK'_{MP}$ 重新包装 $DEK$ → 新 $wrappedDek_{MP}$。
4. 单事务内：更新 Better Auth 密码哈希（$LAK'$）、`kdf_salt`、`login_salt`、`wrapped_dek_by_master`。
5. **Blob 与 $wrappedDek_{RK}$、$wrappedDek_{PRF}$ 完全不动**——它们绑定的是恒定 $DEK$，天然保持有效。

> 这正是信封加密的核心收益：v2.1 轮换后恢复密钥失效的缺陷在此模型下不复存在。

### 3.6 灾难恢复流

1. 用户输入旧 $RK$ → 派生 $KEK_{RK}$ → 解包 $wrappedDek_{RK}$ 得到 $DEK$。
2. 用 $DEK$ 解密本地/云端 Blob，恢复 Vault 数据。
3. 强制设置新 $MP$ 并**轮换 $RK$**：客户端生成新 $RK_{new}$（96 位/12 字节，格式同 §3.2），派生新 $KEK_{MP}$、新 $LAK$、新 $KEK_{RK,new}$（配新 `recovery_salt`）、新 $recoveryVerifier$（配新 `recovery_verifier_salt`），分别以 $KEK_{MP}$ 与 $KEK_{RK,new}$ 重新包装同一 $DEK$。服务端校验**旧** $recoveryVerifier$ 通过后，在单事务内更新 Better Auth 密码哈希（$LAK$）、`login_salt`、`kdf_salt`、`wrapped_dek_by_master`、`wrapped_dek_by_recovery`、`recovery_salt`、`recovery_verifier_salt`、`recovery_verifier`，并吊销所有活动会话（详见 §8.5）。新 $RK_{new}$ 由客户端展示给用户重新抄写，旧 $RK$ 立即失效。
4. $DEK$ 与 Blob 不变（信封加密核心收益），故恢复后原有离线数据仍可解密；已绑定的各 Passkey 包装亦因 $DEK$ 恒定而保持有效，无需重新绑定。

---

## 4. 数据模型设计 (Drizzle ORM Schema)

数据存储严格隔离"用户身份标识"与"零知识数据金库"。**Vault 与 User 为 1:1 基数**（每用户恰好一个金库），以 `userId` 作为 Vault 主键并外键引用 `user.id`，避免 v2.1 中 `vault.id == user.id` 又同时存在 `userId` 的冗余。

```typescript
// 1. Better Auth User 扩展表（存储盐值与 KDF 参数，均为非机密）
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  // --- KDF 参数（随用户存储，支持日后调优 / 离线下发）---
  kdfAlgo: text("kdf_algo").notNull().default("argon2id"),
  kdfMemoryKiB: integer("kdf_memory_kib").notNull().default(65536), // m
  kdfIterations: integer("kdf_iterations").notNull().default(3),   // t
  kdfParallelism: integer("kdf_parallelism").notNull().default(4), // p
  // --- 各用途独立盐值（16 字节，base64 存储）---
  loginSalt: text("login_salt").notNull(),     // LAK 派生
  kdfSalt: text("kdf_salt").notNull(),         // KEK_MP 派生
  recoverySalt: text("recovery_salt").notNull(), // KEK_RK 派生
  recoveryVerifierSalt: text("recovery_verifier_salt").notNull(), // recoveryVerifier 派生
  recoveryVerifier: text("recovery_verifier").notNull(), // Argon2id(RK, recovery_verifier_salt)，重置授权校验
  prfSalt: text("prf_salt"),                   // KEK_PRF 派生（用户级盐，首次绑定时生成，所有 Passkey 共用）；可空=未绑定 Passkey
});

// 2. 零知识数据金库表（与 user 1:1）
export const vault = pgTable("vault", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // --- 信封密钥的多个包装（均由各自 KEK 加密的同一 DEK）---
  wrappedDekByMaster: text("wrapped_dek_by_master").notNull(),
  wrappedDekByRecovery: text("wrapped_dek_by_recovery").notNull(),
  // --- ZK 密文 Blob（由恒定 DEK 加密）---
  encryptedBlob: text("encrypted_blob").notNull(), // 结构见 §4.1
  // --- OCC 版本号：初值 1，每次成功 PUT 自增 ---
  version: bigint("version", { mode: "number" }).notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// 3. Passkey PRF 包装表（与 user 1:N，支持多设备多 Passkey 各自独立包装同一 DEK）
export const passkeyWrap = pgTable("passkey_wrap", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(), // WebAuthn 凭证 ID（base64url）
  wrappedDekByPrf: text("wrapped_dek_by_prf").notNull(),  // 该 Passkey 的 KEK_PRF 包装的同一 DEK
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

**OCC 版本语义**：

- 注册时插入 Vault，`version = 1`。
- `PUT /api/vault` 执行 `UPDATE ... SET encrypted_blob=?, version=version+1 WHERE user_id=? AND version=?`（CAS）。
- 影响行数 0 → 返回 `412 Precondition Failed`，附带服务端当前 `version` 与 `encryptedBlob` 供客户端三方合并。
- `version` 单调递增，**回退时客户端以服务端版本为准**。
- **OCC 范围限定**：仅 `PUT /api/vault`（Blob 更新）自增 `version` 并参与 CAS；`rotate-key`、`passkey-wrap` 绑定/解绑、`recover/reset` 均不动 `encrypted_blob`，不自增 `version`、不要求 `expectedVersion`，故不与并发 Blob PUT 相互打断。

### 4.1 Blob 内部结构

`encrypted_blob` 字段为结构化密文字符串，采用稳定可演进的封装格式：

```text
v=1;iv=<base64 12B nonce>;ct=<base64 ciphertext+tag>
```

- `v` 为 Blob 格式版本号（独立于 OCC `version`），用于未来加密结构迁移。
- 明文为 `JSON.stringify(Accounts)`（见第 5 章），经 `AES-GCM-256(plaintext, DEK, iv)` 加密。
- 解析失败或 `v` 未知时，客户端应拒绝并提示 Vault 损坏，绝不静默降级。

---

## 5. 领域模型：OTP 账户与 TOTP/HOTP 规范

本系统的核心业务对象是 **OTP 账户 (Account)**。v2.1 完全缺失该模型，而 §7.3 的三方合并恰恰依赖每条账户的稳定标识与时间戳。本章补全。

### 5.1 Account 数据结构

```typescript
interface Account {
  id: string;            // UUID v4，客户端生成，全局唯一且不可变——合并的唯一锚点
  type: "totp" | "hotp";  // 算法类型
  issuer: string | null; // 发行方，如 "GitHub"；用于分组与图标
  label: string;         // 账户标签，如用户名/邮箱
  secret: string;        // base32（RFC 4648）编码的共享密钥，大写、去填充、去空格存储
  algorithm: "SHA1" | "SHA256" | "SHA512"; // HMAC 算法，默认 SHA1（RFC 6238）
  digits: 6 | 8;         // 验证码位数，默认 6
  period: number;        // TOTP 步长（秒），默认 30；HOTP 忽略
  counter: string | null;// HOTP 计数器（字符串承载 bigint，JSON 安全；新建初值 "0"，单调递增）；TOTP 忽略
  icon: string | null;   // 可选图标标识
  createdAt: number;     // 创建时间（epoch ms）
  updatedAt: number;     // 最后修改时间（epoch ms）——合并的字段级仲裁依据
  deletedAt: number | null; // 软删除墓碑；非空表示已删除，合并时拥有绝对优先级
}
```

### 5.2 TOTP / HOTP 参数规范

遵循 RFC 6238（TOTP）与 RFC 4226（HOTP）：

| 参数 | TOTP | HOTP |
| :--- | :--- | :--- |
| 算法 | HMAC-SHA1/256/512 | HMAC-SHA1/256/512 |
| 位数 | 6 或 8 | 6 或 8 |
| 动态因子 | $T = \lfloor \text{now}/\text{period} \rfloor$（默认 period=30s） | 计数器 `counter`，每次使用后递增 |
| 种子编码 | base32（RFC 4648），无 `=` 填充，大写，忽略空格/连字符 | 同左 |

- **base32 解码**：客户端在解密后对 `secret` 解码为字节，传入 `SubtleCrypto` 的 HMAC。解码失败应明确报错而非使用空种子。
- **时钟漂移**：TOTP 依赖 $T$，详见 §11 的时钟漂移检测。
- **HOTP 计数器**：以字符串存储以避免 JSON `number` 精度丢失；合并时取**两侧较大值**（计数器单调递增）。

### 5.3 三方合并的字段级语义

合并输入为三元组 $(Base,\ Local,\ Remote)$，输出 $Merged$。对账户集合按 `id` 取并集，逐条裁决：

1. **墓碑绝对优先**：若 $Local.deletedAt \neq null$ 或 $Remote.deletedAt \neq null$，则结果标记为已删除，`deletedAt` 取两侧非空者的较小值。**即使另一侧在离线期间修改了字段，删除仍然生效**——彻底杜绝"僵尸数据复活"。
2. **新增条目**：仅出现在一侧且该侧未删除 → 直接纳入 $Merged$。
3. **字段级三方裁决**（未删除条目）：对每个可变字段（`issuer`/`label`/`secret`/`algorithm`/`digits`/`period`/`counter`/`icon`）：
   - 仅一侧相对 $Base$ 变更 → 采用该侧值。
   - 两侧均变更 → 采用 `updatedAt` 较大者（更新的一方胜出）。
   - 两侧均未变更 → 沿用 $Base$ 值。
4. **HOTP 计数器例外**：`counter` 不走 `updatedAt` 仲裁，恒取 `max(Local, Remote)`，防回放。
5. **不可变字段**：`id`、`createdAt` 永不参与合并变更。

合并产物经 DEK 加密为新 Blob，携带 `expectedVersion = RemoteVersion` 重新 `PUT`；若再次 412 则重复合并（以最新 Remote 为新基准）。

> **Base 丢失降级**：若 `baseSnapshot` 因 IndexedDB 被清空而缺失，三方合并退化为两方：以 `Local` 为基准，采纳 `Remote` 相对 `Local` 的新增条目与墓碑；对两侧均存在的条目，按 `updatedAt` 取较大者（HOTP `counter` 仍取 `max`）。降级会丢失"哪一侧真正变更"的信息，可能误判并发修改，故下一次成功同步后应立即用合并结果重建 `baseSnapshot`。

---

## 6. 前端架构与状态管理 (Svelte 5 Runes Engine)

充分利用 Svelte 5 Runes 实现细粒度的响应式系统，划分为三大核心状态模块：

### 6.1 `auth.svelte.ts` (身份与设备控制)

封装 Better Auth 客户端，管理 `isAuthenticated` 与多设备追踪逻辑。提供一键吊销 (Revoke) 异常设备会话的功能。会话列表与当前设备标识来自 Better Auth 的 session/device API。

### 6.2 `crypto.svelte.ts` (内存安全与加解密)

负责内存生命周期管理。持有 `isUnlocked` 状态与不可导出的 `DEK`（经 KEK 解包后导入为 `extractable: false` 的 `CryptoKey`）。

- **锁定触发**：主动锁定 / 5 分钟无操作 / 切后台（`visibilitychange` → hidden）。
- **内存擦除（诚实定界）**：锁定时将 `$state` 置空，并对所有敏感 `Uint8Array` 中间产物（MP/RK 明文、PRF 输出、各 KEK 派生字节、base32 解码后的种子等）调用 `crypto.getRandomValues()` 原地覆写。
  - **能力边界**：此机制**无法**清除 `CryptoKey` 的内部不可导出状态（由浏览器托管，生命周期受 GC 影响），也**无法**清除 JS 不可变字符串（MP 作为 string 输入时的 UTF-16 副本）。因此敏感根因子应尽量以 `Uint8Array` 形式短暂持有并立即覆写；UI 输入框在解锁后立即清空。这是尽力而为 (best-effort) 的纵深防御，而非对内存转储的绝对保证。

### 6.3 `vault.svelte.ts` (核心同步引擎)

维护业务模型与同步状态机：

```typescript
export const vaultState = $state({
  accounts: [] as Account[],
  baseSnapshot: [] as Account[], // 用于三方合并的基准快照（最近一次成功同步的解密结果）
  syncStatus: "idle" | "dirty" | "syncing" | "conflict",
  lastVersion: 0, // 最近一次成功同步的服务端 version
});
```

_机制_: 任何对 `accounts` 的增删改都会将 `syncStatus` 标为 `dirty`。服务防抖拦截后，静默打包加密并进入 `syncing` 状态，触发网络请求；收到 412 转入 `conflict` 并启动三方合并（§5.3）。

---

## 7. 核心工作流与冲突解决

### 7.1 注册流

1. 客户端生成全部盐值（`login_salt`/`kdf_salt`/`recovery_salt`/`recovery_verifier_salt`）与 KDF 参数。
2. 用户输入 $MP$；生成随机 $DEK$（256 位）与随机 $RK$（96 位/12 字节，20 字符 base32 按 4-4-4-4-4 分组展示抄写，详见 §3.2）。
3. 派生 $KEK_{MP}$、$LAK$、$KEK_{RK}$、$recoveryVerifier$，分别包装 $DEK$ 得 $wrappedDek_{MP}$、$wrappedDek_{RK}$。
4. 以 $DEK$ 加密空账户列表为初始 Blob。
5. 调用 Better Auth 注册（以 $LAK$ 为密码），并 `POST /api/vault` 初始化 Vault（version=1）。
6. 盐值/KDF 参数/$recoveryVerifier$ 写入 `user` 表；密文包装与 Blob 写入 `vault` 表。

### 7.2 登录与离线优先启动闭环 (Login & Offline-First Boot)

**首次在线登录（新设备 / 在线）**：

1. `GET /api/auth-params?email=` 取 KDF 参数与 `loginSalt`/`kdfSalt`/`prfSalt`（反枚举端点，不存在邮箱返回伪参数）。
2. 用户输入 $MP$ → 派生 $LAK = \text{Base64}(\text{Argon2id}(MP,\ login\_salt))$ 与 $KEK_{MP}$。
3. 以 $LAK$ 调用 Better Auth 登录建立会话。
4. `GET /api/vault` 取 `encryptedBlob`、`wrappedDekByMaster`、`version`；用 $KEK_{MP}$ 解包得 $DEK$ → 解密 Blob 渲染。
5. 登录成功后执行下述"数据沉淀"，进入离线优先闭环。（若该设备已绑定 Passkey，可改走 §7.5 PRF 免密登录+解锁。）

**离线优先启动闭环**：

1. **数据沉淀**：成功登录后，必须将 `kdfSalt`、`prfSalt`、KDF 参数以及最新的 `encryptedBlob`、`wrappedDekByMaster`、各 `passkeyWrap` 行写入 IndexedDB（`loginSalt` 仅登录瞬间使用、`recoverySalt` 仅服务端恢复使用，均无需离线缓存）。
2. **无网冷启动**：SvelteKit 拦截器检测到无网，直接读取 IndexedDB 中的盐值与 KDF 参数缓存。
3. **本地解锁**：用户输入 $MP$ → 结合本地 `kdf_salt` 派生 $KEK_{MP}$ → 解包 `wrappedDekByMaster` 得 $DEK$ → 解密本地 Blob，实现地铁/机舱等环境下的**毫秒级 UI 渲染**。
4. **网络恢复**：后台转为 `syncing` 发起 `GET /api/vault` 对比版本号，落后则合并。

### 7.3 并发同步与三方合并 (3-Way Merge OCC)

服务端 `PUT /api/vault` 利用 Drizzle 执行原子条件更新（`WHERE version = expectedVersion`）。

**当收到 412 Precondition Failed 时**：

1. 拉取远端最新密文（`RemoteBlob`），用 $DEK$ 解密得到 `RemoteData`。
2. 执行合并引擎：$Merged = \text{Merge}(BaseSnapshot,\ LocalData,\ RemoteData)$（裁决规则见 §5.3）。
3. **墓碑策略**：`deletedAt` 拥有绝对优先级——设备 A 删除账户 X，即使设备 B 离线修改 X 后同步，合并结果仍将 X 标记已删除，根绝"僵尸数据复活"。
4. 重新加密 $Merged$，携带 `expectedVersion = RemoteVersion` 再次 `PUT`；再次 412 则以新 Remote 重复合并。

### 7.4 灾难级冲突：密码轮换并发 (Key Rotation Conflict)

**场景**：设备 A 更改了密码（云端 `wrappedDekByMaster` 被新 $KEK_{MP}$ 重写，$DEK$ 与 Blob 不变），且 §8.2 的事务吊销了设备 A 之外的所有会话。设备 B 离线添加了数据，上线后其旧会话已被吊销 → 同步请求收到 `401 Unauthorized`（§8.3），而非数据层 412。

> **信封加密的关键收益——轮换不产生解密失败冲突**：若设备 B 在会话过期前已成功 `GET /api/vault` 并触发 `PUT` 收到 412（OCC 版本冲突，远端 Blob 被他方更新），设备 B 仍可用**内存中已有的 $DEK$**（来自本地 `wrappedDekByMaster` + 旧 $KEK_{MP}$ 解包，$DEK$ 恒定）直接解密远端 Blob，执行三方合并后用同一 $DEK$ 重新加密上传。注意：此时设备 B 解的是**远端 Blob**（用恒定 $DEK$），而非解云端新 `wrappedDekByMaster`——后者用旧 $KEK_{MP}$ 解包必然 AEAD 失败，但合并路径不依赖它。无需用户输入新密码。

**唯一需要用户介入的情形**：设备 B 会话被吊销（401）且处于锁定状态（内存无 $DEK$）。前端拦截器强制锁机并跳登录页（§8.3）。用户须以**新 $MP$** 登录（旧 $LAK$ 已失效，Better Auth 拒绝）→ 派生新 $KEK_{MP}$ → 解包云端新 `wrappedDekByMaster` 得 $DEK$ → 解密云端 Blob → 与本地缓存 Blob 的离线差异完成合并 → 重新加密上传。若用户仍持旧 $MP$，登录即失败，提示其在已轮换设备上获知新密码或走 §7.6 灾难恢复。

### 7.5 WebAuthn PRF 免密解锁（多设备多 Passkey）

Passkey 同时承担 Better Auth 登录与 DEK 解包，单一 WebAuthn 仪式完成两件事。每个设备各自绑定的 Passkey 在 `passkey_wrap` 表中独立存一行，互不覆盖，支持多设备同时免密。

1. **绑定**（已登录状态下，可在任意设备重复执行）：若 `user.prf_salt` 为空则先生成并持久化（用户级盐，所有 Passkey 共用）。调用 `navigator.credentials.create({ publicKey: { ..., extensions: { prf: { eval: { first: prf_salt } } } } })` 向 Better Auth 注册一个 Passkey 凭证并取得 $PRF_{out}$。派生 $KEK_{PRF} = \text{HKDF-SHA256}(PRF_{out},\ prf\_salt)$，包装当前 $DEK$ 得 $wrappedDek_{PRF}$，`POST /api/passkey-wraps { credentialId, wrappedDekByPrf }` 写入新行。绑定不触动 `vault` 行、不参与 OCC，不影响并发 Blob 同步。
2. **免密解锁**（任一已绑定设备）：以邮箱取 `auth-params` 获得 `prf_salt` → `navigator.credentials.get` 携带 PRF 扩展 → (a) Better Auth 验证断言**建立会话**，(b) $PRF_{out}$ 派生 $KEK_{PRF}$ → `GET /api/passkey-wraps` 取本设备 Passkey 对应行 → 解包 $wrappedDek_{PRF}$ 得 $DEK$ → `GET /api/vault` 取 Blob 解密。全程无需 $MP$，且因会话已建立，**可直接在线同步**。
3. **PRF 不可用降级**：浏览器/设备不支持 PRF、`prf.eval` 失败或用户取消时，回退到 §7.2 的 $MP$ 登录 + $MP$ 解包。PRF 是便利层而非唯一路径。
4. **撤销某设备 Passkey**：`DELETE /api/passkey-wraps/:credentialId` 删除该行，并通过 Better Auth 吊销该 Passkey 凭证。撤销仅影响该设备，其他已绑定设备不受影响；撤销后该设备无法再免密登录或解锁。

### 7.6 灾难恢复流

经 `recover/init` 取恢复材料 → 输入旧 $RK$ 派生 $KEK_{RK}$ → 解包 `wrappedDekByRecovery` 得 $DEK$ → 解密 Blob 恢复数据 → 强制设置新 $MP$、**生成新 $RK_{new}$ 并配新 `recovery_salt`/`recovery_verifier_salt`** 重新包装 $DEK$、派生新 $recoveryVerifier$ → 经 `recover/reset` 校验旧 $recoveryVerifier$ 后单事务更新 MP/RK 全部字段并吊销所有会话；新 $RK_{new}$ 展示给用户重新抄写，旧 $RK$ 失效（详见 §3.6、§8.5）。

---

## 8. 后端控制与会话安全

### 8.1 反枚举防御 (Anti-Enumeration)

`GET /api/auth-params?email={email}` 返回该邮箱的 KDF 参数与盐值。针对不存在的邮箱：

- 使用 $HMAC(\text{email},\ \text{ServerSecret})$ 确定性派生**固定伪盐值**与**固定伪 KDF 参数**。
- 返回 HTTP 200，响应体结构与真实用户一致，耗时与真实用户一致（必要时加入恒定延迟），杜绝时序与响应体枚举。
- 伪参数须与真实参数在**类型与形状**上完全一致（相同的字段、相同的 base64 长度），仅数值为确定性的伪随机。

### 8.2 密码轮换的原子事务 (Atomic Key Rotation)

`POST /api/vault/rotate-key` 必须在单个 Drizzle 事务中完成：

1. 用新 $LAK'$ 覆写 Better Auth 密码哈希，更新 `login_salt`、`kdf_salt`。
2. 写入新 $wrappedDek_{MP}$（用新 $KEK_{MP}$ 包装同一 $DEK$）。
3. **Blob、$wrappedDek_{RK}$、$wrappedDek_{PRF}$ 不动**（绑定恒定 $DEK$）。
   _关键收尾_：事务提交后，**吊销该用户除当前设备外的所有活动会话**（经 Drizzle 直接删除 `session` 表行实现——BA 的 `revokeOtherSessions` 端点 `requireHeaders` 需当前会话上下文，不适用于事务提交后调用；见 Design §5.2），强制其他设备重新验证新 $MP$。

### 8.3 严格的会话校验 (Session Revocation Check)

客户端定时或在发同步请求时，若后端返回 `401 Unauthorized`（由于会话被其他设备远程吊销），前端 SvelteKit 拦截器捕获后，**立即强制触发内存锁**：擦除 $DEK$ 与所有敏感 `$state`，重定向至登录页。

### 8.4 服务器可知性边界 (Server Knowledge Boundary)

明确服务器**能够**与**不能**得知的信息，作为威胁模型的基准：

| 服务器可知 | 服务器不可知 |
| :--- | :--- |
| 邮箱、KDF 参数、各盐值（含 `prf_salt`）、$recoveryVerifier$ 哈希、各 `passkey_wrap` 行（`credentialId` + `wrappedDekByPrf` 密文） | $MP$、$RK$、$PRF_{out}$、$DEK$、各 KEK |
| $LAK$ 的服务器侧哈希 | $LAK$ 明文（仅提交瞬间经 TLS，不入库明文） |
| Blob 密文字节长度（泄露**账户数量量级**与总数据规模） | 任何账户字段、OTP 种子、账户数量精确值 |
| `wrappedDek_*` 密文 | $DEK$ 明文 |
| `version`、`updatedAt`、会话与设备元数据 | 账户级 `updatedAt`/`deletedAt`（合并仅客户端进行） |

> **残留侧信道**：Blob 大小会泄露账户数量量级。若需消除，可在加密前对明文填充至固定块大小（未来增强，本版不强制）。

### 8.5 恢复重置的安全授权 (Recovery Reset Authorization)

用户忘记 $MP$ 即无法产生 $LAK$、无法登录，故恢复必须是**无会话端点**。为防止任意凭邮箱重置他人账户导致数据丢失 DoS：

1. **初始化** `POST /api/vault/recover/init { email }`：返回 `wrappedDekByRecovery`、`encryptedBlob`、`recoverySalt`、`recoveryVerifierSalt`、KDF 参数。该端点**严格 Rate Limit**（IP + 邮箱维度指数冷却），并对不存在邮箱返回确定性伪材料（形状/耗时一致），延续 §8.1 的反枚举策略。
2. **客户端验证 $RK$**：用 $RK$ 派生 $KEK_{RK}$ 尝试解包 $wrappedDek_{RK}$；AEAD 校验通过即证明 $RK$ 正确（失败则提示 RK 错误，不泄露任何数据）。
3. **重置** `POST /api/vault/recover/reset { email, recoveryVerifier, newLak, newLoginSalt, newKdfSalt, newWrappedDekByMaster, newWrappedDekByRecovery, newRecoverySalt, newRecoveryVerifierSalt, newRecoveryVerifier }`：服务端**常量时间比较**提交的 $recoveryVerifier$（由旧 $RK$ 派生，用于授权）与存储值，通过后在单 Drizzle 事务内更新 Better Auth 密码哈希、`login_salt`、`kdf_salt`、`wrapped_dek_by_master`、`wrapped_dek_by_recovery`、`recovery_salt`、`recovery_verifier_salt`、`recovery_verifier`，并**吊销该用户所有活动会话**。$DEK$ 与 Blob 不变，故恢复后原有离线数据与各 Passkey 包装仍可解密。新 $RK_{new}$ 由客户端生成并展示给用户重新抄写，旧 $RK$ 立即失效。
4. **ZK 边界与轮换收益**：服务器仅持有 $recoveryVerifier$（Argon2id 哈希，恢复后替换为新 $RK_{new}$ 的哈希）。$RK$ 96 位高熵随机，即便数据库泄露，离线暴力 $recoveryVerifier$ 在 Argon2id 成本下不可行——与 $wrappedDek_{RK}$（同样仅靠 $RK$ 熵保护）安全级别一致。强制轮换确保即便旧 $RK$ 在恢复前已泄露，攻击者在恢复完成后亦丧失重置能力。

---

## 9. API 契约 (Endpoints & Schemas)

除 `auth-params`（公开，反枚举）与 `recover/init`、`recover/reset`（无会话，靠 $recoveryVerifier$ + 限流授权）外，其余端点（Vault 与 `passkey-wraps`）均需 Better Auth 会话鉴权。

| 方法 | 路径 | 说明 | 成功 | 冲突/错误 |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/auth-params?email=` | 取 KDF 参数与盐值（反枚举） | 200 | — |
| POST | `/api/auth/*` | Better Auth 登录/注册/登出 | 200 | 401 |
| GET | `/api/vault` | 拉取当前 Vault | 200 | 401 |
| POST | `/api/vault` | 初始化 Vault（注册时，version=1） | 201 | 401/409 |
| PUT | `/api/vault` | CAS 上传新 Blob | 200 `{version}` | 412 见 §9.1 `VaultConflictResponse` |
| POST | `/api/vault/rotate-key` | 轮换主密码（不动 Blob/version） | 200 | 401 |
| GET | `/api/passkey-wraps` | 列出本用户所有 PRF 包装（解锁用） | 200 | 401 |
| POST | `/api/passkey-wraps` | 绑定一个 Passkey 的 PRF 包装 | 201 | 401/409 |
| DELETE | `/api/passkey-wraps/:credentialId` | 撤销指定 Passkey 的 PRF 包装 | 200 | 401/404 |
| POST | `/api/vault/recover/init` | 取恢复材料（无会话，限流） | 200 | 429 |
| POST | `/api/vault/recover/reset` | 以旧 RK 验证哈希重置 MP+轮换 RK（无会话） | 200 | 403/429 |
| DELETE | `/api/session/:id` | 吊销指定会话 | 200 | 404 |

### 9.1 关键请求/响应 Schema

```typescript
// GET /api/auth-params
interface AuthParamsResponse {
  kdfAlgo: "argon2id";
  kdfMemoryKiB: number;
  kdfIterations: number;
  kdfParallelism: number;
  loginSalt: string;   // base64
  kdfSalt: string;     // base64
  prfSalt: string | null;
}

// GET /api/vault
interface VaultResponse {
  version: number;
  encryptedBlob: string;        // "v=1;iv=...;ct=..."
  wrappedDekByMaster: string;
  wrappedDekByRecovery: string;
  updatedAt: string;            // ISO
}

// PUT /api/vault
interface VaultPutRequest {
  expectedVersion: number;
  encryptedBlob: string;
}
interface VaultPutResponse { version: number; }
interface VaultConflictResponse {  // 412 — 仅含合并所需：Blob + 当前主包装（供客户端比对是否被轮换）
  serverVersion: number;
  encryptedBlob: string;
  wrappedDekByMaster: string;      // 不含 wrappedDekByRecovery（恒定，仅重置才变）与 passkey_wrap（独立表，按需 GET /api/passkey-wraps）
}

// POST /api/vault/rotate-key
interface RotateKeyRequest {
  newLak: string;               // 新 LAK（服务器再哈希）
  newLoginSalt: string;
  newKdfSalt: string;
  newWrappedDekByMaster: string; // 新 KEK_MP 包装的同一 DEK
}

// POST /api/passkey-wraps（绑定一个 Passkey 的 PRF 包装；不动 vault 行，不参与 OCC）
interface PasskeyWrapCreateRequest {
  credentialId: string;        // WebAuthn 凭证 ID（base64url）
  wrappedDekByPrf: string;     // "v=1;iv=...;ct=..."
}
interface PasskeyWrapRow {
  id: string;
  credentialId: string;
  wrappedDekByPrf: string;
  createdAt: string;           // ISO
}
// GET /api/passkey-wraps → PasskeyWrapRow[]；DELETE /api/passkey-wraps/:credentialId → 200 / 404

// POST /api/vault（注册时初始化 Vault 行；user 表的盐值/KDF 参数/recoveryVerifier
// 经 Better Auth 注册扩展字段写入，不在此端点）
interface VaultCreateRequest {
  wrappedDekByMaster: string;
  wrappedDekByRecovery: string;
  encryptedBlob: string;          // 初始空账户列表加密结果
}
interface VaultCreateResponse { version: number; } // 恒为 1

// POST /api/vault/recover/init（无会话，限流）
interface RecoverInitRequest { email: string; }
interface RecoverInitResponse {
  kdfAlgo: "argon2id";
  kdfMemoryKiB: number;
  kdfIterations: number;
  kdfParallelism: number;
  recoverySalt: string;          // KEK_RK 派生
  recoveryVerifierSalt: string;  // recoveryVerifier 派生
  wrappedDekByRecovery: string;
  encryptedBlob: string;
}

// POST /api/vault/recover/reset（无会话）
interface RecoverResetRequest {
  email: string;
  recoveryVerifier: string;            // 旧 RK 派生的 verifier，服务端常量时间校验以授权重置
  newLak: string;
  newLoginSalt: string;
  newKdfSalt: string;
  newWrappedDekByMaster: string;       // 新 KEK_MP 包装同一 DEK
  newWrappedDekByRecovery: string;     // 新 RK + 新 recovery_salt 包装同一 DEK
  newRecoverySalt: string;             // 新 RK 的 KEK 派生盐
  newRecoveryVerifierSalt: string;     // 新 RK 的 verifier 派生盐
  newRecoveryVerifier: string;         // 新 RK 的 Argon2id 哈希，覆盖旧 verifier
}
```

> 所有 `wrappedDek*` 与 `encryptedBlob` 均为 `"v=1;iv=...;ct=..."` 结构。客户端对任何解析失败必须显式报错，不静默降级。

---

## 10. 安全与防御体系汇总

| 威胁向量 / 攻击方式 | 系统防御机制 / 缓解措施 |
| :--- | :--- |
| **服务器完全泄露** | **零知识绝对防御**：数据库仅存 $LAK$ 的服务器侧哈希、各 `wrappedDek` 密文与 AES-GCM Blob。无 $MP$/RK/$DEK$ 无法解密。 |
| **JS 内存驻留窃取** | `extractable: false` 的 `CryptoKey`；敏感 `Uint8Array` 调用 `getRandomValues()` 覆写。**诚实定界**：无法清除 `CryptoKey` 内部状态与 JS 不可变字符串（详见 §6.2）。 |
| **恶意插件 / XSS** | 严格 CSP：禁止 `unsafe-inline` 与脚本侧 `unsafe-eval`；Wasm 仅限静态 `.wasm` 资源（`wasm-unsafe-eval`）。 |
| **设备丢失风险** | IndexedDB 仅存密文；原主可远程一键 Revoke 丢失设备会话，触发强制内存销毁。 |
| **暴力撞库攻击** | Better Auth 网关层内置 Rate Limiting，基于 IP + 账号双重维度的指数级冷却拦截。 |
| **账户枚举** | `auth-params` 对不存在邮箱返回确定性伪参数，形状/耗时一致（§8.1）。 |
| **恢复重置滥用 / 数据丢失 DoS** | 恢复重置端点校验旧 $recoveryVerifier$（旧 $RK$ 的 Argon2id 哈希）+ 严格限流；无 $RK$ 无法重置；恢复成功后强制轮换 $RK$，旧 $RK$ 立即丧失重置能力（§8.5）。 |
| **密码轮换后恢复/Passkey 失效** | 信封加密：$DEK$ 恒定，恢复包装与各 Passkey 包装跨 MP 轮换天然有效（§3.5）。 |
| **多设备并发写入风暴** | OCC + 客户端三方合并 + 墓碑优先，自动收敛，无需服务端合并逻辑。 |
| **Blob 大小侧信道** | 已知残留：泄露账户数量量级。未来可通过固定块填充消除（§8.4）。 |

---

## 11. 核心用户体验增强

1. **TOTP 时钟漂移检测 (Clock Drift Warning)**  
   前端启动时静默比对 HTTP `Date` 响应头与本地 `Date.now()`。若偏差超过 15 秒，弹出非阻塞式警告提示用户校准系统时间，防止 TOTP $T$ 值错位导致验证码失效。
2. **无门槛数据导出 (Data Portability)**  
   用户拥有数据的绝对控制权。在解锁状态下，可在内存中解密全部数据，并直接在浏览器端生成 JSON/CSV 供下载迁移。导出明文不落服务器。
3. **多语言支持**  
   采用现代无运行时、类型安全的方案（如 `paraglide-sveltekit`），提供无缝的国际化支持。
4. **Passkey 免密解锁**  
   Passkey 经 Better Auth 注册后，单一 WebAuthn 仪式同时登录与解锁，彻底免密；支持多设备各自绑定，新设备在线同步无需主密码（§7.5）。

---

## 12. 架构全局优势总结

从传统的自研鉴权或中心化密码管理器，迁移至 **Better Auth + Svelte 5 + Drizzle + 信封加密** 的新一代组合，为本项目带来三大核心优势：

1. **工程效能与类型安全**：Drizzle ORM 的强类型约束穿透至前后端，极大减少了 ZK 密文交互中的序列化错误；Better Auth 削减了 80% 身份验证及设备追踪的样板代码；完整的 `Account` 领域模型与统一 API 契约让前后端协作有据可依。
2. **安全性升维**：信封加密密钥层级让密码轮换、灾难恢复、PRF 绑定三者解耦且彼此无伤；Argon2id 提供现代口令哈希强度；结合诚实的内存擦除定界与 2026 标配的 WebAuthn PRF 解锁，实现了纯 Web 端的军工级防御。
3. **无缝的跨端体验**：Svelte 5 精细的有限状态机 + IndexedDB 本地缓存 + 乐观并发控制 (OCC)，让离线优先不再是口号。即使用户在网络极度不稳定的离线环境中，依然能够享受"零延迟解锁、无损冲突合并"的丝滑体验。
