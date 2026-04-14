import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '#/lib/db/prisma'
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SEC } from '#/features/auth/session-constants'

function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true as const,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  }
}

export async function resolveSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date()) {
    return null
  }

  return session.userId
}

export async function getOptionalSessionUser() {
  const userId = await resolveSessionUserId()
  if (!userId) {
    return null as null | { id: string; username: string; email: string }
  }

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true },
  })
}

export async function requireSessionUser() {
  const user = await getOptionalSessionUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000)

  await prisma.session.create({
    data: { token, userId, expiresAt },
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions())
}

export async function destroySession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (token) {
    await prisma.session.deleteMany({ where: { token } })
  }

  cookieStore.delete(SESSION_COOKIE_NAME)
}
