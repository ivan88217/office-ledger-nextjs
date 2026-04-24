'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { registerAction } from '#/features/auth/actions'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export function RegisterForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await registerAction({ username, email, password })
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.push('/')
      router.refresh()
    })
  }

  return (
    <main className="mx-auto flex min-h-[calc(100svh-7rem)] max-w-md flex-col justify-center gap-6 px-4 py-8 sm:py-10">
      <div className="space-y-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--kicker)]">OfficeLedger</p>
        <h1 className="text-3xl font-semibold tracking-tight">建立辦公室帳務帳號</h1>
      </div>
      <Card className="border-[color:var(--line)] bg-[color:var(--surface-strong)] shadow-[0_20px_50px_rgba(23,58,64,0.08)]">
        <CardHeader>
          <CardTitle>註冊</CardTitle>
          <CardDescription>建立單一辦公室帳務帳號</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="username">使用者名稱</Label>
              <Input
                id="username"
                className="h-12"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                className="h-12"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type="password"
                className="h-12"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? '建立中…' : '建立帳號'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            已有帳號？{' '}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              登入
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
