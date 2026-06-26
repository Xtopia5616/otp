// tests/integration/db/anti-enum.test.ts — 反枚举伪参数形状一致性 (Stage 4 task 4.15)
// 覆盖：伪参数与真实参数逐字段形状/base64 长度/类型一致；HMAC 确定性与可区分性。
// 真实盐均 16 字节 → base64 恒 24 字符；伪盐须一致。Blob/wrap 为 "v=1;iv=...;ct=..." 封装串。
import { describe, it, expect, beforeEach } from 'vitest';
import { derivePseudoAuthParams, derivePseudoRecoveryMaterial } from '$lib/server/anti-enumeration';
import { getAuthParamsByEmail } from '$lib/server/db/user';
import { getRecoverMaterial } from '$lib/server/db/recover';
import { initVault } from '$lib/server/db/vault';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { seedUser } from '../helpers';

const B64_SALT_LEN = 24; // 16 字节 → base64 24 字符
const B64_IV_LEN = 16; // 12 字节 → base64 16 字符

/** 解析 "v=1;iv=...;ct=..." 封装串，返回各段。非法串抛错供断言捕获。 */
function parseWrap(s: string): { iv: string; ct: string } {
  const m = /^v=1;iv=([^;]+);ct=(.+)$/.exec(s);
  if (!m) throw new Error(`非法封装串：${s}`);
  const [, iv, ct] = m;
  if (iv === undefined || ct === undefined) throw new Error(`非法封装串：${s}`);
  return { iv, ct };
}

