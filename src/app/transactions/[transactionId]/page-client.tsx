'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { settleTransactionParticipantAction } from '#/features/auth/actions'
import { formatTwd } from '#/lib/money/amount'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export function TransactionDetailClient({
  transaction,
}: {
  transaction: Awaited<ReturnType<typeof import('#/features/auth/auth.service').getTransactionDetail>>
}) {
  const router = useRouter()
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function onSettleParticipant(userId: string) {
    setError(null)
    setPendingUserId(userId)
    startTransition(async () => {
      try {
        await settleTransactionParticipantAction({
          transactionId: transaction.id,
          participantUserId: userId,
        })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : '銷帳失敗')
      } finally {
        setPendingUserId(null)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>分攤結果</CardTitle>
        <CardDescription>
          付款人：{transaction.payerUsername} · 實付 {formatTwd(transaction.finalCents)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>參與者</TableHead>
              <TableHead className="text-right">原始</TableHead>
              <TableHead className="text-right">分攤</TableHead>
              <TableHead className="text-right">銷帳</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transaction.participants.map((participant) => (
              <TableRow key={participant.userId}>
                <TableCell className="font-medium">
                  {participant.username}
                  {participant.userId === transaction.payerId ? (
                    <span className="ml-2 text-xs text-muted-foreground">（墊款）</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatTwd(participant.originalCents)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTwd(participant.allocatedCents)}</TableCell>
                <TableCell className="text-right">
                  {participant.userId === transaction.payerId ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : transaction.currentUserId === transaction.payerId && participant.settleableCents > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      {participant.coveredCents > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          已沖抵 / 已還款 {formatTwd(participant.coveredCents)}
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        onClick={() => onSettleParticipant(participant.userId)}
                        disabled={pendingUserId === participant.userId}
                      >
                        {pendingUserId === participant.userId
                          ? '銷帳中…'
                          : `銷帳 ${formatTwd(participant.settleableCents)}`}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {participant.coveredCents > 0 ? '已結清' : '—'}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
