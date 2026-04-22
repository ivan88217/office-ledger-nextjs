'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { createColleagueAction } from '#/features/auth/actions'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export function NewColleagueForm() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<null | {
    username: string
    email: string
    emailWasGenerated: boolean
  }>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      try {
        const result = await createColleagueAction({
          username,
          password,
          email: email.trim() || undefined,
        })
        setSuccess({
          username: result.username,
          email: result.email,
          emailWasGenerated: result.emailWasGenerated,
        })
        setUsername('')
        setEmail('')
        setPassword('')
      } catch (err) {
        setError(err instanceof Error ? err.message : '建立失敗')
      }
    })
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black">新增同事</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            建立後請把登入 Email 與密碼交給對方，我們不會再次顯示密碼。
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/colleagues">返回列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>帳號內容</CardTitle>
          <CardDescription>Email 可留空，系統會產生占位地址。</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <Alert className="border-green-600/50 bg-green-50/50">
              <AlertTitle>已建立</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>名稱：{success.username}</p>
                <p className="break-all">
                  登入 Email：<code>{success.email}</code>
                </p>
                {success.emailWasGenerated ? (
                  <p className="text-xs text-muted-foreground">
                    此為系統產生的信箱，僅供登入帳號使用，請務必提供給同事。
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" variant="secondary" asChild>
                    <Link href="/colleagues">回到同事列表</Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setSuccess(null)}>
                    再新增一位
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="username">顯示名稱 / 使用者名稱</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="例如：王小明"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email（選填）</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="若已知同事信箱可填；留空則自動產生"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">初始密碼</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  required
                />
                <p className="text-xs text-muted-foreground">至少 6 字元，請另以安全管道告知同事。</p>
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? '建立中…' : '建立帳號'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
