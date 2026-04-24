'use client'

import Link from 'next/link'
import { ReceiptText, Users, Wallet } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '#/lib/utils'

const items = [
  { href: '/', label: '總覽', icon: ReceiptText, match: (pathname: string) => pathname === '/' },
  {
    href: '/transactions/new',
    label: '記帳',
    icon: ReceiptText,
    match: (pathname: string) => pathname.startsWith('/transactions'),
  },
  {
    href: '/prepayments/new',
    label: '預付',
    icon: Wallet,
    match: (pathname: string) => pathname.startsWith('/prepayments'),
  },
  {
    href: '/colleagues',
    label: '同事',
    icon: Users,
    match: (pathname: string) => pathname.startsWith('/colleagues') || pathname.startsWith('/peers'),
  },
]

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="mobile-bottom-nav md:hidden">
      {items.map((item) => {
        const active = item.match(pathname)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'mobile-bottom-nav__item',
              active && 'mobile-bottom-nav__item--active',
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
