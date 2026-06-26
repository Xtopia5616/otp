// tests/unit/otp/otpauth-uri.test.ts — otpauth URI 解析/构建单测 (Stage 3.5)
import { describe, it, expect } from 'vitest';
import { parseOtpauthUri, buildOtpauthUri } from '$lib/otp/otpauth-uri';
import { EncodingError } from '$lib/crypto/errors';
import type { Account, AccountDraft } from '$lib/models/account';

const SECRET = 'JBSWY3DPEHPK3PXP'; // base32("Hello!\xde\xad\xbe\xef")

describe('parseOtpauthUri — 字段提取', () => {
  it('完整 TOTP URI 提取全部字段', () => {
    const uri = `otpauth://totp/GitHub:alice%40example.com?secret=${SECRET}&issuer=GitHub&algorithm=SHA256&digits=8&period=60`;
    expect(parseOtpauthUri(uri)).toEqual({
      type: 'totp',
      issuer: 'GitHub',
      label: 'alice@example.com',
      secret: SECRET,
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      counter: null,
      icon: null,
    });
  });

  it('完整 HOTP URI 提取 counter', () => {
    const uri = `otpauth://hotp/AWS:bob%40example.com?secret=${SECRET}&issuer=AWS&algorithm=SHA1&digits=6&counter=5`;
    expect(parseOtpauthUri(uri)).toEqual({
      type: 'hotp',
      issuer: 'AWS',
      label: 'bob@example.com',
      secret: SECRET,
      algorithm: 'SHA1',
      digits: 6,
      period: 30, // HOTP 无 period 参数 → 默认 30
      counter: '5',
      icon: null,
    });
  });

  it('仅 secret 的最小 TOTP URI 使用全部默认值', () => {
    expect(parseOtpauthUri(`otpauth://totp/alice?secret=${SECRET}`)).toEqual({
      type: 'totp',
      issuer: null,
      label: 'alice',
      secret: SECRET,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: null,
      icon: null,
    });
  });

  it('仅 secret 的最小 HOTP URI：counter 默认 "0"', () => {
    const parsed = parseOtpauthUri(`otpauth://hotp/alice?secret=${SECRET}`);
    expect(parsed.counter).toBe('0');
    expect(parsed.type).toBe('hotp');
  });

  it('issuer 仅来自 label 前缀（无 issuer 参数）', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/Foo:alice?secret=${SECRET}`);
    expect(parsed.issuer).toBe('Foo');
    expect(parsed.label).toBe('alice');
  });

  it('issuer 仅来自 query 参数（label 无前缀）', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/alice?secret=${SECRET}&issuer=Bar`);
    expect(parsed.issuer).toBe('Bar');
    expect(parsed.label).toBe('alice');
  });

  it('issuer 参数优先于 label 前缀', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/Foo:alice?secret=${SECRET}&issuer=Bar`);
    expect(parsed.issuer).toBe('Bar');
    expect(parsed.label).toBe('alice');
  });

  it('B2: 空 issuer 参数（?issuer=）回退 label 前缀', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/Foo:alice?secret=${SECRET}&issuer=`);
    expect(parsed.issuer).toBe('Foo'); // 空串回退 pathIssuer，非 ""
    expect(parsed.label).toBe('alice');
  });

  it('B2: 空 issuer 参数且无 label 前缀 → issuer null', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/alice?secret=${SECRET}&issuer=`);
    expect(parsed.issuer).toBeNull();
  });

  it('无 path 的 URI → label 为空串（pathname 不以 / 开头分支）', () => {
    const parsed = parseOtpauthUri(`otpauth://totp?secret=${SECRET}`);
    expect(parsed.label).toBe('');
    expect(parsed.issuer).toBeNull();
    expect(parsed.type).toBe('totp');
  });

  it('secret 规范化：小写 → 大写', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/alice?secret=${SECRET.toLowerCase()}`);
    expect(parsed.secret).toBe(SECRET);
  });

  it('secret 规范化：含空格/填充 → 去除', () => {
    const parsed = parseOtpauthUri(
      `otpauth://totp/alice?secret=${SECRET.slice(0, 8)}+${SECRET.slice(8)}%3D%3D`,
    );
    // URLSearchParams 把 '+' 解码为空格；base32Decode 容忍空格与 '=' 填充
    expect(parsed.secret).toBe(SECRET);
  });

  it('类型大小写不敏感（host=TOTP）', () => {
    const parsed = parseOtpauthUri(`otpauth://TOTP/alice?secret=${SECRET}`);
    expect(parsed.type).toBe('totp');
  });

  it('algorithm 大小写不敏感（sha256 → SHA256）', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/alice?secret=${SECRET}&algorithm=sha256`);
    expect(parsed.algorithm).toBe('SHA256');
  });

  it('TOTP 忽略 counter 参数（counter 恒 null）', () => {
    const parsed = parseOtpauthUri(`otpauth://totp/alice?secret=${SECRET}&counter=5`);
    expect(parsed.counter).toBeNull();
  });
});

