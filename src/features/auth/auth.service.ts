import bcrypt from 'bcryptjs'
import { DiningEventStatus, PrepaymentRequestKind, PrepaymentRequestStatus } from '@prisma/client'
import { prisma } from '#/lib/db/prisma'
import { validatePasswordChangeInput } from '#/features/auth/change-password'
import {
  createSession,
  destroySession,
  getOptionalSessionUser,
  requireSessionUser,
  resolveSessionUserId,
} from '#/features/auth/session'
import { computeAllocations } from '#/features/ledger/domain/allocation'
import {
  computeDiningEventAllocation,
  type DiningEventItemInput,
} from '#/features/ledger/domain/dining-event'
import {
  getRemainingTransactionDebtCents,
  reconcileReceivableExpenseItems,
  summarizePairLedger,
} from '#/features/ledger/domain/ledger-state'
import { parseAdditionExpressionToCents } from '#/features/ledger/domain/parse-addition'
import {
  applyExpenseDebtForParticipant,
  applyPrepayment,
  applyPrepaymentRefund,
  applySettlement,
  applySettlementReversal,
} from '#/features/ledger/server/ledger.service.server'
import { yuanToCents } from '#/lib/money/dollars'

export async function getSessionUser() {
  return { user: await getOptionalSessionUser() }
}

export async function registerUser(input: {
  username: string
  email: string
  password: string
}) {
  const username = input.username.trim()
  const email = input.email.trim().toLowerCase()

  if (username.length < 2) throw new Error('使用者名稱至少 2 字元')
  if (!email.includes('@')) throw new Error('請輸入有效 Email')
  if (input.password.length < 6) throw new Error('密碼至少 6 字元')

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })
  if (exists) throw new Error('此 Email 或使用者名稱已被使用')

  const passwordHash = await bcrypt.hash(input.password, 10)
  const user = await prisma.user.create({
    data: { username, email, passwordHash },
  })

  await createSession(user.id)

  return { ok: true as const, userId: user.id }
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('帳號或密碼錯誤')

  const ok = await bcrypt.compare(input.password, user.passwordHash)
  if (!ok) throw new Error('帳號或密碼錯誤')

  await createSession(user.id)

  return { ok: true as const, userId: user.id }
}

export async function logoutUser() {
  await destroySession()
  return { ok: true as const }
}

export async function changePassword(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  validatePasswordChangeInput(input)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  })
  if (!user) throw new Error('找不到使用者')

  const currentPasswordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash)
  if (!currentPasswordMatches) throw new Error('目前密碼錯誤')

  const newPasswordHash = await bcrypt.hash(input.newPassword, 10)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newPasswordHash },
  })

  return { ok: true as const }
}

export async function listUsersForSelect() {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    select: { id: true, username: true },
  })

  return { users, currentUserId: userId }
}

export async function createColleague(input: {
  username: string
  password: string
  email?: string
}) {
  const sessionUserId = await resolveSessionUserId()
  if (!sessionUserId) throw new Error('請先登入')

  const username = input.username.trim()
  if (username.length < 2) throw new Error('使用者名稱至少 2 字元')
  if (input.password.length < 6) throw new Error('初始密碼至少 6 字元')

  let email = (input.email ?? '').trim().toLowerCase()
  if (email && !email.includes('@')) throw new Error('請輸入有效 Email')

  if (!email) {
    for (let i = 0; i < 24; i++) {
      const candidate = `pending.${crypto.randomUUID().replaceAll('-', '')}@colleagues.office-ledger`
      const taken = await prisma.user.findUnique({ where: { email: candidate } })
      if (!taken) {
        email = candidate
        break
      }
    }
    if (!email) throw new Error('無法產生占位信箱，請稍後再試')
  }

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })
  if (exists) throw new Error('此 Email 或使用者名稱已被使用')

  const passwordHash = await bcrypt.hash(input.password, 10)
  const user = await prisma.user.create({
    data: { username, email, passwordHash },
  })

  return {
    ok: true as const,
    userId: user.id,
    username: user.username,
    email: user.email,
    emailWasGenerated: !input.email?.trim(),
  }
}

export async function listOfficeColleagues() {
  await requireSessionUser()
  const colleagues = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    select: { id: true, username: true, email: true, createdAt: true },
  })
  return { colleagues }
}

