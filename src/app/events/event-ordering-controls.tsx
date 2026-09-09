'use client'

import { useState } from 'react'
import { setDiningEventOrderingAction } from '#/features/auth/actions'
import { formatOrderDeadline, taipeiDeadlineInput, toTaipeiDateTimeInput } from '#/features/ledger/domain/event-ordering'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export function EventOrderingControls({ event, isClosed, disabled, onChanged }: {
  event: { id: string; payerId: string; currentUserId: string | null; status: string; orderDeadline: string | null; updatedAt: string }
  isClosed: boolean
  disabled: boolean
  onChanged: () => void
}) {
  const [deadline, setDeadline] = useState(event.orderDeadline ? toTaipeiDateTimeInput(event.orderDeadline) : '')
  const [limited, setLimited] = useState(Boolean(event.orderDeadline))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canManage = event.currentUserId === event.payerId && event.status === 'DRAFT'

  async function submit(mode: 'close' | 'open') {
    setError(null)
    setPending(true)
    try {
      const result = await setDiningEventOrderingAction({
        eventId: event.id,
        expectedUpdatedAt: event.updatedAt,
        mode,
        orderDeadline: mode === 'open' && limited ? taipeiDeadlineInput(deadline) : null,
      })
      if (!result.ok) setError(result.message)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法更新收單設定')
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-label="收單設定" className="space-y-3 rounded-xl border border-[color:var(--line)] p-4">
      <p className="font-medium">{event.status === 'FINALIZED' ? '已結算' : isClosed ? '已結單' : '收單中'}</p>
      <p className="text-sm text-muted-foreground">
        {event.orderDeadline ? `結單時間：${formatOrderDeadline(event.orderDeadline)}` : '未設定結單時間'}
      </p>
      {isClosed && event.status !== 'FINALIZED' && <p className="text-sm text-muted-foreground">參加者不能新增、修改或刪除品項。付款人仍可調整品項或重新開放。</p>}
      {canManage && (
        <div className="space-y-3">
          <Label htmlFor="ordering-mode">開放方式</Label>
          <select id="ordering-mode" className="h-11 w-full rounded-md border bg-background px-3" value={limited ? 'limited' : 'unlimited'} onChange={(e) => setLimited(e.target.value === 'limited')} disabled={pending || disabled}>
            <option value="limited">設定結單時間</option>
            <option value="unlimited">持續開放，之後手動結單</option>
          </select>
          {limited && <div className="space-y-2">
            <Label htmlFor="order-deadline">結單時間（台北時間 UTC+8）</Label>
            <Input id="order-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={pending || disabled} />
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || disabled} onClick={() => void submit('open')}>{isClosed ? '重新開放' : '儲存收單設定'}</Button>
            {!isClosed && <Button type="button" variant="outline" disabled={pending || disabled} onClick={() => void submit('close')}>立即結單</Button>}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
