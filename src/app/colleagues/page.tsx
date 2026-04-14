import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSessionUser, listOfficeColleagues } from '#/features/auth/auth.service'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'

export default async function ColleaguesPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const { colleagues } = await listOfficeColleagues()

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">同事</h1>
          <p className="mt-1 text-sm text-muted-foreground">可預先建立帳號，不必等對方自行註冊。</p>
        </div>
        <Button asChild>
          <Link href="/colleagues/new">
            <UserPlus className="mr-2 h-4 w-4" />
            新增同事
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>所有人員</CardTitle>
          <CardDescription>分攤、預付、還款下拉選單會使用此名單</CardDescription>
        </CardHeader>
        <CardContent>
          {colleagues.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無使用者。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>登入 Email</TableHead>
                  <TableHead className="text-right">建立時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colleagues.map((colleague) => (
                  <TableRow key={colleague.id}>
                    <TableCell className="font-medium">{colleague.username}</TableCell>
                    <TableCell className="max-w-[280px] truncate font-mono text-sm text-muted-foreground">
                      {colleague.email}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {new Date(colleague.createdAt).toLocaleString('zh-TW')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
