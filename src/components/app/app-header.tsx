import Link from 'next/link'
import { KeyRound, LogOut, ReceiptText, Users, Wallet } from 'lucide-react'
import { logoutRedirectAction } from '#/features/auth/actions'
import { Button } from '#/components/ui/button'

const nav = [
  { href: '/', label: '總覽' },
  { href: '/transactions/new', label: '記帳' },
  { href: '/prepayments/new', label: '預付款' },
  { href: '/settlements/new', label: '還款' },
  { href: '/colleagues', label: '同事' },
]

export function AppHeader({
  user,
}: {
  user: null | { id: string; username: string; email: string }
}) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
          <img
            src="/office-ledger-logo.png"
            alt="OfficeLedger"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover ring-1 ring-border"
          />
          <span>OfficeLedger</span>
        </Link>

        {user ? (
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Button key={item.href} variant="ghost" size="sm" asChild>
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden rounded-full border border-border bg-background/80 px-3 py-1 text-sm text-muted-foreground sm:block">
                {user.username}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/password">
                  <KeyRound className="mr-2 h-4 w-4" />
                  更換密碼
                </Link>
              </Button>
              <form action={logoutRedirectAction}>
                <Button variant="outline" size="sm" type="submit">
                  <LogOut className="mr-2 h-4 w-4" />
                  登出
                </Button>
              </form>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href="/login">登入</Link>
            </Button>
          )}
        </div>

        {user ? (
          <nav className="flex w-full items-center gap-2 overflow-x-auto md:hidden">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ReceiptText className="mr-1 h-4 w-4" />
                總覽
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/transactions/new">記帳</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/prepayments/new">
                <Wallet className="mr-1 h-4 w-4" />
                預付
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/colleagues">
                <Users className="mr-1 h-4 w-4" />
                同事
              </Link>
            </Button>
          </nav>
        ) : null}
      </div>
    </header>
  )
}