export async function getDiningEventDetail(input: { eventId: string }) {
  const currentUserId = await resolveSessionUserId()
  if (!currentUserId) throw new Error('請先登入')

  const event = await prisma.diningEvent.findUnique({
    where: { id: input.eventId },
    include: {
      payer: { select: { username: true } },
    },
  })
  if (!event) throw new Error('找不到活動')

  const participantUserIds = event.items.flatMap((item) => item.participantUserIds)
  const recorderUserIds = event.items.flatMap((item) =>
    item.recordedByUserId ? [item.recordedByUserId] : [],
  )
  const involvedUserIds = [...new Set([event.payerId, ...participantUserIds, ...recorderUserIds])]
  const users = await prisma.user.findMany({
    where: { id: { in: involvedUserIds } },
    select: { id: true, username: true },
  })
  const finalizedTransaction = event.finalizedTransactionId
    ? await prisma.transaction.findUnique({
        where: { id: event.finalizedTransactionId },
        select: { id: true, title: true },
      })
    : null
  const usernameById = new Map(users.map((user) => [user.id, user.username]))

  const allocation =
    event.items.length > 0
      ? computeDiningEventAllocation({
          items: event.items,
          serviceChargeEnabled: event.serviceChargeEnabled,
          serviceChargeRateBps: event.serviceChargeRateBps,
        })
      : {
          subtotalCents: 0,
          serviceChargeCents: 0,
          totalCents: 0,
          users: [],
        }

  return {
    id: event.id,
    title: event.title,
    payerId: event.payerId,
    payerUsername: event.payer.username,
    serviceChargeEnabled: event.serviceChargeEnabled,
    serviceChargeRateBps: event.serviceChargeRateBps,
    status: event.status,
    finalizedTransactionId: event.finalizedTransactionId,
    finalizedTransactionTitle: finalizedTransaction?.title ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    currentUserId,
    items: event.items
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        id: item.id,
        name: item.name,
        amountCents: item.amountCents,
        participantUserIds: item.participantUserIds,
        recordedByUserId: item.recordedByUserId,
        recordedByUsername: item.recordedByUserId
          ? usernameById.get(item.recordedByUserId) ?? item.recordedByUserId
          : null,
        participantUsernames: item.participantUserIds.map(
          (userId) => usernameById.get(userId) ?? userId,
        ),
        order: item.order,
      })),
    allocation: {
      subtotalCents: allocation.subtotalCents,
      serviceChargeCents: allocation.serviceChargeCents,
      totalCents: allocation.totalCents,
      users: allocation.users.map((summary) => ({
        ...summary,
        username: usernameById.get(summary.userId) ?? summary.userId,
      })),
    },
  }
}

export async function listDiningEvents() {
  const currentUserId = await resolveSessionUserId()
  if (!currentUserId) throw new Error('請先登入')

  const events = await prisma.diningEvent.findMany({
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 60,
    include: {
      payer: { select: { username: true } },
    },
  })

  const participantUserIds = events.flatMap((event) =>
    event.items.flatMap((item) => item.participantUserIds),
  )
  const users = participantUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: [...new Set(participantUserIds)] } },
        select: { id: true, username: true },
      })
    : []
  const usernameById = new Map(users.map((user) => [user.id, user.username]))

  return {
    currentUserId,
    events: events.map((event) => {
      const allocation =
        event.items.length > 0
          ? computeDiningEventAllocation({
              items: event.items,
              serviceChargeEnabled: event.serviceChargeEnabled,
              serviceChargeRateBps: event.serviceChargeRateBps,
            })
          : null
      const participantIds = [...new Set(event.items.flatMap((item) => item.participantUserIds))]

      return {
        id: event.id,
        title: event.title,
        payerId: event.payerId,
        payerUsername: event.payer.username,
        status: event.status,
        itemCount: event.items.length,
        participantCount: participantIds.length,
        participantUsernames: participantIds
          .map((userId) => usernameById.get(userId) ?? userId)
          .sort((a, b) => a.localeCompare(b)),
        totalCents: allocation?.totalCents ?? 0,
        updatedAt: event.updatedAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
      }
    }),
  }
}

export async function createExpenseTransaction(input: {
  title: string
  payerId: string
  finalCents: number
  participants: { userId: string; originalExpression: string; order: number }[]
}) {
  await requireSessionUser()

  const title = input.title.trim()
  if (!title) throw new Error('請輸入交易標題')

  const payerExists = await prisma.user.findUnique({ where: { id: input.payerId } })
  if (!payerExists) throw new Error('付款人不存在')

  const parsed = input.participants.map((participant) => ({
    userId: participant.userId,
    originalCents: yuanToCents(parseAdditionExpressionToCents(participant.originalExpression)),
    order: participant.order,
  }))

  const allocations = computeAllocations({
    finalCents: input.finalCents,
    participants: parsed,
  })

  const tx = await prisma.$transaction(async (ptx) => {
    const transaction = await ptx.transaction.create({
      data: {
        title,
        payerId: input.payerId,
        finalCents: input.finalCents,
        participants: allocations.map((allocation) => ({
          userId: allocation.userId,
          originalCents: allocation.originalCents,
          allocatedCents: allocation.allocatedCents,
        })),
      },
    })

    for (const allocation of allocations) {
      if (allocation.userId === input.payerId || allocation.allocatedCents <= 0) continue

      await applyExpenseDebtForParticipant(ptx, {
        debtorId: allocation.userId,
        creditorId: input.payerId,
        debtCents: allocation.allocatedCents,
        transactionId: transaction.id,
      })
    }

    return transaction
  })

  return { ok: true as const, transactionId: tx.id }
}

