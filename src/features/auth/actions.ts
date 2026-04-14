'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as authService from '#/features/auth/auth.service'

function revalidateLedgerPaths() {
  revalidatePath('/', 'layout')
  revalidatePath('/')
  revalidatePath('/transactions/new')
  revalidatePath('/prepayments/new')
  revalidatePath('/settlements/new')
  revalidatePath('/colleagues')
}

export async function registerAction(input: {
  username: string
  email: string
  password: string
}) {
  const result = await authService.registerUser(input)
  revalidateLedgerPaths()
  return result
}

export async function loginAction(input: { email: string; password: string }) {
  const result = await authService.loginUser(input)
  revalidateLedgerPaths()
  return result
}

export async function logoutRedirectAction() {
  await authService.logoutUser()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function logoutAction() {
  const result = await authService.logoutUser()
  revalidatePath('/', 'layout')
  return result
}

export async function getPeerLedgerAction(input: { peerId: string }) {
  return authService.getPeerLedger(input)
}

export async function changePasswordAction(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}) {
  const result = await authService.changePassword(input)
  revalidatePath('/settings/password')
  return result
}

export async function createColleagueAction(input: {
  username: string
  password: string
  email?: string
}) {
  const result = await authService.createColleague(input)
  revalidatePath('/colleagues')
  return result
}

export async function createExpenseTransactionAction(input: {
  title: string
  payerId: string
  finalCents: number
  participants: { userId: string; originalExpression: string; order: number }[]
}) {
  const result = await authService.createExpenseTransaction(input)
  revalidateLedgerPaths()
  revalidatePath(`/transactions/${result.transactionId}`)
  return result
}

export async function createPrepaymentEntryAction(input: {
  direction: 'PAYER_TO_RECEIVER' | 'RECEIVER_RECORDS_PAYER'
  peerUserId: string
  amountCents: number
}) {
  const result = await authService.createPrepaymentEntry(input)
  revalidateLedgerPaths()
  return result
}

export async function confirmPrepaymentRequestAction(input: { requestId: string; peerId?: string }) {
  const result = await authService.confirmPrepaymentRequest({ requestId: input.requestId })
  revalidateLedgerPaths()
  if (input.peerId) revalidatePath(`/peers/${input.peerId}`)
  return result
}

export async function createPrepaymentRefundRequestAction(input: {
  peerUserId: string
  amountCents: number
}) {
  const result = await authService.createPrepaymentRefundRequest(input)
  revalidateLedgerPaths()
  revalidatePath(`/peers/${input.peerUserId}`)
  return result
}

export async function recordPeerRefundToMeAction(input: {
  peerUserId: string
  amountCents: number
}) {
  const result = await authService.recordPeerRefundToMe(input)
  revalidateLedgerPaths()
  revalidatePath(`/peers/${input.peerUserId}`)
  return result
}

export async function createSettlementEntryAction(input: {
  toUserId: string
  amountCents: number
}) {
  const result = await authService.createSettlementEntry(input)
  revalidateLedgerPaths()
  revalidatePath(`/peers/${input.toUserId}`)
  return result
}

export async function settlePeerExpenseItemAction(input: {
  peerUserId: string
  debtLogId: string
}) {
  const result = await authService.settlePeerExpenseItem(input)
  revalidateLedgerPaths()
  revalidatePath(`/peers/${input.peerUserId}`)
  return result
}

export async function settleTransactionParticipantAction(input: {
  transactionId: string
  participantUserId: string
}) {
  const result = await authService.settleTransactionParticipant(input)
  revalidateLedgerPaths()
  revalidatePath(`/transactions/${input.transactionId}`)
  return result
}
