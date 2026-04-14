import { redirect } from 'next/navigation'
import { ChangePasswordForm } from '#/app/settings/password/page-client'
import { getSessionUser } from '#/features/auth/auth.service'

export default async function ChangePasswordPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  return <ChangePasswordForm />
}
