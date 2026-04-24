import Link from 'next/link'
import { WifiOff } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'

export const metadata = {
  title: '離線模式',
}

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-lg items-center px-4 py-10">
      <Card className="w-full border-[color:var(--line)] bg-[color:var(--surface-strong)] shadow-lg shadow-[rgba(23,58,64,0.08)] backdrop-blur">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--sea-ink)]/8 text-[color:var(--sea-ink)]">
            <WifiOff className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">目前處於離線狀態</CardTitle>
            <CardDescription className="text-sm leading-6">
              App shell 與基礎導覽仍可開啟，但帳務資料需要連線後才能同步最新內容。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="h-12 w-full">
            <Link href="/">回到首頁</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            若你已重新連上網路，重新整理頁面即可恢復正常操作。
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
