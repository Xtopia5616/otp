// tests/fixtures/argon2id-test-params.ts — Argon2id 测试专用极小参数 (Testing §2.2)
// ⚠️ 这些参数安全性极低，仅用于加速测试，绝不可用于生产。
// 生产参数见 Architecture §3.3：m=65536, t=3, p=4。
//
// 注：Testing §2.2 原始形状混用了 hash-wasm 字段名（memorySize/hashLength）与嵌入的 salt。
// 本 fixture 采用 KdfParams 形状（algo/memoryKiB/iterations/parallelism），与 deriveKEK 的
// 参数类型直接匹配；salt 由调用方传入（路径隔离测试需要不同盐），hashLength 固定 32 由原语内部处理。
import type { KdfParams } from '$lib/models/api';

export const ARGON2ID_TEST_PARAMS: KdfParams = {
  algo: 'argon2id',
  memoryKiB: 4096, // 生产: 65536
  iterations: 1, // 生产: 3
  parallelism: 1, // 生产: 4
};
