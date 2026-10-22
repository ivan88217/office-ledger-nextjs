import React, { type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PeerLedgerClient } from './page-client'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), reverse: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('#/features/auth/actions', () => ({
  confirmPrepaymentRequestAction: vi.fn(),
  createPrepaymentRefundRequestAction: vi.fn(),
  recordPeerRefundToMeAction: vi.fn(),
  reverseSettlementLogAction: mocks.reverse,
  settlePeerExpenseItemAction: vi.fn(),
}))

type LedgerData = ComponentProps<typeof PeerLedgerClient>['data']
type Log = LedgerData['logs'][number]
const makeLog = (overrides: Partial<Log> = {}): Log => ({
  id: 'debt', type: 'EXPENSE_DEBT', amountCents: 18000,
  createdAt: '2026-10-22T04:30:00.000Z', fromUserId: 'peer', toUserId: 'me',
  transactionId: 'lunch', transactionTitle: '午餐', note: null,
  reversesLogId: null, isReversed: false, ...overrides,
})
const makeData = (logs: Log[]): LedgerData => ({
  peer: { id: 'peer', username: '小陳' },
  expenseCents: 3000, prepaymentCents: 0, effectiveNetCents: 3000,
  iOweCents: 7000, theyOweMeCents: 10000,
  myPrepaymentBalanceCents: 0, peerPrepaymentBalanceCents: 0,
  pendingOutgoingRefundCents: 0, peerPrepaymentAvailableToRefundCents: 0,
  pendingIncomingPrepayments: [], receivableExpenseItems: [], payableExpenseItems: [], logs,
})

function ledgerViews() {
  const ledger = screen.getByText('往來紀錄').closest('[data-slot="card"]') as HTMLElement
  return {
    ledger: within(ledger),
    mobile: within(ledger.querySelector('.md\\:hidden') as HTMLElement),
    desktop: within(within(ledger).getByRole('table')),
  }
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe('個人往來紀錄', () => {
  it('手機與桌面直接描述雙向欠款及還款，保留歷史金額及台北時間', () => {
    render(<PeerLedgerClient data={makeData([
      makeLog({ id: 'received', type: 'SETTLEMENT', amountCents: 8000, createdAt: '2026-10-22T06:10:00.000Z' }),
      makeLog({ id: 'paid', type: 'SETTLEMENT', fromUserId: 'me', toUserId: 'peer', amountCents: 5000 }),
      makeLog(),
      makeLog({ id: 'owed', fromUserId: 'me', toUserId: 'peer', amountCents: 12000 }),
    ])} />)
    const { mobile, desktop } = ledgerViews()
    for (const view of [mobile, desktop]) {
      for (const title of ['小陳還我', '我還小陳', '小陳欠我', '我欠小陳']) {
        expect(view.getByText(title)).toBeTruthy()
      }
      expect(view.getByText('$180.00')).toBeTruthy()
      expect(view.getByText('$120.00')).toBeTruthy()
      expect(view.getByText('2026/10/22 14:10')).toBeTruthy()
    }
    expect(screen.getByText('$100.00')).toBeTruthy()
    expect(screen.getByText('$70.00')).toBeTruthy()
  })

  it('已沖銷及自動沖抵不提供沖銷按鈕，普通還款仍可用原本的操作', async () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    mocks.reverse.mockResolvedValue({ ok: true })
    render(<PeerLedgerClient data={makeData([
      makeLog({ id: 'valid', type: 'SETTLEMENT' }),
      makeLog({ id: 'reversed', type: 'SETTLEMENT', isReversed: true }),
      makeLog({ id: 'auto', type: 'SETTLEMENT', note: '預付款沖抵消費欠款' }),
      makeLog({ id: 'reversal', type: 'SETTLEMENT_REVERSAL', reversesLogId: 'reversed' }),
    ])} />)
    const { mobile, desktop } = ledgerViews()
    for (const view of [mobile, desktop]) {
      expect(view.getByText('已沖銷')).toBeTruthy()
      expect(view.getByText('小陳的預付款抵還欠款')).toBeTruthy()
      expect(view.getByText('撤銷小陳的還款紀錄')).toBeTruthy()
      expect(view.getByText('恢復小陳對我的欠款')).toBeTruthy()
      expect(view.getAllByRole('button', { name: '沖銷' })).toHaveLength(1)
    }
    await act(async () => { fireEvent.click(mobile.getByRole('button', { name: '沖銷' })) })
    expect(mocks.reverse).toHaveBeenCalledWith({ logId: 'valid', peerUserId: 'peer' })
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('保留交易連結與備註，無交易或備註的紀錄仍可辨識方向', () => {
    render(<PeerLedgerClient data={makeData([
      makeLog({ note: '兩份午餐' }),
      makeLog({ id: 'prepay', type: 'PREPAYMENT', transactionId: null, transactionTitle: null }),
    ])} />)
    const { mobile, desktop } = ledgerViews()
    for (const view of [mobile, desktop]) {
      expect(view.getByRole('link', { name: '午餐' }).getAttribute('href')).toBe('/transactions/lunch')
      expect(view.getByText('兩份午餐')).toBeTruthy()
      expect(view.getByText('小陳預付給我')).toBeTruthy()
    }
  })

  it('日期分隔字元固定，避免伺服器與瀏覽器 ICU 空白差異導致 hydration 不一致', () => {
    const prototype = Intl.DateTimeFormat.prototype
    const original = Object.getOwnPropertyDescriptor(prototype, 'format')!
    Object.defineProperty(prototype, 'format', {
      ...original, get: () => () => '2026/10/22\u200914:10',
    })
    try {
      render(<PeerLedgerClient data={makeData([
        makeLog({ createdAt: '2026-10-22T06:10:00.000Z' }),
      ])} />)
      const { mobile, desktop } = ledgerViews()
      for (const view of [mobile, desktop]) {
        expect(view.getByText('2026/10/22 14:10', { exact: true, normalizer: (text) => text })).toBeTruthy()
      }
    } finally {
      Object.defineProperty(prototype, 'format', original)
    }
  })
})