function normalizeDiningEventTitle(title: string) {
  const normalized = title.trim()
  if (!normalized) throw new Error('請輸入活動名稱')
  if (normalized.length > 80) throw new Error('活動名稱不可超過 80 字')
  return normalized
}

function normalizeServiceChargeRateBps(rate: number) {
  if (!Number.isInteger(rate) || rate < 0 || rate > 100000) {
    throw new Error('服務費比例必須介於 0% 到 1000%')
  }
  return rate
}

function normalizeDiningEventItems(items: DiningEventItemInput[]) {
  return items.map((item, index) => ({
    id: item.id.trim() || crypto.randomUUID(),
    name: item.name.trim(),
    amountCents: item.amountCents,
    participantUserIds: item.participantUserIds,
    recordedByUserId: item.recordedByUserId ?? null,
    order: item.order ?? index,
  }))
}

async function validateDiningEventUsers(params: {
  payerId: string
  participantUserIds: string[]
}) {
  const userIds = [...new Set([params.payerId, ...params.participantUserIds])]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  })
  if (users.length !== userIds.length) throw new Error('活動包含不存在的使用者')
}

export async function createDiningEvent(input: { title: string; payerId: string }) {
  await requireSessionUser()

  const title = normalizeDiningEventTitle(input.title)
  await validateDiningEventUsers({ payerId: input.payerId, participantUserIds: [] })

  const event = await prisma.diningEvent.create({
    data: {
      title,
      payerId: input.payerId,
      serviceChargeEnabled: true,
      serviceChargeRateBps: 1000,
      status: DiningEventStatus.DRAFT,
      items: [],
    },
  })

  return { ok: true as const, eventId: event.id }
}

export async function updateDiningEvent(input: {
  eventId: string
  title: string
  payerId: string
  serviceChargeEnabled: boolean
  serviceChargeRateBps: number
  items: DiningEventItemInput[]
}) {
  await requireSessionUser()

  const title = normalizeDiningEventTitle(input.title)
  const serviceChargeRateBps = normalizeServiceChargeRateBps(input.serviceChargeRateBps)
  const items = normalizeDiningEventItems(input.items)

  if (items.length > 0) {
    computeDiningEventAllocation({
      items,
      serviceChargeEnabled: input.serviceChargeEnabled,
      serviceChargeRateBps,
    })
  }

  await validateDiningEventUsers({
    payerId: input.payerId,
    participantUserIds: items.flatMap((item) => item.participantUserIds),
  })

  const event = await prisma.diningEvent.findUnique({ where: { id: input.eventId } })
  if (!event) throw new Error('找不到活動')
  if (event.status !== DiningEventStatus.DRAFT) throw new Error('活動已結算，不能再編輯')

  await prisma.diningEvent.update({
    where: { id: input.eventId },
    data: {
      title,
      payerId: input.payerId,
      serviceChargeEnabled: input.serviceChargeEnabled,
      serviceChargeRateBps,
      items,
    },
  })

  return { ok: true as const, eventId: input.eventId }
}

export async function addDiningEventItem(input: {
  eventId: string
  name: string
  amountCents: number
  participantUserIds: string[]
}) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  const event = await prisma.diningEvent.findUnique({ where: { id: input.eventId } })
  if (!event) throw new Error('找不到活動')
  if (event.status !== DiningEventStatus.DRAFT) throw new Error('活動已結算，不能再新增品項')

  const item = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    amountCents: input.amountCents,
    participantUserIds: input.participantUserIds,
    recordedByUserId: userId,
    order: event.items.length,
  }

  computeDiningEventAllocation({
    items: [item],
    serviceChargeEnabled: false,
    serviceChargeRateBps: 0,
  })
  await validateDiningEventUsers({
    payerId: event.payerId,
    participantUserIds: [...input.participantUserIds, userId],
  })

  await prisma.diningEvent.update({
    where: { id: input.eventId },
    data: { items: [...event.items, item] },
  })

  return { ok: true as const, eventId: input.eventId, itemId: item.id }
}

export async function deleteDiningEvent(input: { eventId: string }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  const event = await prisma.diningEvent.findUnique({ where: { id: input.eventId } })
  if (!event) throw new Error('找不到活動')
  if (event.status !== DiningEventStatus.DRAFT) throw new Error('已結算活動不能刪除')
  if (event.payerId !== userId) throw new Error('只有付款人可刪除活動')

  await prisma.diningEvent.delete({ where: { id: input.eventId } })

  return { ok: true as const }
}

