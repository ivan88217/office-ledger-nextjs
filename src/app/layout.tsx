import type { Metadata, Viewport } from 'next'
import '#/app/globals.css'
import { AppFooter } from '#/components/app/app-footer'
import { AppHeader } from '#/components/app/app-header'
import { MobileBottomNav } from '#/components/app/mobile-bottom-nav'
import { ThemeScript } from '#/components/app/theme-script'
import { getSessionUser } from '#/features/auth/auth.service'

export const metadata: Metadata = {
  title: 'OfficeLedger',
  description: '辦公室分攤記帳',
  manifest: '/manifest.webmanifest',
  applicationName: 'OfficeLedger',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OfficeLedger',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#173a40',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSessionUser()

  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="app-shell bg-background text-foreground flex min-h-screen flex-col font-sans antialiased">
        <AppHeader user={user} />
        <div className="flex-1 pb-[calc(var(--mobile-nav-height)+1.5rem)] md:pb-0">{children}</div>
        <AppFooter />
        {user ? <MobileBottomNav /> : null}
      </body>
    </html>
  )
}
