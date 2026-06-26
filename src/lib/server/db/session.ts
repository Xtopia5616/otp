// src/lib/server/db/session.ts — 会话吊销委托 (Design §5.1, task 4.9)
// 委托 server/auth 的会话吊销 API（auth 拥有 session 表的全部变更）。
// 路由层（DELETE /api/session/:id 等）经本模块调用，不直接 import auth。
import '$server-only';

export { revokeSession, revokeOtherSessions, revokeAllSessions } from '../auth';
