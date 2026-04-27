'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as authService from '#/features/auth/auth.service'
import { runAction } from '#/lib/server-action/result'

function revalidateLedgerPaths() {
  revalidatePath('/', 'layout')
  revalidatePath('/')
  revalidatePath('/events/new')
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
  return runAction(async () => {
    const result = await authService.registerUser(input)
    revalidateLedgerPaths()
    return result
  })
}

export async function loginAction(input: { email: string; password: string }) {
  return runAction(async () => {
    const result = await authService.loginUser(input)
    revalidateLedgerPaths()
    return result
  })
}

/**
 * 供 <form action={...}> 使用，透過 redirect() 跳轉。
 * redirect() 會丟出 NEXT_REDIRECT，不可被 runAction 吞掉，故維持原寫法。
 */
export async function logoutRedirectAction() {
  await authService.logoutUser()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function logoutAction() {
  return runAction(async () => {
    const result = await authService.logoutUser()
    revalidatePath('/', 'layout')
    return result
  })
}

export async function getPeerLedgerAction(input: { peerId: string }) {
  return runAction(() => authService.getPeerLedger(input))
}

export async function changePasswordAction(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}) {
  return runAction(async () => {
    const result = await authService.changePassword(input)
    revalidatePath('/settings/password')
    return result
  })
}

export async function createColleagueAction(input: {
  username: string
  password: string
  email?: string
}) {
  return runAction(async () => {
    const result = await authService.createColleague(input)
    revalidatePath('/colleagues')
    return result
  })
}

export async function createExpenseTransactionAction(input: {
  title: string
  payerId: string
  finalCents: number
  participants: { userId: string; originalExpression: string; order: number }[]
}) {
  return runAction(async () => {
    const result = await authService.createExpenseTransaction(input)
    revalidateLedgerPaths()
    revalidatePath(`/transactions/${result.transactionId}`)
    return result
  })
}

export async function createDiningEventAction(input: {
  title: string
  payerId: string
}) {
  return runAction(async () => {
    const result = await authService.createDiningEvent(input)
    revalidateLedgerPaths()
    revalidatePath(`/events/${result.eventId}`)
    return result
  })
}

export async function updateDiningEventAction(input: {
  eventId: string
  title: string
  payerId: string
  serviceChargeEnabled: boolean
  serviceChargeRateBps: number
  items: {
    id: string
    name: string
    amountCents: number
    participantUserIds: string[]
    recordedByUserId?: string | null
    order: number
  }[]
}) {
  return runAction(async () => {
    const result = await authService.updateDiningEvent(input)
    revalidateLedgerPaths()
    revalidatePath(`/events/${input.eventId}`)
    return result
  })
}

export async function addDiningEventItemAction(input: {
  eventId: string
  name: string
  amountCents: number
  participantUserIds: string[]
}) {
  return runAction(async () => {
    const result = await authService.addDiningEventItem(input)
    revalidateLedgerPaths()
    revalidatePath(`/events/${input.eventId}`)
    return result
  })
}

export async function deleteDiningEventAction(input: { eventId: string }) {
  return runAction(async () => {
    const result = await authService.deleteDiningEvent(input)
    revalidateLedgerPaths()
    revalidatePath('/events')
    return result
  })
}

export async function finalizeDiningEventAction(input: { eventId: string }) {
  return runAction(async () => {
    const result = await authService.finalizeDiningEvent(input)
    revalidateLedgerPaths()
    revalidatePath(`/events/${input.eventId}`)
    revalidatePath(`/transactions/${result.transactionId}`)
    return result
  })
}

export async function createPrepaymentEntryAction(input: {
  direction: 'PAYER_TO_RECEIVER' | 'RECEIVER_RECORDS_PAYER'
  peerUserId: string
  amountCents: number
}) {
  return runAction(async () => {
    const result = await authService.createPrepaymentEntry(input)
    revalidateLedgerPaths()
    return result
  })
}

export async function confirmPrepaymentRequestAction(input: { requestId: string; peerId?: string }) {
  return runAction(async () => {
    const result = await authService.confirmPrepaymentRequest({ requestId: input.requestId })
    revalidateLedgerPaths()
    if (input.peerId) revalidatePath(`/peers/${input.peerId}`)
    return result
  })
}

export async function createPrepaymentRefundRequestAction(input: {
  peerUserId: string
  amountCents: number
}) {
  return runAction(async () => {
    const result = await authService.createPrepaymentRefundRequest(input)
    revalidateLedgerPaths()
    revalidatePath(`/peers/${input.peerUserId}`)
    return result
  })
}

export async function recordPeerRefundToMeAction(input: {
  peerUserId: string
  amountCents: number
}) {
  return runAction(async () => {
    const result = await authService.recordPeerRefundToMe(input)
    revalidateLedgerPaths()
    revalidatePath(`/peers/${input.peerUserId}`)
    return result
  })
}

export async function createSettlementEntryAction(input: {
  toUserId: string
  amountCents: number
}) {
  return runAction(async () => {
    const result = await authService.createSettlementEntry(input)
    revalidateLedgerPaths()
    revalidatePath(`/peers/${input.toUserId}`)
    return result
  })
}

export async function settlePeerExpenseItemAction(input: {
  peerUserId: string
  debtLogId: string
}) {
  return runAction(async () => {
    const result = await authService.settlePeerExpenseItem(input)
    revalidateLedgerPaths()
    revalidatePath(`/peers/${input.peerUserId}`)
    return result
  })
}

export async function reverseSettlementLogAction(input: {
  logId: string
  peerUserId?: string
}) {
  return runAction(async () => {
    const result = await authService.reverseSettlementLog({ logId: input.logId })
    revalidateLedgerPaths()
    if (input.peerUserId) {
      revalidatePath(`/peers/${input.peerUserId}`)
    }
    return result
  })
}

export async function settleTransactionParticipantAction(input: {
  transactionId: string
  participantUserId: string
}) {
  return runAction(async () => {
    const result = await authService.settleTransactionParticipant(input)
    revalidateLedgerPaths()
    revalidatePath(`/transactions/${input.transactionId}`)
    return result
  })
}
