import type { Metadata } from 'next'
import '#/app/globals.css'
import { AppFooter } from '#/components/app/app-footer'
import { AppHeader } from '#/components/app/app-header'
import { getSessionUser } from '#/features/auth/auth.service'

export const metadata: Metadata = {
  title: 'OfficeLedger',
  description: '辦公室分攤記帳',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSessionUser()

  return (
    <html lang="zh-Hant">
      <body className="bg-background text-foreground flex min-h-screen flex-col font-sans antialiased">
        <AppHeader user={user} />
        <div className="flex-1">{children}</div>
        <AppFooter />
      </body>
    </html>
  )
}
