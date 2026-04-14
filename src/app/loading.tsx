'use client'

import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card'

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-10 pb-12 flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-muted animate-pulse" />
            <Loader2 className="h-8 w-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
          </div>

          <div className="space-y-2 text-center">
            <h3 className="text-xl font-semibold tracking-tight">載入中</h3>
            <p className="text-sm text-muted-foreground">
              正在讀取資料...
            </p>
          </div>

          {/* 進度條模擬 */}
          <div className="w-full max-w-[180px] h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-primary rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
          </div>

          <p className="text-[10px] text-muted-foreground font-mono">
            OFFICE LEDGER
          </p>
        </CardContent>
      </Card>
    </div>
  )
}