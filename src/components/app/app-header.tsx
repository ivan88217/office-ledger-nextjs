import Link from 'next/link'
import { KeyRound, LogOut } from 'lucide-react'
import { logoutRedirectAction } from '#/features/auth/actions'
import { PwaInstallController } from '#/components/app/pwa-install-controller'
import { ThemeSwitcher } from '#/components/app/theme-switcher'
import { Button } from '#/components/ui/button'

const desktopNav = [
  { href: '/', label: '總覽' },
  { href: '/events', label: '活動' },
  { href: '/transactions/new', label: '記帳' },
  { href: '/prepayments/new', label: '預付款' },
  { href: '/colleagues', label: '同事' },
]

export function AppHeader({
  user,
}: {
  user: null | { id: string; username: string; email: string }
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-[color:var(--header-bg)]/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-3 font-semibold tracking-tight text-foreground">
          <img
            src="/office-ledger-logo.png"
            alt="OfficeLedger"
            width={32}
            height={32}
            className="h-9 w-9 rounded-xl object-cover ring-1 ring-border"
          />
          <div className="min-w-0">
            <span className="block text-sm sm:text-base">OfficeLedger</span>
            <span className="hidden text-xs font-medium text-[color:var(--sea-ink-soft)] sm:block">
              辦公室帳務
            </span>
          </div>
        </Link>

        {user ? (
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {desktopNav.map((item) => (
              <Button key={item.href} variant="ghost" size="sm" asChild>
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <PwaInstallController />
          <ThemeSwitcher />
          {user ? (
            <>
              <div className="hidden rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1 text-sm text-muted-foreground lg:block">
                {user.username}
              </div>
              <Button variant="outline" size="sm" className="hidden sm:inline-flex" asChild>
                <Link href="/settings/password">
                  <KeyRound className="mr-2 h-4 w-4" />
                  更換密碼
                </Link>
              </Button>
              <form action={logoutRedirectAction}>
                <Button variant="outline" size="sm" type="submit" className="h-10 rounded-xl px-3">
                  <LogOut className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">登出</span>
                </Button>
              </form>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href="/login">登入</Link>
            </Button>
          )}
        </div>

        {user ? <div className="absolute inset-x-0 bottom-0 border-b border-[color:var(--line)] md:hidden" /> : null}
      </div>
    </header>
  )
}
