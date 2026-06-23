// src/lib/models/ui.ts — 组件 Props 类型 (UIInventory 附录 A)
// 纯类型层；跨文件 import 均为 import type。

import type { Account } from './account';

/** OtpCodeDisplay Props */
export interface OtpCodeDisplayProps {
  account: Account;
}

/** AccountItem Props */
export interface AccountItemProps {
  account: Account;
  onCopy: () => void;
  onEdit: () => void;
}

/** AccountEditDialog Props */
export interface AccountEditDialogProps {
  account: Account;
  open: boolean;
  onClose: () => void;
}

/** AddAccountDialog Props */
export interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

/** ClockDriftWarning Props */
export interface ClockDriftWarningProps {
  driftSeconds: number;
}

/** RecoveryKeyDisplay Props */
export interface RecoveryKeyDisplayProps {
  /** 20 字符 base32 大写 RK，仅注册/恢复后一次性传入 */
  recoveryKey: string;
  /** 用户确认抄写正确后的回调 */
  onConfirmed: () => void;
}

/** ExportDialog Props */
export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

/** SensitiveInput Props */
export interface SensitiveInputProps {
  label: string;
  placeholder?: string;
  /** 提交回调，传入明文值 */
  onSubmit: (value: string) => void;
  autoClear?: boolean;
  toggleable?: boolean;
  disabled?: boolean;
  error?: string;
}
