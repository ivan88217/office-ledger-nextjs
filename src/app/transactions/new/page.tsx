import { redirect } from 'next/navigation'
import { NewTransactionForm } from '#/app/transactions/new/page-client'
import { getSessionUser, listUsersForSelect } from '#/features/auth/auth.service'

export default async function NewTransactionPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const data = await listUsersForSelect()
  return <NewTransactionForm users={data.users} currentUserId={data.currentUserId} />
}
