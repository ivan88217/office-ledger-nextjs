import { redirect } from 'next/navigation'
import { LoginForm } from '#/app/(auth)/login/page-client'
import { getSessionUser } from '#/features/auth/auth.service'

export default async function LoginPage() {
  const { user } = await getSessionUser()
  if (user) redirect('/')

  return <LoginForm />
}
