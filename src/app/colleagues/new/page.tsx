import { redirect } from 'next/navigation'
import { NewColleagueForm } from '#/app/colleagues/new/page-client'
import { getSessionUser } from '#/features/auth/auth.service'

export default async function NewColleaguePage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  return <NewColleagueForm />
}
