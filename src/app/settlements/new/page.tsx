import { redirect } from 'next/navigation'
import { NewSettlementForm } from '#/app/settlements/new/page-client'
import { getSessionUser, listUsersForSelect } from '#/features/auth/auth.service'

export default async function NewSettlementPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const data = await listUsersForSelect()
  return <NewSettlementForm users={data.users} currentUserId={data.currentUserId} />
}
