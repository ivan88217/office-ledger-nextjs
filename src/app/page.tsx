import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDashboard, getSessionUser } from '#/features/auth/auth.service'
import { paymentTypeLabel } from '#/features/ledger/type-label'
import { formatTwd } from '#/lib/money/amount'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export default async function DashboardPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const data = await getDashboard()

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>我欠他人（消費）</CardDescription>
            <CardTitle className="text-2xl text-destructive">
              {formatTwd(data.totalOwedByMeCents)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>他人欠我（消費）</CardDescription>
            <CardTitle className="text-2xl">{formatTwd(data.totalOwedToMeCents)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>與同事的帳</CardTitle>
          <CardDescription>點擊同事可查看往來明細</CardDescription>
        </CardHeader>
        <CardContent>
          {data.peers.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無帳務紀錄，先建立一筆交易吧。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>同事</TableHead>
                  <TableHead className="text-right">他還欠我</TableHead>
                  <TableHead className="text-right">我還欠他</TableHead>
                  <TableHead className="text-right">我墊給他</TableHead>
                  <TableHead className="text-right">他預付給我</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.peers.map((peer) => (
                  <TableRow key={peer.peerId}>
                    <TableCell className="font-medium">
                      <Link href={`/peers/${peer.peerId}`} className="flex items-center gap-2 hover:underline">
                        <span>{peer.peerUsername}</span>
                        {peer.pendingIncomingPrepaymentCount > 0 ? (
                          <Badge variant="destructive">待審核 {peer.pendingIncomingPrepaymentCount}</Badge>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTwd(peer.theyOweMeCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTwd(peer.iOweCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTwd(peer.myPrepaymentBalanceCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTwd(peer.peerPrepaymentBalanceCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>我代墊待還款</CardTitle>
          <CardDescription>欠你的消費款項</CardDescription>
        </CardHeader>
        <CardContent>
          {data.peers.filter((peer) => peer.theyOweMeCents > 0).length === 0 ? (
            <p className="text-sm text-muted-foreground">目前沒有待還款的代墊款項。</p>
          ) : (
            <div className="space-y-2">
              {data.peers
                .filter((peer) => peer.theyOweMeCents > 0)
                .map((peer) => (
                  <Link
                    key={peer.peerId}
                    href={`/peers/${peer.peerId}`}
                    className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/60"
                  >
                    <span className="font-medium">{peer.peerUsername}</span>
                    <span className="tabular-nums">{formatTwd(peer.theyOweMeCents)}</span>
                  </Link>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近變動</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>類型</TableHead>
                  <TableHead>說明</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="secondary">{paymentTypeLabel(log.type)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.fromUsername} → {log.toUsername}
                      {log.transactionId ? (
                        <>
                          {' · '}
                          <Link
                            href={`/transactions/${log.transactionId}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {log.transactionTitle ?? '交易'}
                          </Link>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatTwd(log.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </main>
  )
}
