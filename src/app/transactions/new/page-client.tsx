'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createExpenseTransactionAction } from '#/features/auth/actions'
import { computeAllocations } from '#/features/ledger/domain/allocation'
import { parseAdditionExpressionToCents } from '#/features/ledger/domain/parse-addition'
import { formatTwd } from '#/lib/money/amount'
import { yuanToCents } from '#/lib/money/dollars'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Combobox, type ComboboxRef } from '#/components/ui/combobox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

type Row = { userId: string; userInput: string; expression: string }
type SelectUser = { id: string; username: string }

type ExpensePreview = {
  title: string
  payerId: string
  payerUsername: string
  finalCents: number
  participants: { userId: string; originalExpression: string; order: number }[]
  allocations: {
    userId: string
    username: string
    originalCents: number
    allocatedCents: number
  }[]
}

function buildExpensePreview(input: {
  title: string
  payerId: string
  finalYuan: string
  rows: Row[]
  users: SelectUser[]
}): ExpensePreview {
  const title = input.title.trim()
  if (!title) throw new Error('請輸入交易標題')

  const payer = input.users.find((user) => user.id === input.payerId)
  if (!payer) throw new Error('付款人不存在')

  const finalYuan = Number(input.finalYuan)
  if (!Number.isInteger(finalYuan) || finalYuan < 0) {
    throw new Error('實付總額請輸入非負整數（元）')
  }
  const finalCents = yuanToCents(finalYuan)

  const invalidRowIndex = input.rows.findIndex((row) => {
    const hasUserInput = Boolean(row.userInput.trim())
    const hasExpression = Boolean(row.expression.trim())
    const rowTouched = hasUserInput || hasExpression
    if (!rowTouched) return false
    return !row.userId || !hasExpression
  })
  if (invalidRowIndex >= 0) {
    throw new Error(`第 ${invalidRowIndex + 1} 列請完整選擇使用者並填寫原始金額`)
  }

  const filledRows = input.rows.filter((row) => row.userId && row.expression.trim())
  if (filledRows.length === 0) {
    throw new Error('請至少新增一位參與者並填寫金額算式')
  }

  const participants: { userId: string; originalExpression: string; order: number }[] = []
  const parsedParticipants: { userId: string; originalCents: number; order: number }[] = []

  for (let order = 0; order < filledRows.length; order++) {
    const row = filledRows[order]
    try {
      const originalYuan = parseAdditionExpressionToCents(row.expression)
      participants.push({
        userId: row.userId,
        originalExpression: row.expression.trim(),
        order,
      })
      parsedParticipants.push({
        userId: row.userId,
        originalCents: yuanToCents(originalYuan),
        order,
      })
    } catch (error) {
      throw new Error(
        error instanceof Error ? `第 ${order + 1} 列原始金額：${error.message}` : '原始金額格式錯誤',
      )
    }
  }

  const userById = new Map(input.users.map((user) => [user.id, user.username]))
  const allocations = computeAllocations({
    finalCents,
    participants: parsedParticipants,
  }).map((allocation) => ({
    userId: allocation.userId,
    username: userById.get(allocation.userId) ?? '未知使用者',
    originalCents: allocation.originalCents,
    allocatedCents: allocation.allocatedCents,
  }))

  return {
    title,
    payerId: payer.id,
    payerUsername: payer.username,
    finalCents,
    participants,
    allocations,
  }
}

