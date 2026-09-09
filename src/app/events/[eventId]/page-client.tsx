'use client'

import Link from 'next/link'
import { EventOrderingControls } from '#/app/events/event-ordering-controls'
import { canEditEventItems, isOrderingClosed } from '#/features/ledger/domain/event-ordering'
import { Check, Copy, Maximize2, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addDiningEventItemAction,
  deleteDiningEventAction,
  finalizeDiningEventAction,
  updateDiningEventAction,
} from '#/features/auth/actions'
import { computeDiningEventAllocation } from '#/features/ledger/domain/dining-event'
import { formatTwd } from '#/lib/money/amount'
import { yuanToCents } from '#/lib/money/dollars'
import { cn } from '#/lib/utils'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

type SelectUser = { id: string; username: string }
type DiningEventDetail = Awaited<ReturnType<typeof import('#/features/auth/auth.service').getDiningEventDetail>>
type DiningEventAllocation = ReturnType<typeof computeDiningEventAllocation>
type EditableItem = {
  id: string
  name: string
  amountYuan: string
  participantUserIds: string[]
  recordedByUserId?: string | null
}
type ItemDialogState = {
  mode: 'create' | 'edit'
  index?: number
  item: EditableItem
}

function createEmptyItem(participantUserIds: string[] = []): EditableItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    amountYuan: '',
    participantUserIds,
    recordedByUserId: null,
  }
}

function bpsToPercentInput(bps: number) {
  return (bps / 100).toString()
}

function percentInputToBps(value: string) {
  const percent = Number(value)
  if (!Number.isFinite(percent) || percent < 0) {
    throw new Error('服務費比例必須為非負數')
  }
  return Math.round(percent * 100)
}

function itemHasContent(item: EditableItem) {
  return Boolean(item.name.trim() || item.amountYuan.trim())
}

function normalizeItems(items: EditableItem[]) {
  const normalized = []
  for (const [index, item] of items.entries()) {
    const touched = itemHasContent(item)
    if (!touched) continue

    if (!item.name.trim()) throw new Error(`第 ${index + 1} 個品項請輸入品名`)
    const amountYuan = Number(item.amountYuan)
    if (!Number.isInteger(amountYuan)) {
      throw new Error(`第 ${index + 1} 個品項金額請輸入整數元`)
    }
    if (item.participantUserIds.length === 0) {
      throw new Error(`第 ${index + 1} 個品項請至少選擇一位分攤對象`)
    }

    normalized.push({
      id: item.id,
      name: item.name.trim(),
      amountCents: yuanToCents(amountYuan),
      participantUserIds: item.participantUserIds,
      recordedByUserId: item.recordedByUserId ?? null,
      order: normalized.length,
    })
  }
  return normalized
}

function summaryUsername(summary: { userId: string }, userNameById: Map<string, string>) {
  const namedSummary = summary as { username?: string }
  return namedSummary.username ?? userNameById.get(summary.userId) ?? summary.userId
}

function eventSettingsSignature(input: {
  title: string
  payerId: string
  serviceChargeEnabled: boolean
  serviceChargePercent: string
}) {
  return JSON.stringify(input)
}

function mapEventItemsToEditableItems(event: DiningEventDetail): EditableItem[] {
  return event.items.map((item) => ({
    id: item.id,
    name: item.name,
    amountYuan: String(item.amountCents / 100),
    participantUserIds: item.participantUserIds,
    recordedByUserId: item.recordedByUserId ?? null,
  }))
}

