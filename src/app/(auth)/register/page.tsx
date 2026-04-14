import { redirect } from 'next/navigation'
import { RegisterForm } from '#/app/(auth)/register/page-client'
import { getSessionUser } from '#/features/auth/auth.service'

export default async function RegisterPage() {
  const { user } = await getSessionUser()
  if (user) redirect('/')

  return <RegisterForm />
}