export function NewTransactionForm({
  users,
  currentUserId,
}: {
  users: SelectUser[]
  currentUserId: string | null
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [payerId, setPayerId] = useState(currentUserId ?? '')
  const [finalYuan, setFinalYuan] = useState('')
  const [rows, setRows] = useState<Row[]>([{ userId: '', userInput: '', expression: '' }])
  const [preview, setPreview] = useState<ExpensePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const expressionInputRefs = useRef<Array<HTMLInputElement | null>>([])
  const participantComboboxRefs = useRef<Array<ComboboxRef | null>>([])

  useEffect(() => {
    if (users.length && !payerId) {
      setPayerId(users.find((user) => user.id === currentUserId)?.id ?? users[0].id)
    }
  }, [users, payerId, currentUserId])

  function addRow() {
    setRows((current) => [...current, { userId: '', userInput: '', expression: '' }])
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  function handleUserSelect(index: number, userId: string) {
    const selectedUser = users.find((u) => u.id === userId)
    updateRow(index, {
      userId,
      userInput: selectedUser?.username ?? '',
    })

    // 選擇完成後自動 focus 到同列的金額欄位
    requestAnimationFrame(() => {
      expressionInputRefs.current[index]?.focus()
    })
  }

  function onExpressionInputTab(event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) {
    if (event.key !== 'Tab' || event.shiftKey || rowIndex !== rows.length - 1) return
    event.preventDefault()

    setRows((current) => {
      const newRows = [...current, { userId: '', userInput: '', expression: '' }]
      // After state update, focus the new row's Combobox
      requestAnimationFrame(() => {
        participantComboboxRefs.current[rowIndex + 1]?.focus()
      })
      return newRows
    })
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      setPreview(buildExpensePreview({ title, payerId, finalYuan, rows, users }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法預覽')
    }
  }

  function onConfirm() {
    if (!preview) return
    setError(null)

    startTransition(async () => {
      const response = await createExpenseTransactionAction({
        title: preview.title,
        payerId: preview.payerId,
        finalCents: preview.finalCents,
        participants: preview.participants,
      })
      if (!response.ok) {
        setError(response.message)
        return
      }
      router.push(`/transactions/${response.data.transactionId}`)
      router.refresh()
    })
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:space-y-8 sm:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">新增交易</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          先輸入實付總額，再補上每位參與者的原始金額算式；系統會自動換算成分攤結果。
        </p>
      </div>

      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
        <CardHeader>
          <CardTitle>交易內容</CardTitle>
          <CardDescription>原始金額算式只允許非負整數與 `+`</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">交易標題</Label>
                <Input id="title" className="h-12" value={title} onChange={(event) => setTitle(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>付款人</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="finalYuan">實付總額（元）</Label>
              <Input
                id="finalYuan"
                className="h-12"
                inputMode="numeric"
                value={finalYuan}
                onChange={(event) => setFinalYuan(event.target.value)}
                required
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-medium">參與者</h2>
                  <p className="text-sm text-muted-foreground">點擊選擇或直接輸入搜尋使用者名稱</p>
                </div>
                <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={addRow}>
                  新增一列
                </Button>
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={index} className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 md:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-2">
                      <Label className="text-xs whitespace-nowrap">使用者</Label>
                      <Combobox
                        ref={(el) => {
                          participantComboboxRefs.current[index] = el
                        }}
                        options={users.map((user) => ({
                          value: user.id,
                          label: user.username,
                        }))}
                        value={row.userId}
                        onValueChange={(userId) => handleUserSelect(index, userId)}
                        placeholder="選擇參與者..."
                        emptyMessage="找不到符合的使用者"
                        autoSelectFirstMatch={true}
                        onSelectComplete={() => {
                          // 選擇完成後 focus 到金額欄位
                          requestAnimationFrame(() => {
                            expressionInputRefs.current[index]?.focus()
                          })
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs whitespace-nowrap">原始金額（元，可含 +）</Label>
                      <Input
                        className="h-12"
                        ref={(el) => {
                          expressionInputRefs.current[index] = el
                        }}
                        value={row.expression}
                        onChange={(event) => updateRow(index, { expression: event.target.value })}
                        onKeyDown={(event) => onExpressionInputTab(event, index)}
                        placeholder="250 或 50+20+15"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 w-full md:mt-6 md:w-auto"
                      onClick={() => removeRow(index)}
                      disabled={rows.length === 1}
                    >
                      刪除
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full">
              預覽分攤
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[85svh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>確認分攤</DialogTitle>
            <DialogDescription>
              {preview ? `${preview.title} · 付款人 ${preview.payerUsername} · 實付 ${formatTwd(preview.finalCents)}` : ''}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <>
              <div className="space-y-3 md:hidden">
                {preview.allocations.map((allocation) => (
                  <div key={allocation.userId} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
                    <p className="font-semibold">{allocation.username}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-[color:var(--surface)] p-3">
                        <p className="text-xs text-muted-foreground">原始</p>
                        <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation.originalCents)}</p>
                      </div>
                      <div className="rounded-xl bg-[color:var(--surface)] p-3">
                        <p className="text-xs text-muted-foreground">分攤</p>
                        <p className="mt-1 font-semibold tabular-nums">{formatTwd(allocation.allocatedCents)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Table className="responsive-table">
              <TableHeader>
                <TableRow>
                  <TableHead>參與者</TableHead>
                  <TableHead className="text-right">原始</TableHead>
                  <TableHead className="text-right">分攤</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.allocations.map((allocation) => (
                  <TableRow key={allocation.userId}>
                    <TableCell>{allocation.username}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTwd(allocation.originalCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTwd(allocation.allocatedCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              返回編輯
            </Button>
            <Button onClick={onConfirm} disabled={isPending}>
              {isPending ? '建立中…' : '確認建立'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
