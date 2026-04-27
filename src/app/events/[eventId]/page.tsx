import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DiningEventClient } from '#/app/events/[eventId]/page-client'
import { getDiningEventDetail, getSessionUser, listUsersForSelect } from '#/features/auth/auth.service'
import { Button } from '#/components/ui/button'

export default async function DiningEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const { eventId } = await params
  const [event, userData] = await Promise.all([
    getDiningEventDetail({ eventId }),
    listUsersForSelect(),
  ])

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{event.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            分享活動讓大家各自新增品項；也可由一人代填，最後由付款人結算成正式交易。
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">返回總覽</Link>
        </Button>
      </div>
      <DiningEventClient event={event} users={userData.users} />
    </main>
  )
}