export async function finalizeDiningEvent(input: { eventId: string }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  const transaction = await prisma.$transaction(async (ptx) => {
    const event = await ptx.diningEvent.findUnique({ where: { id: input.eventId } })
    if (!event) throw new Error('找不到活動')
    if (event.status !== DiningEventStatus.DRAFT) throw new Error('活動已結算')
    if (event.finalizedTransactionId) throw new Error('活動已建立正式交易')
    if (event.payerId !== userId) throw new Error('只有付款人可結算活動')

    const allocation = computeDiningEventAllocation({
      items: event.items,
      serviceChargeEnabled: event.serviceChargeEnabled,
      serviceChargeRateBps: event.serviceChargeRateBps,
    })

    const participantUserIds = allocation.users.map((summary) => summary.userId)
    const knownUsers = await ptx.user.findMany({
      where: { id: { in: [...new Set([...participantUserIds, event.payerId])] } },
      select: { id: true },
    })
    if (knownUsers.length !== new Set([...participantUserIds, event.payerId]).size) {
      throw new Error('活動包含不存在的使用者')
    }

    const tx = await ptx.transaction.create({
      data: {
        title: event.title,
        payerId: event.payerId,
        finalCents: allocation.totalCents,
        participants: allocation.users.map((summary) => ({
          userId: summary.userId,
          originalCents: summary.subtotalCents,
          allocatedCents: summary.totalCents,
        })),
      },
    })

    for (const summary of allocation.users) {
      if (summary.userId === event.payerId || summary.totalCents <= 0) continue
      await applyExpenseDebtForParticipant(ptx, {
        debtorId: summary.userId,
        creditorId: event.payerId,
        debtCents: summary.totalCents,
        transactionId: tx.id,
      })
    }

    await ptx.diningEvent.update({
      where: { id: event.id },
      data: {
        status: DiningEventStatus.FINALIZED,
        finalizedTransactionId: tx.id,
      },
    })

    return tx
  })

  return { ok: true as const, transactionId: transaction.id }
}

export async function createPrepaymentEntry(input: {
  direction: 'PAYER_TO_RECEIVER' | 'RECEIVER_RECORDS_PAYER'
  peerUserId: string
  amountCents: number
}) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')
  if (input.peerUserId === userId) throw new Error('對象不可為自己')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('金額必須為正整數（分）')
  }

  const peer = await prisma.user.findUnique({ where: { id: input.peerUserId } })
  if (!peer) throw new Error('對象不存在')

  const fromUserId = input.direction === 'PAYER_TO_RECEIVER' ? userId : input.peerUserId
  const toUserId = input.direction === 'PAYER_TO_RECEIVER' ? input.peerUserId : userId

  await prisma.$transaction(async (ptx) => {
    if (input.direction === 'RECEIVER_RECORDS_PAYER') {
      await applyPrepayment(ptx, {
        fromUserId,
        toUserId,
        amountCents: input.amountCents,
      })
      return
    }

    await ptx.prepaymentRequest.create({
      data: {
        fromUserId,
        toUserId,
        amountCents: input.amountCents,
        createdByUserId: userId,
        kind: PrepaymentRequestKind.PREPAYMENT,
        status: PrepaymentRequestStatus.PENDING,
      },
    })
  })

  return {
    ok: true as const,
    requiresConfirmation: input.direction === 'PAYER_TO_RECEIVER',
  }
}

export async function confirmPrepaymentRequest(input: { requestId: string }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  await prisma.$transaction(async (ptx) => {
    const request = await ptx.prepaymentRequest.findUnique({
      where: { id: input.requestId },
    })
    if (!request) throw new Error('找不到待確認預付款')
    if (request.toUserId !== userId) throw new Error('你無權確認此預付款')
    if (request.status !== PrepaymentRequestStatus.PENDING) {
      throw new Error('此預付款已處理')
    }

    if (request.kind === PrepaymentRequestKind.PREPAYMENT) {
      await applyPrepayment(ptx, {
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        amountCents: request.amountCents,
      })
    } else {
      await applyPrepaymentRefund(ptx, {
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        amountCents: request.amountCents,
      })
    }

    await ptx.prepaymentRequest.update({
      where: { id: request.id },
      data: { status: PrepaymentRequestStatus.CONFIRMED, confirmedAt: new Date() },
    })
  })

  return { ok: true as const }
}

