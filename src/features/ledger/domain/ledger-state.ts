export type LedgerLogType =
  | 'EXPENSE_DEBT'
  | 'EXPENSE_PREPAY_APPLY'
  | 'PREPAYMENT'
  | 'PREPAYMENT_REFUND'
  | 'SETTLEMENT'
  | 'ADJUSTMENT'

export type LedgerLog = {
  id?: string
  fromUserId: string
  toUserId: string
  amountCents: number
  type: LedgerLogType
  transactionId?: string | null
  createdAt?: Date | string
}

export type PairLedgerSummary = {
  expenseBalanceCents: number
  myPrepaymentBalanceCents: number
  peerPrepaymentBalanceCents: number
  iOweCents: number
  theyOweMeCents: number
  effectiveNetCents: number
}

export type ReceivableExpenseItem = {
  debtLogId: string
  transactionId: string | null
  originalCents: number
  remainingCents: number
}

function sortByCreatedAt(logs: LedgerLog[]): LedgerLog[] {
  return logs
    .map((log, index) => ({ log, index }))
    .sort((a, b) => {
      const aTime = a.log.createdAt ? new Date(a.log.createdAt).getTime() : Number.NaN
      const bTime = b.log.createdAt ? new Date(b.log.createdAt).getTime() : Number.NaN
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return aTime - bTime
      }
      return a.index - b.index
    })
    .map(({ log }) => log)
}

export function summarizePairLedger(params: {
  userId: string
  peerId: string
  logs: LedgerLog[]
}): PairLedgerSummary {
  const { userId, peerId, logs } = params

  // 分別追蹤雙向欠款：帳務上「我欠他」與「他欠我」屬於兩回事，
  // 不能在 summary 層就互相抵銷，否則會造成銷帳時誤判為超額。
  let iOweExpenseRawCents = 0
  let theyOweMeExpenseRawCents = 0
  let myPrepaymentBalanceCents = 0
  let peerPrepaymentBalanceCents = 0

  for (const log of logs) {
    const isForward = log.fromUserId === userId && log.toUserId === peerId
    const isReverse = log.fromUserId === peerId && log.toUserId === userId

    if (!isForward && !isReverse) continue

    if (isForward) {
      if (log.type === 'EXPENSE_DEBT') iOweExpenseRawCents += log.amountCents
      if (log.type === 'SETTLEMENT') iOweExpenseRawCents -= log.amountCents
      if (log.type === 'PREPAYMENT') myPrepaymentBalanceCents += log.amountCents
      if (log.type === 'EXPENSE_PREPAY_APPLY') myPrepaymentBalanceCents -= log.amountCents
      if (log.type === 'PREPAYMENT_REFUND') peerPrepaymentBalanceCents -= log.amountCents
      continue
    }

    if (log.type === 'EXPENSE_DEBT') theyOweMeExpenseRawCents += log.amountCents
    if (log.type === 'SETTLEMENT') theyOweMeExpenseRawCents -= log.amountCents
    if (log.type === 'PREPAYMENT') peerPrepaymentBalanceCents += log.amountCents
    if (log.type === 'EXPENSE_PREPAY_APPLY') peerPrepaymentBalanceCents -= log.amountCents
    if (log.type === 'PREPAYMENT_REFUND') myPrepaymentBalanceCents -= log.amountCents
  }

  const iOweRawCents = Math.max(0, iOweExpenseRawCents)
  const theyOweMeRawCents = Math.max(0, theyOweMeExpenseRawCents)
  const myPrepaymentRawCents = Math.max(0, myPrepaymentBalanceCents)
  const peerPrepaymentRawCents = Math.max(0, peerPrepaymentBalanceCents)

  return {
    expenseBalanceCents: theyOweMeRawCents - iOweRawCents,
    myPrepaymentBalanceCents: Math.max(0, myPrepaymentRawCents - iOweRawCents),
    peerPrepaymentBalanceCents: Math.max(0, peerPrepaymentRawCents - theyOweMeRawCents),
    iOweCents: Math.max(0, iOweRawCents - myPrepaymentRawCents),
    theyOweMeCents: Math.max(0, theyOweMeRawCents - peerPrepaymentRawCents),
    effectiveNetCents:
      theyOweMeRawCents - iOweRawCents + myPrepaymentRawCents - peerPrepaymentRawCents,
  }
}

export function reconcileReceivableExpenseItems(params: {
  debtorId: string
  creditorId: string
  logs: LedgerLog[]
}): ReceivableExpenseItem[] {
  const { debtorId, creditorId, logs } = params
  const receivableItems: ReceivableExpenseItem[] = []

  for (const log of sortByCreatedAt(logs)) {
    if (log.fromUserId !== debtorId || log.toUserId !== creditorId) continue
    if (!['EXPENSE_DEBT', 'EXPENSE_PREPAY_APPLY', 'SETTLEMENT'].includes(log.type)) continue

    if (log.type === 'EXPENSE_DEBT') {
      receivableItems.push({
        debtLogId: log.id ?? `${log.transactionId ?? 'no-tx'}-${receivableItems.length}`,
        transactionId: log.transactionId ?? null,
        originalCents: log.amountCents,
        remainingCents: log.amountCents,
      })
      continue
    }

    let remainingSettlementCents = log.amountCents

    if (log.transactionId) {
      for (const item of receivableItems) {
        if (remainingSettlementCents <= 0) break
        if (item.remainingCents <= 0) continue
        if (item.transactionId !== log.transactionId) continue
        const appliedCents = Math.min(item.remainingCents, remainingSettlementCents)
        item.remainingCents -= appliedCents
        remainingSettlementCents -= appliedCents
      }
    } else {
      const exactMatchItems = receivableItems.filter(
        (item) => item.remainingCents > 0 && item.remainingCents === remainingSettlementCents,
      )
      if (exactMatchItems.length === 1) {
        exactMatchItems[0].remainingCents = 0
        remainingSettlementCents = 0
      }
    }

    for (const item of receivableItems) {
      if (remainingSettlementCents <= 0) break
      if (item.remainingCents <= 0) continue
      const appliedCents = Math.min(item.remainingCents, remainingSettlementCents)
      item.remainingCents -= appliedCents
      remainingSettlementCents -= appliedCents
    }
  }

  return receivableItems.filter((item) => item.remainingCents > 0)
}

export function getRemainingTransactionDebtCents(params: {
  debtorId: string
  creditorId: string
  transactionId: string
  logs: LedgerLog[]
}): number {
  const { debtorId, creditorId, transactionId, logs } = params
  return reconcileReceivableExpenseItems({ debtorId, creditorId, logs })
    .filter((item) => item.transactionId === transactionId)
    .reduce((sum, item) => sum + item.remainingCents, 0)
}
