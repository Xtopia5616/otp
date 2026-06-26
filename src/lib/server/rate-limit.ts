// src/lib/server/rate-limit.ts — 限流 (Design §5.4 / Architecture §8.5, task 4.12)
// recover/init、recover/reset 端点的 IP + email 双维度指数冷却限流；返回 Retry-After。
// 默认内存 Map+TTL；serverless 多实例下不可靠，须以 LimitStore 接口注入 DB/Redis 实现。
import '$server-only';

/** 限流条目（每维度一行）。 */
interface LimitEntry {
  /** 当前窗口内已消耗次数。 */
  count: number;
  /** 当前窗口起点（ms）。窗口过期则重置 count。 */
  windowStart: number;
  /** 累计被拦截次数（指数退避阶数）。 */
  blockCount: number;
  /** 拦截解除时刻（ms epoch）；now < blockedUntil 即被拦截。 */
  blockedUntil: number;
}

/** 可注入的限流存储接口（默认内存实现；生产换 DB/Redis，Design §5.4）。 */
export interface LimitStore {
  get(key: string): Promise<LimitEntry | undefined>;
  set(key: string, entry: LimitEntry, ttlMs: number): Promise<void>;
}

/** 内存 Map + TTL 实现（单实例；serverless 多实例不可靠，见类注释）。 */
class MemoryLimitStore implements LimitStore {
  // ⚠️ 单实例内存存储：serverless 多实例下各实例计数独立、限流失效。
  // 生产应注入 DB/Redis 实现（如 Upstash Redis with TTL）。
  private map = new Map<string, { entry: LimitEntry; expires: number }>();

  get(key: string): Promise<LimitEntry | undefined> {
    const slot = this.map.get(key);
    if (!slot) return Promise.resolve(undefined);
    if (Date.now() > slot.expires) {
      this.map.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(slot.entry);
  }

  set(key: string, entry: LimitEntry, ttlMs: number): Promise<void> {
    this.map.set(key, { entry, expires: Date.now() + ttlMs });
    return Promise.resolve();
  }
}

/** 限流配置（可注入 store 与阈值）。 */
export interface RateLimitConfig {
  store: LimitStore;
  /** 窗口内最大允许次数（默认 5）。 */
  maxAttempts: number;
  /** 统计窗口（ms，默认 60s）。 */
  windowMs: number;
  /** 基础冷却秒数（首次拦截，默认 2）。 */
  baseCooldownSec: number;
  /** 冷却上限秒数（默认 1 小时）。 */
  maxCooldownSec: number;
}

/** 默认配置（内存 store + 标准阈值）。 */
const defaultConfig: RateLimitConfig = {
  store: new MemoryLimitStore(),
  maxAttempts: 5,
  windowMs: 60_000,
  baseCooldownSec: 2,
  maxCooldownSec: 3_600,
};

let activeConfig: RateLimitConfig = defaultConfig;

/** 注入限流配置（生产换 DB/Redis store 或调整阈值）。 */
export function configureRateLimit(config: Partial<RateLimitConfig>): void {
  activeConfig = { ...defaultConfig, ...config };
}

/** 维度键。IP 与 email 各一行，互不影响（双维度：任一被拦即拒）。 */
const keyFor = (action: string, dim: 'ip' | 'email', value: string) => `${action}:${dim}:${value}`;

/** 计算第 blockCount 次拦截的冷却秒数（指数退避，封顶 maxCooldownSec）。 */
function cooldownSec(blockCount: number, cfg: RateLimitConfig): number {
  const sec = cfg.baseCooldownSec * 2 ** (blockCount - 1);
  return Math.min(sec, cfg.maxCooldownSec);
}

/**
 * 检查并消耗一次额度（IP + email 双维度，Architecture §8.5）。
 * 任一维度被拦 → allowed=false + retryAfter（两者取大）；否则消耗两维度并 allowed=true。
 * 超过 maxAttempts 触发指数冷却：blockedUntil = now + base*2^(blockCount-1)，封顶。
 */
export async function checkAndConsume(input: {
  ip: string;
  email: string;
  action: string;
}): Promise<{ allowed: boolean; retryAfter: number }> {
  const cfg = activeConfig;
  const now = Date.now();
  const dims = [keyFor(input.action, 'ip', input.ip), keyFor(input.action, 'email', input.email)];

  // 1. 先查两维度是否正处于拦截期
  let blockedRetryAfter = 0;
  for (const k of dims) {
    const entry = await cfg.store.get(k);
    if (entry && now < entry.blockedUntil) {
      const wait = Math.ceil((entry.blockedUntil - now) / 1000);
      blockedRetryAfter = Math.max(blockedRetryAfter, wait);
    }
  }
  if (blockedRetryAfter > 0) {
    return { allowed: false, retryAfter: blockedRetryAfter };
  }

  // 2. 未被拦：消耗两维度
  let consumeRetryAfter = 0;
  for (const k of dims) {
    let entry = await cfg.store.get(k);
    if (!entry || now - entry.windowStart >= cfg.windowMs) {
      entry = { count: 0, windowStart: now, blockCount: entry?.blockCount ?? 0, blockedUntil: 0 };
    }
    entry.count += 1;

    if (entry.count > cfg.maxAttempts) {
      // 超额 → 指数冷却
      entry.blockCount += 1;
      const cd = cooldownSec(entry.blockCount, cfg);
      entry.blockedUntil = now + cd * 1000;
      entry.count = 0; // 重置窗口计数，下一窗口从 0 起
      consumeRetryAfter = Math.max(consumeRetryAfter, cd);
    }

    // TTL 取窗口与冷却的较大者 + 缓冲，确保拦截期不被提前回收
    const ttl = Math.max(cfg.windowMs, consumeRetryAfter * 1000) + 1000;
    await cfg.store.set(k, entry, ttl);
  }

  return { allowed: consumeRetryAfter === 0, retryAfter: consumeRetryAfter };
}

/** 仅供测试重置状态（注入空 store）。 */
export function __resetForTest(store?: LimitStore): void {
  activeConfig = { ...defaultConfig, store: store ?? new MemoryLimitStore() };
}
