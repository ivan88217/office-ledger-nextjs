'use client'

import { taipeiDeadlineInput } from '#/features/ledger/domain/event-ordering'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { createDiningEventAction } from '#/features/auth/actions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'

type SelectUser = { id: string; username: string }

export function NewDiningEventForm({
  users,
  currentUserId,
}: {
  users: SelectUser[]
  currentUserId: string | null
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [payerId, setPayerId] = useState(currentUserId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (users.length && !payerId) {
      setPayerId(users.find((user) => user.id === currentUserId)?.id ?? users[0].id)
    }
  }, [users, payerId, currentUserId])

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      let orderDeadline: string | null = null
      try {
        if (payerId === currentUserId && deadline) orderDeadline = taipeiDeadlineInput(deadline)
      } catch (err) {
        setError(err instanceof Error ? err.message : '請輸入有效結單時間')
        return
      }
      const response = await createDiningEventAction({ title, payerId, orderDeadline })
      if (!response.ok) {
        setError(response.message)
        return
      }
      router.push(`/events/${response.data.eventId}`)
      router.refresh()
    })
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:space-y-8 sm:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">建立活動</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          先建立聚餐活動，再到活動內逐筆記錄餐點、合點對象與服務費。
        </p>
      </div>

      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
        <CardHeader>
          <CardTitle>活動資訊</CardTitle>
          <CardDescription>活動建立後仍可編輯，結算後才會寫入正式帳務。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="title">活動名稱</Label>
              <Input
                id="title"
                className="h-12"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：週五聚餐"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>統一付款人</Label>
              <Select value={payerId} onValueChange={setPayerId}>
                <SelectTrigger className="h-12 w-full">
                  <SelectValue placeholder="選擇付款人" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {payerId === currentUserId && <div className="space-y-2">
              <Label htmlFor="new-deadline">結單時間（選填，台北時間 UTC+8）</Label>
              <Input id="new-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <p className="text-sm text-muted-foreground">留白則持續開放，可由付款人稍後手動結單。</p>
            </div>}

            <Button
              type="submit"
              className="h-11 w-full rounded-lg bg-[color:var(--sea-ink)] text-white hover:bg-[color:var(--lagoon-deep)] dark:bg-[color:var(--lagoon)] dark:text-[color:var(--primary-foreground)] dark:hover:bg-[color:var(--lagoon-deep)]"
              disabled={isPending}
            >
              {isPending ? '建立中…' : '建立活動'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