export async function createPrepaymentRefundRequest(input: {
  peerUserId: string
  amountCents: number
}) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')
  if (input.peerUserId === userId) throw new Error('對象不可為自己')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('金額必須為正整數（分）')
  }

  const peer = await prisma.user.findUnique({ where: { id: input.peerUserId } })
  if (!peer) throw new Error('對象不存在')

  await prisma.$transaction(async (ptx) => {
    const pairLogs = await ptx.paymentLog.findMany({
      where: {
        OR: [
          { fromUserId: userId, toUserId: input.peerUserId },
          { fromUserId: input.peerUserId, toUserId: userId },
        ],
      },
      select: {
        id: true,
        fromUserId: true,
        toUserId: true,
        type: true,
        amountCents: true,
        transactionId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    const pairSummary = summarizePairLedger({
      userId,
      peerId: input.peerUserId,
      logs: pairLogs,
    })
    const pendingOutgoingRefunds = await ptx.prepaymentRequest.findMany({
      where: {
        fromUserId: userId,
        toUserId: input.peerUserId,
        kind: PrepaymentRequestKind.REFUND,
        status: PrepaymentRequestStatus.PENDING,
      },
      select: { amountCents: true },
    })
    const pendingReservedCents = pendingOutgoingRefunds.reduce((sum, row) => sum + row.amountCents, 0)
    const refundable = Math.max(0, pairSummary.peerPrepaymentBalanceCents - pendingReservedCents)
    if (refundable < input.amountCents) {
      throw new Error('返還金額超過對方已預付給你的餘額')
    }

    await ptx.prepaymentRequest.create({
      data: {
        fromUserId: userId,
        toUserId: input.peerUserId,
        amountCents: input.amountCents,
        kind: PrepaymentRequestKind.REFUND,
        createdByUserId: userId,
        status: PrepaymentRequestStatus.PENDING,
      },
    })
  })

  return { ok: true as const }
}

export async function recordPeerRefundToMe(input: { peerUserId: string; amountCents: number }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')
  if (input.peerUserId === userId) throw new Error('對象不可為自己')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('金額必須為正整數（分）')
  }

  const peer = await prisma.user.findUnique({ where: { id: input.peerUserId } })
  if (!peer) throw new Error('對象不存在')

  await prisma.$transaction(async (ptx) => {
    await applyPrepaymentRefund(ptx, {
      fromUserId: input.peerUserId,
      toUserId: userId,
      amountCents: input.amountCents,
    })
  })

  return { ok: true as const }
}

export async function createSettlementEntry(input: { toUserId: string; amountCents: number }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')
  if (input.toUserId === userId) throw new Error('還款對象不可為自己')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('金額必須為正整數（分）')
  }

  await prisma.$transaction(async (ptx) => {
    await applySettlement(ptx, {
      fromUserId: userId,
      toUserId: input.toUserId,
      amountCents: input.amountCents,
    })
  })

  return { ok: true as const }
}

export async function settlePeerExpenseItem(input: { peerUserId: string; debtLogId: string }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')
  if (input.peerUserId === userId) throw new Error('對象不可為自己')

  await prisma.$transaction(async (ptx) => {
    const logs = await ptx.paymentLog.findMany({
      where: {
        fromUserId: input.peerUserId,
        toUserId: userId,
        type: { in: ['EXPENSE_DEBT', 'SETTLEMENT', 'EXPENSE_PREPAY_APPLY', 'SETTLEMENT_REVERSAL'] },
      },
      orderBy: { createdAt: 'asc' },
    })
    const reconciled = reconcileReceivableExpenseItems({
      debtorId: input.peerUserId,
      creditorId: userId,
      logs,
    })
    const targetItem = reconciled.find((item) => item.debtLogId === input.debtLogId)
    if (!targetItem || targetItem.remainingCents <= 0) {
      throw new Error('此款項已無需銷帳')
    }

    await applySettlement(ptx, {
      fromUserId: input.peerUserId,
      toUserId: userId,
      amountCents: targetItem.remainingCents,
      transactionId: targetItem.transactionId ?? null,
    })
  })

  return { ok: true as const }
}

export async function reverseSettlementLog(input: { logId: string }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  const log = await prisma.paymentLog.findUnique({ where: { id: input.logId } })
  if (!log) throw new Error('找不到此紀錄')
  if (log.fromUserId !== userId && log.toUserId !== userId) {
    throw new Error('無權沖銷此紀錄')
  }
  if (log.type !== 'SETTLEMENT') {
    throw new Error('僅能沖銷銷帳類紀錄')
  }
  // 預付款自動沖抵產生的 SETTLEMENT 與 PREPAYMENT 綁在一起，不適合單獨沖銷
  if (log.note === '預付款沖抵消費欠款') {
    throw new Error('此筆為預付款自動沖抵，請改沖銷對應的預付款紀錄')
  }

  await prisma.$transaction(async (ptx) => {
    await applySettlementReversal(ptx, { originalLogId: input.logId })
  })

  return { ok: true as const }
}

