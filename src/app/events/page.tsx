import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, Plus } from 'lucide-react'
import { getSessionUser, listDiningEvents } from '#/features/auth/auth.service'
import { formatTwd } from '#/lib/money/amount'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'

export default async function DiningEventsPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const data = await listDiningEvents()
  const draftEvents = data.events.filter((event) => event.status === 'DRAFT')
  const finalizedEvents = data.events.filter((event) => event.status === 'FINALIZED')

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:space-y-8 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--kicker)]">
            活動記帳
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">進行中的活動</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            建立活動後，其他人可從這裡加入並新增自己的品項；也可以打開活動後複製連結分享。
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-lg border-[color:var(--line)] bg-[color:var(--surface-strong)] text-[color:var(--sea-ink)] hover:bg-[color:var(--chip-bg)] hover:text-[color:var(--lagoon-deep)] dark:text-[color:var(--foreground)] dark:hover:text-[color:var(--lagoon)]"
          asChild
        >
          <Link href="/events/new">
            <Plus className="mr-2 h-4 w-4" />
            建立活動
          </Link>
        </Button>
      </div>

      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
        <CardHeader>
          <CardTitle>可加入活動</CardTitle>
          <CardDescription>尚未結算的活動都會出現在這裡。</CardDescription>
        </CardHeader>
        <CardContent>
          {draftEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-6 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">目前沒有進行中的活動。</p>
              <Button
                variant="outline"
                className="mt-4 h-11 rounded-lg border-[color:var(--line)] bg-[color:var(--surface-strong)] text-[color:var(--sea-ink)] hover:bg-[color:var(--chip-bg)] hover:text-[color:var(--lagoon-deep)] dark:text-[color:var(--foreground)] dark:hover:text-[color:var(--lagoon)]"
                asChild
              >
                <Link href="/events/new">建立第一個活動</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {draftEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 transition hover:bg-[color:var(--surface-strong)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-foreground">{event.title}</h2>
                        <Badge variant="outline">進行中</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">付款人：{event.payerUsername}</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-foreground">
                      {formatTwd(event.totalCents)}
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-background/70 p-3">
                      <p className="text-xs text-muted-foreground">品項</p>
                      <p className="mt-1 font-semibold">{event.itemCount}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 p-3">
                      <p className="text-xs text-muted-foreground">參與者</p>
                      <p className="mt-1 font-semibold">{event.participantCount}</p>
                    </div>
                  </div>
                  {event.participantUsernames.length > 0 ? (
                    <p className="mt-3 truncate text-xs text-muted-foreground">
                      {event.participantUsernames.join('、')}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">尚未有人新增品項</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {finalizedEvents.length > 0 ? (
        <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)]">
          <CardHeader>
            <CardTitle>已結算活動</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {finalizedEvents.slice(0, 10).map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 transition hover:bg-[color:var(--surface-strong)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">付款人：{event.payerUsername}</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">已結算</Badge>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                    {formatTwd(event.totalCents)}
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}