function SettlementScreenshotPreview({
  title,
  payerName,
  allocation,
  userNameById,
}: {
  title: string
  payerName: string
  allocation: DiningEventAllocation
  userNameById: Map<string, string>
}) {
  return (
    <section className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-4 text-[color:var(--foreground)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-[color:var(--line)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">統一付款人：{payerName}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm sm:min-w-[22rem]">
          <div className="rounded-lg bg-[color:var(--surface)] p-3">
            <p className="text-xs text-muted-foreground">小計</p>
            <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation.subtotalCents)}</p>
          </div>
          <div className="rounded-lg bg-[color:var(--surface)] p-3">
            <p className="text-xs text-muted-foreground">服務費</p>
            <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation.serviceChargeCents)}</p>
          </div>
          <div className="rounded-lg bg-[color:var(--foreground)] p-3 text-[color:var(--background)]">
            <p className="text-xs opacity-75">總額</p>
            <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation.totalCents)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {allocation.users.map((summary) => (
          <div
            key={summary.userId}
            className="break-inside-avoid rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{summaryUsername(summary, userNameById)}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary.items.length} 個品項 · 服務費 {formatTwd(summary.serviceChargeCents)}
                </p>
              </div>
              <p className="shrink-0 text-base font-semibold tabular-nums">{formatTwd(summary.totalCents)}</p>
            </div>

            <div className="mt-3 divide-y divide-[color:var(--line)]">
              {summary.items.map((item) => (
                <div key={`${summary.userId}-${item.itemId}`} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 whitespace-normal text-muted-foreground">{item.name}</span>
                  <span className="shrink-0 tabular-nums">{formatTwd(item.shareCents)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function DiningEventClient({
  event,
  users,
}: {
  event: DiningEventDetail
  users: SelectUser[]
}) {
  const router = useRouter()
  const isFinalized = event.status === 'FINALIZED'
  const [now, setNow] = useState(() => new Date(event.serverNow).getTime())
  const isClosed = isOrderingClosed(event, now)
  const itemsLocked = !canEditEventItems(event, event.currentUserId, now)
  const isPayer = event.currentUserId === event.payerId
  const dataVersionRef = useRef(event.updatedAt)

  useEffect(() => {
    const serverTime = new Date(event.serverNow).getTime()
    const startedAt = performance.now()
    setNow(serverTime)
    if (!event.orderDeadline || event.ordersClosedAt || isFinalized) return
    const deadline = new Date(event.orderDeadline).getTime()
    let timer: number | undefined
    const tick = () => {
      const currentTime = serverTime + performance.now() - startedAt
      setNow(currentTime)
      const remaining = deadline - currentTime
      if (remaining > 0) timer = window.setTimeout(tick, Math.min(remaining, 2147483647))
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [event.serverNow, event.orderDeadline, event.ordersClosedAt, isFinalized])
  const [title, setTitle] = useState(event.title)
  const [payerId, setPayerId] = useState(event.payerId)
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(event.serviceChargeEnabled)
  const [serviceChargePercent, setServiceChargePercent] = useState(
    bpsToPercentInput(event.serviceChargeRateBps),
  )
  const [items, setItems] = useState<EditableItem[]>(
    mapEventItemsToEditableItems(event),
  )
  const [itemDialog, setItemDialog] = useState<ItemDialogState | null>(null)
  const [itemDialogError, setItemDialogError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pendingAction, setPendingAction] = useState<'item' | 'delete-event' | 'finalize' | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [settlementPreviewOpen, setSettlementPreviewOpen] = useState(false)
  const savedSettingsSignatureRef = useRef(
    eventSettingsSignature({
      title: event.title,
      payerId: event.payerId,
      serviceChargeEnabled: event.serviceChargeEnabled,
      serviceChargePercent: bpsToPercentInput(event.serviceChargeRateBps),
    }),
  )
  const [, startTransition] = useTransition()

  const userNameById = useMemo(() => new Map(users.map((user) => [user.id, user.username])), [users])

  useEffect(() => {
    if (isFinalized) return

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      router.refresh()
    }, 5000)

    return () => window.clearInterval(interval)
  }, [isFinalized, router])

  useEffect(() => {
    if (pendingAction || itemDialog) return

    const serverServiceChargePercent = bpsToPercentInput(event.serviceChargeRateBps)
    const serverSignature = eventSettingsSignature({
      title: event.title,
      payerId: event.payerId,
      serviceChargeEnabled: event.serviceChargeEnabled,
      serviceChargePercent: serverServiceChargePercent,
    })
    const localSignature = eventSettingsSignature({
      title,
      payerId,
      serviceChargeEnabled,
      serviceChargePercent,
    })
    const localHasUnsavedSettings = localSignature !== savedSettingsSignatureRef.current

    setItems(mapEventItemsToEditableItems(event))
    dataVersionRef.current = event.updatedAt

    if (!localHasUnsavedSettings) {
      setTitle(event.title)
      setPayerId(event.payerId)
      setServiceChargeEnabled(event.serviceChargeEnabled)
      setServiceChargePercent(serverServiceChargePercent)
      savedSettingsSignatureRef.current = serverSignature
      setAutoSaveStatus('idle')
    }
  }, [event, pendingAction, itemDialog, title, payerId, serviceChargeEnabled, serviceChargePercent])

  useEffect(() => {
    if (!success) return
    const timer = window.setTimeout(() => setSuccess(null), 2500)
    return () => window.clearTimeout(timer)
  }, [success])

  useEffect(() => {
    if (!shareStatus) return
    const timer = window.setTimeout(() => setShareStatus(null), 2500)
    return () => window.clearTimeout(timer)
  }, [shareStatus])

  const preview = useMemo(() => {
    try {
      const normalized = normalizeItems(items)
      if (normalized.length === 0) return { allocation: null, error: null }
      const serviceChargeRateBps = serviceChargeEnabled
        ? percentInputToBps(serviceChargePercent)
        : 0
      return {
        allocation: computeDiningEventAllocation({
          items: normalized,
          serviceChargeEnabled,
          serviceChargeRateBps,
        }),
        error: null,
      }
    } catch (err) {
      return {
        allocation: null,
        error: err instanceof Error ? err.message : '無法計算活動金額',
      }
    }
  }, [items, serviceChargeEnabled, serviceChargePercent])

  useEffect(() => {
    if (itemsLocked || pendingAction || itemDialog) return

    const signature = eventSettingsSignature({
      title,
      payerId,
      serviceChargeEnabled,
      serviceChargePercent,
    })
    if (signature === savedSettingsSignatureRef.current) return

    const timer = window.setTimeout(() => {
      let payload: ReturnType<typeof buildPayload>
      try {
        payload = buildPayload()
      } catch (err) {
        setAutoSaveStatus('error')
        setError(err instanceof Error ? err.message : '活動設定無法自動儲存')
        return
      }

      setAutoSaveStatus('saving')
      startTransition(async () => {
        const response = await updateDiningEventAction(payload)
        if (!response.ok) {
          setAutoSaveStatus('error')
          setError(response.message)
          return
        }
        dataVersionRef.current = response.data.updatedAt
        savedSettingsSignatureRef.current = signature
        setAutoSaveStatus('saved')
        setError(null)
        router.refresh()
      })
    }, 700)

    return () => window.clearTimeout(timer)
  }, [itemsLocked, pendingAction, itemDialog, title, payerId, serviceChargeEnabled, serviceChargePercent, items, router])

  function openCreateItemDialog() {
    if (itemsLocked) return
    setItemDialogError(null)
    setItemDialog({
      mode: 'create',
      item: createEmptyItem(event.currentUserId ? [event.currentUserId] : []),
    })
  }

  function openEditItemDialog(index: number) {
    if (itemsLocked) return
    setItemDialogError(null)
    setItemDialog({
      mode: 'edit',
      index,
      item: { ...items[index], participantUserIds: [...items[index].participantUserIds] },
    })
  }

  function updateDialogItem(patch: Partial<EditableItem>) {
    setItemDialog((current) => (current ? { ...current, item: { ...current.item, ...patch } } : current))
  }

  function toggleDialogParticipant(userId: string) {
    setItemDialog((current) => {
      if (!current) return current
      const nextIds = current.item.participantUserIds.includes(userId)
        ? current.item.participantUserIds.filter((id) => id !== userId)
        : [...current.item.participantUserIds, userId]
      return { ...current, item: { ...current.item, participantUserIds: nextIds } }
    })
  }

  function buildPayload(nextItems = items) {
    const serviceChargeRateBps = serviceChargeEnabled ? percentInputToBps(serviceChargePercent) : 0
    return {
      eventId: event.id,
      expectedUpdatedAt: dataVersionRef.current,
      title,
      payerId,
      serviceChargeEnabled,
      serviceChargeRateBps,
      items: normalizeItems(nextItems),
    }
  }

  function onSubmitItemDialog(eventArg: React.FormEvent) {
    eventArg.preventDefault()
    if (!itemDialog || itemsLocked) return
    setItemDialogError(null)
    setError(null)
    setSuccess(null)

    let normalizedItem: ReturnType<typeof normalizeItems>[number]
    try {
      const normalized = normalizeItems([itemDialog.item])
      if (normalized.length !== 1) throw new Error('請輸入品項資料')
      normalizedItem = normalized[0]
    } catch (err) {
      setItemDialogError(err instanceof Error ? err.message : '品項資料格式錯誤')
      return
    }

    setPendingAction('item')
    if (itemDialog.mode === 'create') {
      startTransition(async () => {
        try {
          const response = await addDiningEventItemAction({
            eventId: event.id,
            name: normalizedItem.name,
            amountCents: normalizedItem.amountCents,
            participantUserIds: normalizedItem.participantUserIds,
          })
          if (!response.ok) {
            setItemDialogError(response.message)
            return
          }
          setItems((current) => [
            ...current,
            {
              ...itemDialog.item,
              id: response.data.itemId,
              name: normalizedItem.name,
              amountYuan: String(normalizedItem.amountCents / 100),
              recordedByUserId: event.currentUserId,
            },
          ])
          setItemDialog(null)
          setSuccess('已新增品項')
          router.refresh()
        } finally {
          setPendingAction(null)
        }
      })
      return
    }

    if (typeof itemDialog.index !== 'number') {
      setPendingAction(null)
      setItemDialogError('找不到要修改的品項')
      return
    }

    const nextItems = items.map((item, index) =>
      index === itemDialog.index
        ? {
            ...itemDialog.item,
            name: normalizedItem.name,
            amountYuan: String(normalizedItem.amountCents / 100),
            participantUserIds: normalizedItem.participantUserIds,
          }
        : item,
    )

    startTransition(async () => {
      try {
        const response = await updateDiningEventAction(buildPayload(nextItems))
        if (!response.ok) {
          setItemDialogError(response.message)
          return
        }
        dataVersionRef.current = response.data.updatedAt
        setItems(nextItems)
        setItemDialog(null)
        setSuccess('已更新品項')
        router.refresh()
      } finally {
        setPendingAction(null)
      }
    })
  }

  function onDeleteDialogItem() {
    if (!itemDialog || itemDialog.mode !== 'edit' || typeof itemDialog.index !== 'number' || itemsLocked) return
    setItemDialogError(null)
    setError(null)
    setSuccess(null)

    const nextItems = items.filter((_, index) => index !== itemDialog.index)
    setPendingAction('item')
    startTransition(async () => {
      try {
        const response = await updateDiningEventAction(buildPayload(nextItems))
        if (!response.ok) {
          setItemDialogError(response.message)
          return
        }
        dataVersionRef.current = response.data.updatedAt
        setItems(nextItems)
        setItemDialog(null)
        setSuccess('已刪除品項')
        router.refresh()
      } finally {
        setPendingAction(null)
      }
    })
  }

  async function onCopyShareLink() {
    setShareStatus(null)
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareStatus('已複製活動連結')
    } catch {
      setShareStatus('無法自動複製，請直接複製網址列')
    }
  }

  function onFinalize() {
    if (isFinalized) return
    setError(null)
    setSuccess(null)
    setPendingAction('finalize')

    let payload: ReturnType<typeof buildPayload>
    try {
      payload = buildPayload()
    } catch (err) {
      setPendingAction(null)
      setError(err instanceof Error ? err.message : '活動資料格式錯誤')
      return
    }

    startTransition(async () => {
      try {
        const saveResponse = await updateDiningEventAction(payload)
        if (!saveResponse.ok) {
          setError(saveResponse.message)
          return
        }

        const finalizeResponse = await finalizeDiningEventAction({ eventId: event.id })
        if (!finalizeResponse.ok) {
          setError(finalizeResponse.message)
          return
        }

        router.push(`/events/${event.id}`)
        router.refresh()
      } finally {
        setPendingAction(null)
      }
    })
  }

  function onDeleteEvent() {
    if (isFinalized || event.currentUserId !== payerId) return
    const ok = window.confirm('確定要刪除這個活動？未結算活動刪除後無法復原。')
    if (!ok) return

    setError(null)
    setSuccess(null)
    setPendingAction('delete-event')
    startTransition(async () => {
      try {
        const response = await deleteDiningEventAction({ eventId: event.id })
        if (!response.ok) {
          setError(response.message)
          return
        }
        router.push('/events')
        router.refresh()
      } finally {
        setPendingAction(null)
      }
    })
  }

  const allocation = isFinalized ? event.allocation : preview.allocation
  const previewError = isFinalized ? null : preview.error
  const payerName = userNameById.get(payerId) ?? payerId

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
      <div className="space-y-6">
        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>活動設定</CardTitle>
              <Badge variant={isFinalized ? 'secondary' : 'outline'}>
                {isFinalized ? '已結算' : isClosed ? '已結單' : '收單中'}
              </Badge>
            </div>
            <CardDescription>
              {isFinalized
                ? '活動已鎖定，請到正式交易處理銷帳。'
                : `活動設定會自動儲存${
                    autoSaveStatus === 'saving'
                      ? '中'
                      : autoSaveStatus === 'saved'
                        ? '，已同步'
                        : autoSaveStatus === 'error'
                          ? '，請修正錯誤'
                          : ''
                  }。`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {success ? (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            ) : null}
            {shareStatus ? (
              <Alert>
                <AlertDescription>{shareStatus}</AlertDescription>
              </Alert>
            ) : null}
            {previewError ? (
              <Alert variant="destructive">
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            ) : null}

            <EventOrderingControls
              key={`${event.orderDeadline}:${event.ordersClosedAt}`}
              event={event}
              isClosed={isClosed}
              disabled={pendingAction !== null || autoSaveStatus === 'saving'}
              onChanged={() => router.refresh()}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">活動名稱</Label>
                <Input
                  id="title"
                  className="h-12"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={itemsLocked}
                />
              </div>
              <div className="space-y-2">
                <Label>統一付款人</Label>
                <Select value={payerId} onValueChange={setPayerId} disabled={isFinalized || !isPayer}>
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
            </div>

            <div className="grid gap-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 md:grid-cols-[auto_1fr] md:items-end">
              <label className="flex min-h-12 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[color:var(--lagoon-deep)]"
                  checked={serviceChargeEnabled}
                  onChange={(event) => setServiceChargeEnabled(event.target.checked)}
                  disabled={itemsLocked}
                />
                收服務費
              </label>
              <div className="space-y-2">
                <Label htmlFor="serviceChargePercent">服務費比例（%）</Label>
                <Input
                  id="serviceChargePercent"
                  className="h-12"
                  inputMode="decimal"
                  value={serviceChargePercent}
                  onChange={(event) => setServiceChargePercent(event.target.value)}
                  disabled={itemsLocked || !serviceChargeEnabled}
                />
              </div>
            </div>

            {isFinalized && event.finalizedTransactionId ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="h-11" onClick={onCopyShareLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  複製活動連結
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-lg border-[color:var(--line)] bg-[color:var(--surface-strong)] text-[color:var(--sea-ink)] hover:bg-[color:var(--chip-bg)] hover:text-[color:var(--lagoon-deep)] dark:text-[color:var(--foreground)] dark:hover:text-[color:var(--lagoon)]"
                  asChild
                >
                  <Link href={`/transactions/${event.finalizedTransactionId}`}>
                    <ReceiptText className="mr-2 h-4 w-4" />
                    查看正式交易
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="h-11" onClick={onCopyShareLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  複製活動連結
                </Button>
                {isPayer ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-11"
                    onClick={onDeleteEvent}
                    disabled={pendingAction !== null}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {pendingAction === 'delete-event' ? '刪除中…' : '刪除活動'}
                  </Button>
                ) : null}
                {isPayer ? (
                  <Button
                    type="button"
                    className="h-11"
                    onClick={onFinalize}
                    disabled={pendingAction !== null}
                  >
                    {pendingAction === 'finalize' ? '結算中…' : '結算成正式交易'}
                  </Button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>品項</CardTitle>
                <CardDescription>新增、修改與刪除都會立即儲存。</CardDescription>
              </div>
              {!itemsLocked ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  onClick={openCreateItemDialog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新增品項
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-6 text-center">
                <p className="text-sm text-muted-foreground">尚未有人新增品項。</p>
                {!itemsLocked ? (
                  <Button type="button" className="mt-4" onClick={openCreateItemDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    新增第一個品項
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 text-left transition hover:bg-[color:var(--surface-strong)] disabled:cursor-default disabled:hover:bg-[color:var(--surface)]"
                    onClick={() => openEditItemDialog(index)}
                    disabled={itemsLocked}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.participantUserIds
                            .map((userId) => userNameById.get(userId) ?? userId)
                            .join('、') || '尚未選擇分攤對象'}
                        </p>
                        {item.recordedByUserId ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            由 {userNameById.get(item.recordedByUserId) ?? item.recordedByUserId} 紀錄
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">{formatTwd(yuanToCents(Number(item.amountYuan) || 0))}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>結算預覽</CardTitle>
                <CardDescription>依目前品項即時計算每人實際應付。</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setSettlementPreviewOpen(true)}
                disabled={!allocation || allocation.users.length === 0}
              >
                <Maximize2 className="mr-2 h-4 w-4" />
                放大預覽
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl bg-[color:var(--surface)] p-3">
                <p className="text-xs text-muted-foreground">小計</p>
                <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation?.subtotalCents ?? 0)}</p>
              </div>
              <div className="rounded-xl bg-[color:var(--surface)] p-3">
                <p className="text-xs text-muted-foreground">服務費</p>
                <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation?.serviceChargeCents ?? 0)}</p>
              </div>
              <div className="rounded-xl bg-[color:var(--surface)] p-3">
                <p className="text-xs text-muted-foreground">總額</p>
                <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation?.totalCents ?? 0)}</p>
              </div>
            </div>

            <Separator />

            {!allocation || allocation.users.length === 0 ? (
              <p className="text-sm text-muted-foreground">新增品項後會顯示每人應付與明細。</p>
            ) : (
              <div className="space-y-4">
                {allocation.users.map((summary) => (
                  <div key={summary.userId} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{summaryUsername(summary, userNameById)}</p>
                        <p className="text-xs text-muted-foreground">
                          小計 {formatTwd(summary.subtotalCents)} · 服務費 {formatTwd(summary.serviceChargeCents)}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums">{formatTwd(summary.totalCents)}</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {summary.items.map((item) => (
                        <div key={`${summary.userId}-${item.itemId}`} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-muted-foreground">{item.name}</span>
                          <span className="tabular-nums">{formatTwd(item.shareCents)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {allocation && allocation.users.length > 0 ? (
          <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
            <CardHeader>
              <CardTitle>每人彙總</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3 md:hidden">
                {allocation.users.map((summary) => (
                  <div key={summary.userId} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{summaryUsername(summary, userNameById)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{summary.items.length} 個品項</p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">{formatTwd(summary.totalCents)}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">小計</p>
                        <p className="mt-1 font-semibold tabular-nums">{formatTwd(summary.subtotalCents)}</p>
                      </div>
                      <div className="rounded-lg bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">服務費</p>
                        <p className="mt-1 font-semibold tabular-nums">{formatTwd(summary.serviceChargeCents)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Table className="responsive-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>成員</TableHead>
                    <TableHead className="text-right">小計</TableHead>
                    <TableHead className="text-right">服務費</TableHead>
                    <TableHead className="text-right">應付</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocation.users.map((summary) => (
                    <TableRow key={summary.userId}>
                      <TableCell className="font-medium">{summaryUsername(summary, userNameById)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTwd(summary.subtotalCents)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTwd(summary.serviceChargeCents)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatTwd(summary.totalCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
    <Dialog open={settlementPreviewOpen} onOpenChange={setSettlementPreviewOpen}>
      <DialogContent className="inset-2 max-h-[calc(100svh-1rem)] max-w-none overflow-y-auto p-3 sm:inset-x-4 sm:top-4 sm:left-1/2 sm:bottom-auto sm:w-[calc(100vw-2rem)] sm:max-w-7xl sm:translate-y-0 sm:p-4 md:max-w-7xl">
        <DialogHeader className="pr-10">
          <DialogTitle>放大結算預覽</DialogTitle>
          <DialogDescription>可直接用手機或電腦截圖提供給店家確認訂購內容。</DialogDescription>
        </DialogHeader>
        {allocation && allocation.users.length > 0 ? (
          <SettlementScreenshotPreview
            title={title}
            payerName={payerName}
            allocation={allocation}
            userNameById={userNameById}
          />
        ) : (
          <p className="text-sm text-muted-foreground">新增品項後才會產生可截圖的放大預覽。</p>
        )}
      </DialogContent>
    </Dialog>
    {itemDialog ? (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
        <div className="max-h-[calc(100svh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-[color:var(--line)] bg-popover p-5 text-popover-foreground shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{itemDialog.mode === 'edit' ? '修改品項' : '新增品項'}</h2>
              <p className="text-sm text-muted-foreground">
                選一人是個人品項，選多人就是合點、套餐或加點分攤。
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (pendingAction === 'item') return
                setItemDialog(null)
                setItemDialogError(null)
              }}
              disabled={pendingAction === 'item'}
              aria-label="關閉"
            >
              ×
            </Button>
          </div>

          <form onSubmit={onSubmitItemDialog} className="space-y-5">
            {itemsLocked && <p role="alert" className="text-sm text-destructive">活動已結單或結算，無法儲存品項變更。</p>}
            {itemDialogError ? (
              <Alert variant="destructive">
                <AlertDescription>{itemDialogError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <Label htmlFor="itemName">品名</Label>
                <Input
                  disabled={itemsLocked}
                  id="itemName"
                  className="h-12"
                  value={itemDialog.item.name}
                  onChange={(inputEvent) => updateDialogItem({ name: inputEvent.target.value })}
                  placeholder="例如：拉麵、套餐加點、共享炸物"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="itemAmount">金額（元）</Label>
                <Input
                  disabled={itemsLocked}
                  id="itemAmount"
                  className="h-12"
                  inputMode="decimal"
                  placeholder="例如：-50"
                  value={itemDialog.item.amountYuan}
                  onChange={(inputEvent) => updateDialogItem({ amountYuan: inputEvent.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>分攤對象</Label>
              <div className="flex flex-wrap gap-2">
                {users.map((user) => {
                  const selected = itemDialog.item.participantUserIds.includes(user.id)
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition',
                        selected
                          ? 'border-[color:var(--lagoon-deep)] bg-[color:var(--chip-bg)] text-[color:var(--sea-ink)]'
                          : 'border-[color:var(--line)] bg-background text-muted-foreground hover:bg-muted',
                      )}
                      disabled={itemsLocked}
                      onClick={() => toggleDialogParticipant(user.id)}
                    >
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      {user.username}
                    </button>
                  )
                })}
              </div>
            </div>

            {itemDialog.item.recordedByUserId ? (
              <p className="text-xs text-muted-foreground">
                由 {userNameById.get(itemDialog.item.recordedByUserId) ?? itemDialog.item.recordedByUserId} 紀錄
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--line)] pt-4 sm:flex-row sm:justify-end">
              {itemDialog.mode === 'edit' ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onDeleteDialogItem}
                  disabled={pendingAction === 'item' || itemsLocked}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  刪除
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setItemDialog(null)
                  setItemDialogError(null)
                }}
                disabled={pendingAction === 'item'}
              >
                取消
              </Button>
              <Button type="submit" disabled={pendingAction === 'item' || itemsLocked}>
                {pendingAction === 'item'
                  ? '儲存中…'
                  : itemDialog.mode === 'edit'
                    ? '儲存修改'
                    : '新增品項'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    ) : null}
    </>
  )
}