export async function settleTransactionParticipant(input: {
  transactionId: string
  participantUserId: string
}) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  await prisma.$transaction(async (ptx) => {
    const tx = await ptx.transaction.findUnique({
      where: { id: input.transactionId },
    })
    if (!tx) throw new Error('找不到交易')
    if (tx.payerId !== userId) throw new Error('只有付款人可在此銷帳')
    if (input.participantUserId === tx.payerId) throw new Error('付款人本身不可銷帳')

    const participant = tx.participants.find((row) => row.userId === input.participantUserId)
    if (!participant) throw new Error('參與者不在此交易中')

    const participantLogs = await ptx.paymentLog.findMany({
      where: {
        fromUserId: input.participantUserId,
        toUserId: tx.payerId,
        type: { in: ['EXPENSE_DEBT', 'SETTLEMENT', 'EXPENSE_PREPAY_APPLY', 'SETTLEMENT_REVERSAL'] },
      },
      select: {
        id: true,
        fromUserId: true,
        toUserId: true,
        amountCents: true,
        type: true,
        transactionId: true,
        reversesLogId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const settleableCents = getRemainingTransactionDebtCents({
      debtorId: input.participantUserId,
      creditorId: tx.payerId,
      transactionId: tx.id,
      logs: participantLogs,
    })
    if (settleableCents <= 0) throw new Error('目前沒有可銷帳金額')

    await applySettlement(ptx, {
      fromUserId: input.participantUserId,
      toUserId: tx.payerId,
      amountCents: settleableCents,
      transactionId: tx.id,
    })
  })

  return { ok: true as const }
}

export async function getDashboard() {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  const pendingIncomingPrepayments = await prisma.prepaymentRequest.findMany({
    where: { toUserId: userId, status: PrepaymentRequestStatus.PENDING },
    select: { fromUserId: true },
  })
  const pendingCountByPeerId = new Map<string, number>()
  for (const request of pendingIncomingPrepayments) {
    pendingCountByPeerId.set(
      request.fromUserId,
      (pendingCountByPeerId.get(request.fromUserId) ?? 0) + 1,
    )
  }

  const pairLogs = await prisma.paymentLog.findMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      type: true,
      amountCents: true,
      transactionId: true,
      reversesLogId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const peerIds = new Set<string>()
  for (const log of pairLogs) {
    peerIds.add(log.fromUserId === userId ? log.toUserId : log.fromUserId)
  }
  for (const request of pendingIncomingPrepayments) {
    peerIds.add(request.fromUserId)
  }

  const peerIdList = [...peerIds]
  const peerUsers = peerIdList.length
    ? await prisma.user.findMany({
        where: { id: { in: peerIdList } },
        select: { id: true, username: true },
      })
    : []
  const peerNameById = new Map(peerUsers.map((peer) => [peer.id, peer.username]))

  let totalOwedByMe = 0
  let totalOwedToMe = 0
  const peers = peerIdList
    .map((peerId) => {
      const pairSummary = summarizePairLedger({
        userId,
        peerId,
        logs: pairLogs,
      })
      totalOwedByMe += pairSummary.iOweCents
      totalOwedToMe += pairSummary.theyOweMeCents
      return {
        peerId,
        peerUsername: peerNameById.get(peerId) ?? peerId,
        expenseCents: pairSummary.expenseBalanceCents,
        myPrepaymentBalanceCents: pairSummary.myPrepaymentBalanceCents,
        peerPrepaymentBalanceCents: pairSummary.peerPrepaymentBalanceCents,
        iOweCents: pairSummary.iOweCents,
        theyOweMeCents: pairSummary.theyOweMeCents,
        effectiveNetCents: pairSummary.effectiveNetCents,
        pendingIncomingPrepaymentCount: pendingCountByPeerId.get(peerId) ?? 0,
      }
    })
    .sort((a, b) => a.peerUsername.localeCompare(b.peerUsername))

  const recentLogs = await prisma.paymentLog.findMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      fromUser: { select: { username: true } },
      toUser: { select: { username: true } },
      transaction: { select: { id: true, title: true } },
    },
  })

  // 由自己墊款的交易列表：以目前登入者為 payer 的所有交易，並逐筆計算尚未收回的金額。
  const paidTransactionRecords = await prisma.transaction.findMany({
    where: { payerId: userId },
    select: {
      id: true,
      title: true,
      finalCents: true,
      createdAt: true,
      participants: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // reconcileReceivableExpenseItems 僅需要 fromUser=debtor / toUser=creditor 的 log，
  // 這邊預先過濾出「別人要還給我」的紀錄，避免之後多次重算。
  const incomingCreditLogs = pairLogs.filter((log) => log.toUserId === userId)

  const paidTransactions = paidTransactionRecords.map((transaction) => {
    const nonPayerParticipants = transaction.participants.filter(
      (participant) => participant.userId !== userId,
    )
    const totalOwedByOthersCents = nonPayerParticipants.reduce(
      (sum, participant) => sum + participant.allocatedCents,
      0,
    )
    const outstandingCents = nonPayerParticipants.reduce(
      (sum, participant) =>
        sum +
        getRemainingTransactionDebtCents({
          debtorId: participant.userId,
          creditorId: userId,
          transactionId: transaction.id,
          logs: incomingCreditLogs,
        }),
      0,
    )
    return {
      id: transaction.id,
      title: transaction.title,
      finalCents: transaction.finalCents,
      createdAt: transaction.createdAt.toISOString(),
      participantCount: transaction.participants.length,
      totalOwedByOthersCents,
      outstandingCents,
    }
  })

  return {
    totalOwedByMeCents: totalOwedByMe,
    totalOwedToMeCents: totalOwedToMe,
    peers,
    paidTransactions,
    recentLogs: recentLogs.map((log) => ({
      id: log.id,
      type: log.type,
      amountCents: log.amountCents,
      createdAt: log.createdAt.toISOString(),
      fromUsername: log.fromUser.username,
      toUsername: log.toUser.username,
      transactionId: log.transactionId,
      transactionTitle: log.transaction?.title ?? null,
    })),
  }
}

export async function getPeerLedger(input: { peerId: string }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')
  if (input.peerId === userId) throw new Error('無效的對象')

  // 1. 取得對方基本資料
  const peer = await prisma.user.findUnique({
    where: { id: input.peerId },
    select: { id: true, username: true },
  })
  if (!peer) throw new Error('找不到使用者')

  // 2. 一次取得所有相關的 PaymentLog（大幅減少查詢次數）
  const allLogs = await prisma.paymentLog.findMany({
    where: {
      OR: [
        { fromUserId: userId, toUserId: input.peerId },
        { fromUserId: input.peerId, toUserId: userId },
      ],
    },
    include: {
      transaction: {
        select: { id: true, title: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // 分類 logs（在記憶體中處理，效能更好）
  const pairLogs = allLogs
    .filter((log) => log.createdAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const logsForDisplay = allLogs.slice(0, 100) // 最新的 100 筆

  const reconcileTypes = new Set([
    'EXPENSE_DEBT',
    'SETTLEMENT',
    'EXPENSE_PREPAY_APPLY',
    'SETTLEMENT_REVERSAL',
  ])

  const incomingDebtAndSettlementLogs = allLogs.filter(
    (log) =>
      log.fromUserId === input.peerId &&
      log.toUserId === userId &&
      reconcileTypes.has(log.type)
  )

  const outgoingDebtAndSettlementLogs = allLogs.filter(
    (log) =>
      log.fromUserId === userId &&
      log.toUserId === input.peerId &&
      reconcileTypes.has(log.type)
  )

  const pairSummary = summarizePairLedger({
    userId,
    peerId: input.peerId,
    logs: pairLogs,
  })

  // 3. 計算每筆消費欠款餘額（雙向各自獨立）
  const buildDebtMeta = (logs: typeof allLogs) =>
    new Map(
      logs
        .filter((log) => log.type === 'EXPENSE_DEBT')
        .map((log) => [
          log.id,
          {
            transactionTitle: log.transaction?.title ?? null,
            createdAt: log.createdAt.toISOString(),
          },
        ]),
    )

  const incomingDebtMetaById = buildDebtMeta(incomingDebtAndSettlementLogs)
  const outgoingDebtMetaById = buildDebtMeta(outgoingDebtAndSettlementLogs)

  const receivableExpenseItems = reconcileReceivableExpenseItems({
    debtorId: input.peerId,
    creditorId: userId,
    logs: incomingDebtAndSettlementLogs,
  }).map((item) => ({
    debtLogId: item.debtLogId,
    transactionId: item.transactionId,
    transactionTitle: incomingDebtMetaById.get(item.debtLogId)?.transactionTitle ?? null,
    createdAt: incomingDebtMetaById.get(item.debtLogId)?.createdAt ?? new Date(0).toISOString(),
    originalCents: item.originalCents,
    remainingCents: item.remainingCents,
  }))

  const payableExpenseItems = reconcileReceivableExpenseItems({
    debtorId: userId,
    creditorId: input.peerId,
    logs: outgoingDebtAndSettlementLogs,
  }).map((item) => ({
    debtLogId: item.debtLogId,
    transactionId: item.transactionId,
    transactionTitle: outgoingDebtMetaById.get(item.debtLogId)?.transactionTitle ?? null,
    createdAt: outgoingDebtMetaById.get(item.debtLogId)?.createdAt ?? new Date(0).toISOString(),
    originalCents: item.originalCents,
    remainingCents: item.remainingCents,
  }))

  // 4. 取得 pending refund requests（這部分比較輕）
  const pendingOutgoingRefundRequests = await prisma.prepaymentRequest.findMany({
    where: {
      fromUserId: userId,
      toUserId: input.peerId,
      kind: PrepaymentRequestKind.REFUND,
      status: PrepaymentRequestStatus.PENDING,
    },
    select: { amountCents: true },
  })

  const pendingOutgoingRefundCents = pendingOutgoingRefundRequests.reduce(
    (sum, request) => sum + request.amountCents,
    0,
  )

  const pendingIncomingPrepayments = await prisma.prepaymentRequest.findMany({
    where: {
      fromUserId: input.peerId,
      toUserId: userId,
      status: PrepaymentRequestStatus.PENDING,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      amountCents: true,
      kind: true,
      createdAt: true,
    },
  })

  return {
    peer,
    expenseCents: pairSummary.expenseBalanceCents,
    prepaymentCents: pairSummary.effectiveNetCents - pairSummary.expenseBalanceCents,
    iOweCents: pairSummary.iOweCents,
    theyOweMeCents: pairSummary.theyOweMeCents,
    myPrepaymentBalanceCents: pairSummary.myPrepaymentBalanceCents,
    peerPrepaymentBalanceCents: pairSummary.peerPrepaymentBalanceCents,
    pendingOutgoingRefundCents,
    peerPrepaymentAvailableToRefundCents: Math.max(
      0,
      pairSummary.peerPrepaymentBalanceCents - pendingOutgoingRefundCents,
    ),
    effectiveNetCents: pairSummary.effectiveNetCents,
    pendingIncomingPrepayments,
    receivableExpenseItems: receivableExpenseItems.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    ),
    payableExpenseItems: payableExpenseItems.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    ),
    logs: logsForDisplay.map((log) => ({
      id: log.id,
      type: log.type,
      amountCents: log.amountCents,
      createdAt: log.createdAt.toISOString(),
      fromUserId: log.fromUserId,
      toUserId: log.toUserId,
      transactionId: log.transactionId,
      transactionTitle: log.transaction?.title ?? null,
      note: log.note,
      reversesLogId: log.reversesLogId,
      // 標記此筆 SETTLEMENT 是否已被 SETTLEMENT_REVERSAL 沖銷，供前端控制按鈕顯示
      isReversed: allLogs.some(
        (candidate) =>
          candidate.type === 'SETTLEMENT_REVERSAL' && candidate.reversesLogId === log.id,
      ),
    })),
  }
}

export async function getTransactionDetail(input: { transactionId: string }) {
  const userId = await resolveSessionUserId()
  if (!userId) throw new Error('請先登入')

  // 一次取得交易與付款人資料
  const transaction = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    include: {
      payer: { select: { username: true } },
    },
  })
  if (!transaction) throw new Error('找不到交易')

  const participantIds = transaction.participants.map((p) => p.userId)
  const involved = transaction.payerId === userId || participantIds.includes(userId)
  if (!involved) throw new Error('無權檢視此交易')

  // 取得所有參與者的名稱（包含付款人）
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set([...participantIds, transaction.payerId])] } },
    select: { id: true, username: true },
  })
  const nameById = new Map(users.map((user) => [user.id, user.username]))

  // 取得相關的結算與債務紀錄
  const participantLogs = await prisma.paymentLog.findMany({
    where: {
      fromUserId: { in: participantIds.filter((id) => id !== transaction.payerId) },
      toUserId: transaction.payerId,
      type: { in: ['EXPENSE_DEBT', 'SETTLEMENT', 'EXPENSE_PREPAY_APPLY', 'SETTLEMENT_REVERSAL'] },
    },
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      amountCents: true,
      type: true,
      transactionId: true,
      reversesLogId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return {
    id: transaction.id,
    title: transaction.title,
    finalCents: transaction.finalCents,
    createdAt: transaction.createdAt.toISOString(),
    payerId: transaction.payerId,
    payerUsername: transaction.payer.username,
    currentUserId: userId,
    participants: transaction.participants.map((participant) => {
      const settleableCents =
        participant.userId === transaction.payerId
          ? 0
          : getRemainingTransactionDebtCents({
              debtorId: participant.userId,
              creditorId: transaction.payerId,
              transactionId: transaction.id,
              logs: participantLogs,
            })

      return {
        userId: participant.userId,
        username: nameById.get(participant.userId) ?? participant.userId,
        originalCents: participant.originalCents,
        allocatedCents: participant.allocatedCents,
        settleableCents,
        coveredCents:
          participant.userId === transaction.payerId
            ? 0
            : Math.max(0, participant.allocatedCents - settleableCents),
      }
    }),
  }
}
