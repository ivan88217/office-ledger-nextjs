import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PeerLedgerClient } from '#/app/peers/[peerId]/page-client'
import { getPeerLedger, getSessionUser } from '#/features/auth/auth.service'
import { Button } from '#/components/ui/button'

export default async function PeerLedgerPage({
  params,
}: {
  params: Promise<{ peerId: string }>
}) {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const { peerId } = await params
  const data = await getPeerLedger({ peerId })

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">與 {data.peer.username} 的帳</h1>
          <p className="mt-1 text-sm text-muted-foreground">雙向紀錄，金額以你的視角入帳。</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">返回總覽</Link>
        </Button>
      </div>

      <PeerLedgerClient data={data} />
    </main>
  )
}
