import { redirect } from 'next/navigation'
import { NewDiningEventForm } from '#/app/events/new/page-client'
import { getSessionUser, listUsersForSelect } from '#/features/auth/auth.service'

export default async function NewDiningEventPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  const data = await listUsersForSelect()
  return <NewDiningEventForm users={data.users} currentUserId={data.currentUserId} />
}
