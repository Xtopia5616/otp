// tests/fixtures/accounts.ts — 固定账户测试数据 (Testing §2.3)
import type { Account } from '$lib/models/account';

/** 基准账户集（三方合并测试用） */
export const BASE_ACCOUNTS: Account[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    type: 'totp',
    issuer: 'GitHub',
    label: 'alice@example.com',
    secret: 'JBSWY3DPEHPK3PXP', // base32("Hello!\xde\xad\xbe\xef")
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    counter: null,
    icon: 'github',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    deletedAt: null,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    type: 'hotp',
    issuer: 'AWS',
    label: 'bob@example.com',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30, // HOTP 忽略，但字段仍存在
    counter: '5',
    icon: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    deletedAt: null,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    type: 'totp',
    issuer: 'GitLab',
    label: 'charlie@example.com',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA256',
    digits: 8,
    period: 60,
    counter: null,
    icon: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    deletedAt: null,
  },
];
