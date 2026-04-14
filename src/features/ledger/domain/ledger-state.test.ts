import { describe, expect, it } from 'vitest'
import {
  getRemainingTransactionDebtCents,
  reconcileReceivableExpenseItems,
  summarizePairLedger,
  type LedgerLog,
} from './ledger-state'

describe('summarizePairLedger', () => {
  it('把後續收到的預付款先沖掉既有消費欠款，剩餘才算預付餘額', () => {
    const logs: LedgerLog[] = [
      { fromUserId: 'alice', toUserId: 'bob', amountCents: 10_000, type: 'EXPENSE_DEBT' },
      { fromUserId: 'alice', toUserId: 'bob', amountCents: 10_000, type: 'SETTLEMENT' },
      { fromUserId: 'alice', toUserId: 'bob', amountCents: 5_000, type: 'PREPAYMENT' },
    ]

    expect(summarizePairLedger({ userId: 'alice', peerId: 'bob', logs })).toEqual({
      expenseBalanceCents: 0,
      myPrepaymentBalanceCents: 5_000,
      peerPrepaymentBalanceCents: 0,
      iOweCents: 0,
      theyOweMeCents: 0,
      effectiveNetCents: 5_000,
    })
  })
})

describe('reconcileReceivableExpenseItems', () => {
  it('會把未指定交易的還款依序分配，避免交易明細持續顯示已還款按鈕', () => {
    const logs: LedgerLog[] = [
      {
        id: 'debt-1',
        fromUserId: 'alice',
        toUserId: 'bob',
        amountCents: 10_000,
        type: 'EXPENSE_DEBT',
        transactionId: 'tx-1',
      },
      {
        id: 'debt-2',
        fromUserId: 'alice',
        toUserId: 'bob',
        amountCents: 8_000,
        type: 'EXPENSE_DEBT',
        transactionId: 'tx-2',
      },
      {
        fromUserId: 'alice',
        toUserId: 'bob',
        amountCents: 10_000,
        type: 'SETTLEMENT',
      },
    ]

    expect(
      reconcileReceivableExpenseItems({
        debtorId: 'alice',
        creditorId: 'bob',
        logs,
      }),
    ).toEqual([
      {
        debtLogId: 'debt-2',
        transactionId: 'tx-2',
        originalCents: 8_000,
        remainingCents: 8_000,
      },
    ])
  })
})

describe('getRemainingTransactionDebtCents', () => {
  it('會回傳某筆交易目前剩餘待還金額', () => {
    const logs: LedgerLog[] = [
      {
        id: 'debt-1',
        fromUserId: 'alice',
        toUserId: 'bob',
        amountCents: 10_000,
        type: 'EXPENSE_DEBT',
        transactionId: 'tx-1',
      },
      {
        fromUserId: 'alice',
        toUserId: 'bob',
        amountCents: 4_000,
        type: 'SETTLEMENT',
        transactionId: 'tx-1',
      },
      {
        fromUserId: 'alice',
        toUserId: 'bob',
        amountCents: 6_000,
        type: 'SETTLEMENT',
      },
    ]

    expect(
      getRemainingTransactionDebtCents({
        debtorId: 'alice',
        creditorId: 'bob',
        transactionId: 'tx-1',
        logs,
      }),
    ).toBe(0)
  })
})
