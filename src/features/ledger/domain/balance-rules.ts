/**
 * V1 帳務不變式（文件化，供審查與測試對照）
 *
 * - expenseCents（以 user→peer 方向）：正數表示 peer 欠 user；負數表示 user 欠 peer。
 * - prepaymentCents：正數表示 user 已預付給 peer；對向 peer→user 為鏡像相反數。
 * - 消費入帳時先沖該有向邊上的預付款，再記剩餘 EXPENSE_DEBT。
 * - 還款僅減少「我欠對方」的消費債務，不允許超還；超還不會自動轉成預付款。
 */

export const V1_BALANCE_RULES_VERSION = 'v1' as const