describe('buildOtpauthUri — 格式构建', () => {
  const totpDraft: AccountDraft = {
    type: 'totp',
    issuer: 'GitHub',
    label: 'alice@example.com',
    secret: SECRET,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    counter: null,
    icon: null,
  };

  it('TOTP 精确格式（issuer + 全参数）', () => {
    expect(buildOtpauthUri(totpDraft)).toBe(
      'otpauth://totp/GitHub:alice%40example.com' +
        `?secret=${SECRET}&issuer=GitHub&algorithm=SHA1&digits=6&period=30`,
    );
  });

  it('HOTP 精确格式（counter）', () => {
    const hotpDraft: AccountDraft = {
      type: 'hotp',
      issuer: 'AWS',
      label: 'bob@example.com',
      secret: SECRET,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: '5',
      icon: null,
    };
    expect(buildOtpauthUri(hotpDraft)).toBe(
      'otpauth://hotp/AWS:bob%40example.com' +
        `?secret=${SECRET}&issuer=AWS&algorithm=SHA1&digits=6&period=30&counter=5`,
    );
  });

  it('issuer=null：path 无前缀，无 issuer 参数', () => {
    const draft: AccountDraft = {
      type: 'totp',
      issuer: null,
      label: 'alice',
      secret: SECRET,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: null,
      icon: null,
    };
    expect(buildOtpauthUri(draft)).toBe(
      `otpauth://totp/alice?secret=${SECRET}&algorithm=SHA1&digits=6&period=30`,
    );
  });

  it('HOTP counter=null 回退 "0"（counter ?? "0" 分支）', () => {
    const draft: AccountDraft = {
      type: 'hotp',
      issuer: null,
      label: 'x',
      secret: SECRET,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: null,
      icon: null,
    };
    expect(buildOtpauthUri(draft)).toBe(
      `otpauth://hotp/x?secret=${SECRET}&algorithm=SHA1&digits=6&period=30&counter=0`,
    );
  });
});

describe('buildOtpauthUri — F1: 接受完整 Account', () => {
  it('Account（含生命周期字段）可传入，生命周期字段被忽略', () => {
    const account: Account = {
      id: '00000000-0000-0000-0000-000000000001',
      type: 'totp',
      issuer: 'GitHub',
      label: 'alice@example.com',
      secret: SECRET,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: null,
      icon: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      deletedAt: null,
    };
    const uri = buildOtpauthUri(account);
    expect(uri).toBe(
      'otpauth://totp/GitHub:alice%40example.com' +
        `?secret=${SECRET}&issuer=GitHub&algorithm=SHA1&digits=6&period=30`,
    );
  });
});

