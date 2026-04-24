'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPrepaymentEntryAction } from '#/features/auth/actions'
import { yuanToCents } from '#/lib/money/dollars'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'

export function NewPrepaymentForm({
  users,
  currentUserId,
}: {
  users: { id: string; username: string }[]
  currentUserId: string | null
}) {
  const router = useRouter()
  const others = users.filter((user) => user.id !== currentUserId)

  const [direction, setDirection] = useState<'PAYER_TO_RECEIVER' | 'RECEIVER_RECORDS_PAYER'>(
    'PAYER_TO_RECEIVER',
  )
  const [peerUserId, setPeerUserId] = useState('')
  const [amountYuan, setAmountYuan] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (others.length && !peerUserId) {
      setPeerUserId(others[0].id)
    }
  }, [others, peerUserId])

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    startTransition(async () => {
      const yuan = Number(amountYuan)
      if (!Number.isInteger(yuan) || yuan <= 0) {
        setError('請輸入正整數金額（元）')
        return
      }

      const result = await createPrepaymentEntryAction({
        direction,
        peerUserId,
        amountCents: yuanToCents(yuan),
      })

      if (!result.ok) {
        setError(result.message)
        return
      }

      if (result.data.requiresConfirmation) {
        setNotice('已送出待對方確認，對方確認後才會正式入帳。')
      } else {
        router.push('/')
      }
      router.refresh()
    })
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-6 sm:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">預付款</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          可由預付方送出，或由接收方代填；預付方送出需接收方確認後才生效。
        </p>
      </div>

      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
        <CardHeader>
          <CardTitle>入帳</CardTitle>
          <CardDescription>預付對象不可為自己</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {notice ? (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            ) : null}

            {others.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無其他使用者可選，請先建立同事。</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>填寫身份</Label>
                  <Select
                    value={direction}
                    onValueChange={(value: 'PAYER_TO_RECEIVER' | 'RECEIVER_RECORDS_PAYER') =>
                      setDirection(value)
                    }
                  >
                    <SelectTrigger className="h-12 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PAYER_TO_RECEIVER">我是預付方（對方需確認）</SelectItem>
                      <SelectItem value="RECEIVER_RECORDS_PAYER">我是接收方（立即入帳）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{direction === 'PAYER_TO_RECEIVER' ? '我預付給' : '誰預付給我'}</Label>
                  <Select value={peerUserId} onValueChange={setPeerUserId} required>
                    <SelectTrigger className="h-12 w-full">
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
                  <Label htmlFor="amount">金額（元，整數）</Label>
                  <Input
                    id="amount"
                    className="h-12"
                    inputMode="numeric"
                    value={amountYuan}
                    onChange={(event) => setAmountYuan(event.target.value)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? '處理中…' : direction === 'PAYER_TO_RECEIVER' ? '送出待確認' : '確認入帳'}
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
