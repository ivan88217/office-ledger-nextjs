'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  confirmPrepaymentRequestAction,
  createPrepaymentRefundRequestAction,
  recordPeerRefundToMeAction,
  reverseSettlementLogAction,
  settlePeerExpenseItemAction,
} from '#/features/auth/actions'
import { paymentTypeLabel } from '#/features/ledger/type-label'
import { formatTwd } from '#/lib/money/amount'
import { yuanToCents } from '#/lib/money/dollars'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export function PeerLedgerClient({
  data,
}: {
  data: Awaited<ReturnType<typeof import('#/features/auth/auth.service').getPeerLedger>>
}) {
  const router = useRouter()
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [settlementError, setSettlementError] = useState<string | null>(null)
  const [requestRefundYuan, setRequestRefundYuan] = useState('')
  const [recordRefundYuan, setRecordRefundYuan] = useState('')
  const [pendingConfirmId, setPendingConfirmId] = useState<string | null>(null)
  const [pendingDebtLogId, setPendingDebtLogId] = useState<string | null>(null)
  const [refundActionPending, setRefundActionPending] = useState<null | 'request' | 'record'>(null)
  const [pendingReverseLogId, setPendingReverseLogId] = useState<string | null>(null)
  const [reverseError, setReverseError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function refresh() {
    router.refresh()
  }

  function onConfirm(requestId: string) {
    setConfirmError(null)
    setPendingConfirmId(requestId)
    startTransition(async () => {
      try {
        const result = await confirmPrepaymentRequestAction({ requestId, peerId: data.peer.id })
        if (!result.ok) {
          setConfirmError(result.message)
          return
        }
        refresh()
      } finally {
        setPendingConfirmId(null)
      }
    })
  }

  function onRequestRefund(event: React.FormEvent) {
    event.preventDefault()
    setRefundError(null)
    setRefundActionPending('request')
    startTransition(async () => {
      try {
        const yuan = Number(requestRefundYuan)
        if (!Number.isInteger(yuan) || yuan <= 0) {
          setRefundError('請輸入正整數金額（元）')
          return
        }
        const result = await createPrepaymentRefundRequestAction({
          peerUserId: data.peer.id,
          amountCents: yuanToCents(yuan),
        })
        if (!result.ok) {
          setRefundError(result.message)
          return
        }
        setRequestRefundYuan('')
        refresh()
      } finally {
        setRefundActionPending(null)
      }
    })
  }

  function onRecordRefund(event: React.FormEvent) {
    event.preventDefault()
    setRefundError(null)
    setRefundActionPending('record')
    startTransition(async () => {
      try {
        const yuan = Number(recordRefundYuan)
        if (!Number.isInteger(yuan) || yuan <= 0) {
          setRefundError('請輸入正整數金額（元）')
          return
        }
        const result = await recordPeerRefundToMeAction({
          peerUserId: data.peer.id,
          amountCents: yuanToCents(yuan),
        })
        if (!result.ok) {
          setRefundError(result.message)
          return
        }
        setRecordRefundYuan('')
        refresh()
      } finally {
        setRefundActionPending(null)
      }
    })
  }

  function onReverseSettlement(logId: string) {
    if (!globalThis.confirm('確定要沖銷這筆銷帳紀錄嗎？欠款會恢復為未結清狀態。')) return
    setReverseError(null)
    setPendingReverseLogId(logId)
    startTransition(async () => {
      try {
        const result = await reverseSettlementLogAction({ logId, peerUserId: data.peer.id })
        if (!result.ok) {
          setReverseError(result.message)
          return
        }
        refresh()
      } finally {
        setPendingReverseLogId(null)
      }
    })
  }

  function onSettleExpenseItem(debtLogId: string) {
    setSettlementError(null)
    setPendingDebtLogId(debtLogId)
    startTransition(async () => {
      try {
        const result = await settlePeerExpenseItemAction({ peerUserId: data.peer.id, debtLogId })
        if (!result.ok) {
          setSettlementError(result.message)
          return
        }
        refresh()
      } finally {
        setPendingDebtLogId(null)
      }
    })
  }

  return (
    <>
      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
        <CardHeader>
          <CardTitle>目前關係</CardTitle>
          <CardDescription>與列表一致的四個指標</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-3">
              <p className="text-xs text-muted-foreground">我欠他</p>
              <p className="text-lg font-semibold tabular-nums">{formatTwd(data.iOweCents)}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-3">
              <p className="text-xs text-muted-foreground">他欠我</p>
              <p className="text-lg font-semibold tabular-nums">{formatTwd(data.theyOweMeCents)}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-3">
              <p className="text-xs text-muted-foreground">我在他那邊的預付餘額</p>
              <p className="text-lg font-semibold tabular-nums">{formatTwd(data.myPrepaymentBalanceCents)}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-3">
              <p className="text-xs text-muted-foreground">他在我這的預付餘額</p>
              <p className="text-lg font-semibold tabular-nums">{formatTwd(data.peerPrepaymentBalanceCents)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <CardTitle>他欠我的款項</CardTitle>
            <CardDescription>我代墊的每筆尚未收回金額，可逐筆銷帳</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {settlementError ? (
              <Alert variant="destructive">
                <AlertDescription>{settlementError}</AlertDescription>
              </Alert>
            ) : null}
            {data.receivableExpenseItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">目前沒有待銷帳款項。</p>
            ) : (
              data.receivableExpenseItems.map((item) => (
                <div key={item.debtLogId} className="flex flex-col gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium tabular-nums">{formatTwd(item.remainingCents)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.transactionId ? (
                        <Link href={`/transactions/${item.transactionId}`} className="text-primary hover:underline">
                          {item.transactionTitle ?? '交易'}
                        </Link>
                      ) : (
                        '交易'
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-10 w-full sm:w-auto"
                    onClick={() => onSettleExpenseItem(item.debtLogId)}
                    disabled={pendingDebtLogId === item.debtLogId}
                  >
                    {pendingDebtLogId === item.debtLogId ? '銷帳中…' : '已還款'}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <CardTitle>我欠他的款項</CardTitle>
            <CardDescription>對方代墊的每筆尚未還清金額（僅供檢視）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.payableExpenseItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">目前沒有欠對方的款項。</p>
            ) : (
              data.payableExpenseItems.map((item) => (
                <div key={item.debtLogId} className="flex flex-col gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium tabular-nums">{formatTwd(item.remainingCents)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.transactionId ? (
                        <Link href={`/transactions/${item.transactionId}`} className="text-primary hover:underline">
                          {item.transactionTitle ?? '交易'}
                        </Link>
                      ) : (
                        '交易'
                      )}
                    </p>
                  </div>
                  {item.originalCents !== item.remainingCents ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      原 {formatTwd(item.originalCents)}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
        <CardHeader>
          <CardTitle>實際關係（含預付）</CardTitle>
          <CardDescription>已把預付影響納入後的最終欠款方向</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm tabular-nums">
            {data.effectiveNetCents > 0
              ? `對方欠我 ${formatTwd(data.effectiveNetCents)}`
              : data.effectiveNetCents < 0
                ? `我欠對方 ${formatTwd(-data.effectiveNetCents)}`
                : '已平'}
          </p>
        </CardContent>
      </Card>

      {data.pendingIncomingPrepayments.length > 0 ? (
        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <CardTitle>待你確認的預付款</CardTitle>
            <CardDescription>對方送出的預付，確認後才會正式入帳</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {confirmError ? (
              <Alert variant="destructive">
                <AlertDescription>{confirmError}</AlertDescription>
              </Alert>
            ) : null}
            {data.pendingIncomingPrepayments.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6">
                  {request.kind === 'PREPAYMENT' ? '對方預付給你' : '對方要求你返還預付款'}{' '}
                  <span className="font-medium tabular-nums">{formatTwd(request.amountCents)}</span>
                </p>
                <Button
                  size="sm"
                  className="h-10 w-full sm:w-auto"
                  onClick={() => onConfirm(request.id)}
                  disabled={pendingConfirmId === request.id}
                >
                  {pendingConfirmId === request.id ? '確認中…' : '確認'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <CardTitle>請對方返還預付款</CardTitle>
            <CardDescription>目前可申請返還上限：{formatTwd(data.peerPrepaymentAvailableToRefundCents)}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onRequestRefund} className="space-y-3">
              <Input
                className="h-12"
                inputMode="numeric"
                value={requestRefundYuan}
                onChange={(event) => setRequestRefundYuan(event.target.value)}
                placeholder="金額（元）"
              />
              <Button className="h-11 w-full sm:w-auto" type="submit" disabled={refundActionPending === 'request'}>
                {refundActionPending === 'request' ? '送出中…' : '送出返還請求'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <CardTitle>直接紀錄對方返還</CardTitle>
            <CardDescription>當對方已經把預付款返還給你時可直接入帳。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onRecordRefund} className="space-y-3">
              <Input
                className="h-12"
                inputMode="numeric"
                value={recordRefundYuan}
                onChange={(event) => setRecordRefundYuan(event.target.value)}
                placeholder="金額（元）"
              />
              <Button className="h-11 w-full sm:w-auto" type="submit" disabled={refundActionPending === 'record'}>
                {refundActionPending === 'record' ? '入帳中…' : '確認返還'}
              </Button>
            </form>
            {refundError ? (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{refundError}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
        <CardHeader>
          <CardTitle>往來紀錄</CardTitle>
          <CardDescription>銷帳紀錄如按錯可按「沖銷」還原</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reverseError ? (
            <Alert variant="destructive">
              <AlertDescription>{reverseError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-3 md:hidden">
            {data.logs.map((log) => {
              const canReverse =
                log.type === 'SETTLEMENT' &&
                log.note !== '預付款沖抵消費欠款' &&
                !log.isReversed
              return (
                <div key={log.id} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">{paymentTypeLabel(log.type)}</Badge>
                    <span className="font-semibold tabular-nums">{formatTwd(log.amountCents)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{log.note ?? '—'}</p>
                  {log.transactionId ? (
                    <Link href={`/transactions/${log.transactionId}`} className="mt-2 inline-block text-sm text-primary">
                      {log.transactionTitle ?? '交易'}
                    </Link>
                  ) : null}
                  {canReverse ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-3 h-10 w-full"
                      onClick={() => onReverseSettlement(log.id)}
                      disabled={pendingReverseLogId === log.id}
                    >
                      {pendingReverseLogId === log.id ? '沖銷中…' : '沖銷'}
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
          <Table className="responsive-table">
            <TableHeader>
              <TableRow>
                <TableHead>類型</TableHead>
                <TableHead>說明</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.logs.map((log) => {
                const canReverse =
                  log.type === 'SETTLEMENT' &&
                  log.note !== '預付款沖抵消費欠款' &&
                  !log.isReversed
                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="secondary">{paymentTypeLabel(log.type)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.note ?? '—'}
                      {log.transactionId ? (
                        <>
                          {' · '}
                          <Link href={`/transactions/${log.transactionId}`} className="text-primary hover:underline">
                            {log.transactionTitle ?? '交易'}
                          </Link>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTwd(log.amountCents)}</TableCell>
                    <TableCell className="text-right">
                      {canReverse ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onReverseSettlement(log.id)}
                          disabled={pendingReverseLogId === log.id}
                        >
                          {pendingReverseLogId === log.id ? '沖銷中…' : '沖銷'}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
