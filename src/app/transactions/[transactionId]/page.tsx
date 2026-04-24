import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TransactionDetailClient } from '#/app/transactions/[transactionId]/page-client'
import { getSessionUser, getTransactionDetail } from '#/features/auth/auth.service'
import { Button } from '#/components/ui/button'

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>
}) {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const { transactionId } = await params
  const transaction = await getTransactionDetail({ transactionId })

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:space-y-8 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{transaction.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看分攤結果與逐人銷帳。</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">返回總覽</Link>
        </Button>
      </div>
      <TransactionDetailClient transaction={transaction} />
    </main>
  )
}