describe('parseOtpauthUri → buildOtpauthUri 往返一致', () => {
  const drafts: Array<{ name: string; draft: AccountDraft }> = [
    {
      name: 'TOTP + issuer + SHA256/8/60',
      draft: {
        type: 'totp',
        issuer: 'GitLab',
        label: 'charlie@example.com',
        secret: SECRET,
        algorithm: 'SHA256',
        digits: 8,
        period: 60,
        counter: null,
        icon: null,
      },
    },
    {
      name: 'TOTP 无 issuer',
      draft: {
        type: 'totp',
        issuer: null,
        label: 'alice',
        secret: SECRET,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        counter: null,
        icon: null,
      },
    },
    {
      name: 'HOTP + counter',
      draft: {
        type: 'hotp',
        issuer: 'AWS',
        label: 'bob@example.com',
        secret: SECRET,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        counter: '5',
        icon: null,
      },
    },
    {
      name: 'HOTP counter="0"',
      draft: {
        type: 'hotp',
        issuer: null,
        label: 'svc',
        secret: SECRET,
        algorithm: 'SHA512',
        digits: 8,
        period: 30,
        counter: '0',
        icon: null,
      },
    },
    {
      name: 'B1: HOTP + 非默认 period=60（period 须保留）',
      draft: {
        type: 'hotp',
        issuer: 'AWS',
        label: 'bob@example.com',
        secret: SECRET,
        algorithm: 'SHA1',
        digits: 6,
        period: 60,
        counter: '5',
        icon: null,
      },
    },
    {
      name: 'label 含空格',
      draft: {
        type: 'totp',
        issuer: null,
        label: 'alice smith',
        secret: SECRET,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        counter: null,
        icon: null,
      },
    },
    {
      name: 'label 含冒号（无 issuer）',
      draft: {
        type: 'totp',
        issuer: null,
        label: 'alice:smith',
        secret: SECRET,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        counter: null,
        icon: null,
      },
    },
  ];

  it.each(drafts)('往返：$name', ({ draft }) => {
    const uri = buildOtpauthUri(draft);
    const reparsed = parseOtpauthUri(uri);
    expect(reparsed).toEqual(draft);
  });

  it('parse → build → parse 与首次 parse 一致', () => {
    const uri = `otpauth://totp/GitHub:alice%40example.com?secret=${SECRET}&issuer=GitHub&algorithm=SHA256&digits=8&period=60`;
    const first = parseOtpauthUri(uri);
    const rebuilt = buildOtpauthUri(first);
    const second = parseOtpauthUri(rebuilt);
    expect(second).toEqual(first);
  });
});

describe('parseOtpauthUri — 非法输入抛 EncodingError', () => {
  const valid = `otpauth://totp/alice?secret=${SECRET}`;

  it('非法 URL', () => {
    expect(() => parseOtpauthUri('not-a-url')).toThrow(EncodingError);
  });

  it('非 otpauth 协议', () => {
    expect(() => parseOtpauthUri(`https://totp/alice?secret=${SECRET}`)).toThrow(EncodingError);
  });

  it('非 totp/hotp 类型', () => {
    expect(() => parseOtpauthUri(`otpauth://steam/alice?secret=${SECRET}`)).toThrow(EncodingError);
  });

  it('缺 secret', () => {
    expect(() => parseOtpauthUri('otpauth://totp/alice?issuer=A')).toThrow(EncodingError);
  });

  it('secret 非法 base32（含 1）', () => {
    expect(() => parseOtpauthUri('otpauth://totp/alice?secret=1234')).toThrow(EncodingError);
  });

  it('secret 空串', () => {
    expect(() => parseOtpauthUri('otpauth://totp/alice?secret=')).toThrow(EncodingError);
  });

  it('非法 algorithm', () => {
    expect(() => parseOtpauthUri(`${valid}&algorithm=MD5`)).toThrow(EncodingError);
  });

  it('非法 digits（7）', () => {
    expect(() => parseOtpauthUri(`${valid}&digits=7`)).toThrow(EncodingError);
  });

  it('非法 digits（非数字）', () => {
    expect(() => parseOtpauthUri(`${valid}&digits=abc`)).toThrow(EncodingError);
  });

  it('非法 period（0）', () => {
    expect(() => parseOtpauthUri(`${valid}&period=0`)).toThrow(EncodingError);
  });

  it('非法 period（非整数）', () => {
    expect(() => parseOtpauthUri(`${valid}&period=30.5`)).toThrow(EncodingError);
  });

  it('非法 counter（负数）', () => {
    expect(() => parseOtpauthUri(`otpauth://hotp/alice?secret=${SECRET}&counter=-1`)).toThrow(
      EncodingError,
    );
  });

  it('非法 counter（非数字）', () => {
    expect(() => parseOtpauthUri(`otpauth://hotp/alice?secret=${SECRET}&counter=abc`)).toThrow(
      EncodingError,
    );
  });

  it('label 非法百分号编码（%ZZ）', () => {
    expect(() => parseOtpauthUri(`otpauth://totp/%ZZ?secret=${SECRET}`)).toThrow(EncodingError);
  });

  it('错误均为 EncodingError 实例（非字符串抛出）', () => {
    try {
      parseOtpauthUri('otpauth://steam/x?secret=' + SECRET);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EncodingError);
    }
  });
});