describe('anti-enumeration 伪参数形状一致性', () => {
  let realEmail: string;

  beforeEach(async () => {
    const id = await seedUser(); // 默认 KDF 65536/3/4，prfSalt=null
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, id));
    if (!u) throw new Error('seed user 查询缺失');
    realEmail = u.email;
    await initVault(id, {
      wrappedDekByMaster: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=master0',
      wrappedDekByRecovery: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=recovery0',
      encryptedBlob: 'v=1;iv=AAAAAAAAAAAAAAAA;ct=blob0',
    });
  });

  describe('derivePseudoAuthParams', () => {
    it('返回 AuthParamsResponse 全字段，类型正确', () => {
      const p = derivePseudoAuthParams('attacker@example.com');
      expect(p.kdfAlgo).toBe('argon2id');
      expect(typeof p.kdfMemoryKiB).toBe('number');
      expect(typeof p.kdfIterations).toBe('number');
      expect(typeof p.kdfParallelism).toBe('number');
      expect(typeof p.loginSalt).toBe('string');
      expect(typeof p.kdfSalt).toBe('string');
      expect(p.prfSalt).toBeNull();
    });

    it('伪盐为 16 字节 base64（24 字符），与真实盐长度一致', () => {
      const p = derivePseudoAuthParams('attacker@example.com');
      expect(p.loginSalt).toHaveLength(B64_SALT_LEN);
      expect(p.kdfSalt).toHaveLength(B64_SALT_LEN);
      expect(Buffer.from(p.loginSalt, 'base64').length).toBe(16);
      expect(Buffer.from(p.kdfSalt, 'base64').length).toBe(16);
    });

    it('与真实 AuthParamsResponse 逐字段形状一致（字段名/类型/base64 长度）', async () => {
      const real = await getAuthParamsByEmail(realEmail);
      if (!real) throw new Error('real auth params 缺失');
      const pseudo = derivePseudoAuthParams('nonexistent@example.com');
      // 字段集合相同
      expect(Object.keys(real).sort()).toEqual(Object.keys(pseudo).sort());
      // 类型相同
      expect(typeof real.kdfAlgo).toBe(typeof pseudo.kdfAlgo);
      expect(typeof real.kdfMemoryKiB).toBe(typeof pseudo.kdfMemoryKiB);
      expect(typeof real.loginSalt).toBe(typeof pseudo.loginSalt);
      expect(typeof real.prfSalt).toBe(typeof pseudo.prfSalt); // 均 null（未绑定 Passkey）
      // base64 长度相同
      expect(real.loginSalt).toHaveLength(pseudo.loginSalt.length);
      expect(real.kdfSalt).toHaveLength(pseudo.kdfSalt.length);
    });

    it('确定性：同一 email 恒得同一输出', () => {
      const a = derivePseudoAuthParams('attacker@example.com');
      const b = derivePseudoAuthParams('attacker@example.com');
      expect(a).toEqual(b);
    });

    it('可区分性：不同 email 产生不同伪盐', () => {
      const a = derivePseudoAuthParams('a@example.com');
      const b = derivePseudoAuthParams('b@example.com');
      expect(a.loginSalt).not.toBe(b.loginSalt);
      expect(a.kdfSalt).not.toBe(b.kdfSalt);
    });
  });

  describe('derivePseudoRecoveryMaterial', () => {
    it('返回 RecoverInitResponse 全字段，类型正确', () => {
      const m = derivePseudoRecoveryMaterial('attacker@example.com');
      expect(m.kdfAlgo).toBe('argon2id');
      expect(typeof m.kdfMemoryKiB).toBe('number');
      expect(typeof m.kdfIterations).toBe('number');
      expect(typeof m.kdfParallelism).toBe('number');
      expect(typeof m.recoverySalt).toBe('string');
      expect(typeof m.recoveryVerifierSalt).toBe('string');
      expect(typeof m.wrappedDekByRecovery).toBe('string');
      expect(typeof m.encryptedBlob).toBe('string');
      // 机密字段不外泄
      expect('recoveryVerifier' in m).toBe(false);
    });

    it('伪盐 16 字节 base64；wrap/blob 为合法 "v=1;iv=...;ct=..." 封装（iv 12 字节）', () => {
      const m = derivePseudoRecoveryMaterial('attacker@example.com');
      expect(m.recoverySalt).toHaveLength(B64_SALT_LEN);
      expect(m.recoveryVerifierSalt).toHaveLength(B64_SALT_LEN);
      expect(Buffer.from(m.recoverySalt, 'base64').length).toBe(16);
      expect(Buffer.from(m.recoveryVerifierSalt, 'base64').length).toBe(16);

      const wrap = parseWrap(m.wrappedDekByRecovery);
      const blob = parseWrap(m.encryptedBlob);
      expect(wrap.iv).toHaveLength(B64_IV_LEN);
      expect(blob.iv).toHaveLength(B64_IV_LEN);
      expect(Buffer.from(wrap.iv, 'base64').length).toBe(12);
      expect(Buffer.from(blob.iv, 'base64').length).toBe(12);
      expect(wrap.ct.length).toBeGreaterThan(0);
      expect(blob.ct.length).toBeGreaterThan(0);
    });

    it('与真实 RecoverInitResponse 逐字段形状一致（字段名/类型/盐长度/封装格式）', async () => {
      const real = await getRecoverMaterial(realEmail);
      if (!real) throw new Error('real recover material 缺失');
      const pseudo = derivePseudoRecoveryMaterial('nonexistent@example.com');
      // 字段集合相同
      expect(Object.keys(real).sort()).toEqual(Object.keys(pseudo).sort());
      // 类型相同
      expect(typeof real.recoverySalt).toBe(typeof pseudo.recoverySalt);
      expect(typeof real.wrappedDekByRecovery).toBe(typeof pseudo.wrappedDekByRecovery);
      expect(typeof real.encryptedBlob).toBe(typeof pseudo.encryptedBlob);
      // 盐长度相同
      expect(real.recoverySalt).toHaveLength(pseudo.recoverySalt.length);
      expect(real.recoveryVerifierSalt).toHaveLength(pseudo.recoveryVerifierSalt.length);
      // 封装格式相同（均合法 v=1;iv=...;ct=...）
      expect(() => parseWrap(real.wrappedDekByRecovery)).not.toThrow();
      expect(() => parseWrap(real.encryptedBlob)).not.toThrow();
      expect(() => parseWrap(pseudo.wrappedDekByRecovery)).not.toThrow();
      expect(() => parseWrap(pseudo.encryptedBlob)).not.toThrow();
    });

    it('确定性：同一 email 恒得同一输出', () => {
      expect(derivePseudoRecoveryMaterial('a@example.com')).toEqual(
        derivePseudoRecoveryMaterial('a@example.com'),
      );
    });

    it('可区分性：不同 email 产生不同伪材料', () => {
      const a = derivePseudoRecoveryMaterial('a@example.com');
      const b = derivePseudoRecoveryMaterial('b@example.com');
      expect(a.recoverySalt).not.toBe(b.recoverySalt);
      expect(a.wrappedDekByRecovery).not.toBe(b.wrappedDekByRecovery);
    });
  });
});
