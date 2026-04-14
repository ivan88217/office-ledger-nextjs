import { redirect } from 'next/navigation'
import { NewPrepaymentForm } from '#/app/prepayments/new/page-client'
import { getSessionUser, listUsersForSelect } from '#/features/auth/auth.service'

export default async function NewPrepaymentPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const data = await listUsersForSelect()
  return <NewPrepaymentForm users={data.users} currentUserId={data.currentUserId} />
}
