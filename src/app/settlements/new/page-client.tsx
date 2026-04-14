'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSettlementEntryAction, getPeerLedgerAction } from '#/features/auth/actions'
import { formatTwd } from '#/lib/money/amount'
import { yuanToCents } from '#/lib/money/dollars'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'

export function NewSettlementForm({
  users,
  currentUserId,
}: {
  users: { id: string; username: string }[]
  currentUserId: string | null
}) {
  const router = useRouter()
  const others = users.filter((user) => user.id !== currentUserId)

  const [toUserId, setToUserId] = useState('')
  const [amountYuan, setAmountYuan] = useState('')
  const [maxOweCents, setMaxOweCents] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (others.length && !toUserId) {
      setToUserId(others[0].id)
    }
  }, [others, toUserId])

  useEffect(() => {
    if (!toUserId) {
      setMaxOweCents(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const data = await getPeerLedgerAction({ peerId: toUserId })
        if (cancelled) return
        setMaxOweCents(data.expenseCents < 0 ? -data.expenseCents : 0)
      } catch {
        if (!cancelled) setMaxOweCents(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toUserId])

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const yuan = Number(amountYuan)
        if (!Number.isInteger(yuan) || yuan <= 0) throw new Error('請輸入正整數金額（元）')
        const cents = yuanToCents(yuan)
        if (maxOweCents !== null && cents > maxOweCents) {
          throw new Error('還款金額不可超過目前消費欠款')
        }
        await createSettlementEntryAction({ toUserId, amountCents: cents })
        router.push('/')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : '建立失敗')
      }
    })
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">還款</h1>
        <p className="mt-1 text-sm text-muted-foreground">僅能償還消費欠款，且不可超過目前欠款餘額。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>入帳</CardTitle>
          <CardDescription>還款對象為你欠消費款的同事</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {others.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無其他使用者可選。</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>還款對象</Label>
                  <Select value={toUserId} onValueChange={setToUserId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="選擇同事" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">金額（元）</Label>
                  <Input
                    id="amount"
                    inputMode="numeric"
                    value={amountYuan}
                    onChange={(event) => setAmountYuan(event.target.value)}
                    required
                  />
                  {maxOweCents !== null ? (
                    <p className="text-xs text-muted-foreground">目前可還上限：{formatTwd(maxOweCents)}</p>
                  ) : null}
                </div>

                <Button type="submit" className="w-full" disabled={isPending || maxOweCents === 0}>
                  {isPending ? '處理中…' : '確認還款'}
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
