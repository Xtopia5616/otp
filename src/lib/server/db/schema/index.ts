// src/lib/server/db/schema/index.ts — Drizzle schema barrel (Engineering §8.1)
// 汇总导出全部表定义。drizzle.config.ts 与 server/db/index.ts 均导入本文件。
// 含 Better Auth 管理表（user/session/account/verification/passkey）+ WebOTP 自有表
//（vault/passkeyWrap）。BA 表是 drizzleAdapter 运行的前提，亦供 server 层直接查询
//（session 吊销 / account 密码哈希）。
export * from './user';
export * from './session';
export * from './account';
export * from './verification';
export * from './passkey';
export * from './vault';
export * from './passkey-wrap';
