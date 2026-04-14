import bcrypt from 'bcryptjs'
import { PrepaymentRequestKind, PrepaymentRequestStatus } from '@prisma/client'
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
        type: { in: ['EXPENSE_DEBT', 'SETTLEMENT', 'EXPENSE_PREPAY_APPLY'] },
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
        type: { in: ['EXPENSE_DEBT', 'SETTLEMENT', 'EXPENSE_PREPAY_APPLY'] },
      },
      select: {
        id: true,
        fromUserId: true,
        toUserId: true,
        amountCents: true,
        type: true,
        transactionId: true,
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

  return {
    totalOwedByMeCents: totalOwedByMe,
    totalOwedToMeCents: totalOwedToMe,
    peers,
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

  const debtAndSettlementLogs = allLogs.filter(
    (log) =>
      log.fromUserId === input.peerId &&
      log.toUserId === userId &&
      ['EXPENSE_DEBT', 'SETTLEMENT', 'EXPENSE_PREPAY_APPLY'].includes(log.type)
  )

  const pairSummary = summarizePairLedger({
    userId,
    peerId: input.peerId,
    logs: pairLogs,
  })

  // 3. 計算 receivableExpenseItems
  const debtMetaById = new Map(
    debtAndSettlementLogs
      .filter((log) => log.type === 'EXPENSE_DEBT')
      .map((log) => [
        log.id,
        {
          transactionTitle: log.transaction?.title ?? null,
          createdAt: log.createdAt.toISOString(),
        },
      ]),
  )

  const receivableExpenseItems = reconcileReceivableExpenseItems({
    debtorId: input.peerId,
    creditorId: userId,
    logs: debtAndSettlementLogs,
  }).map((item) => ({
    debtLogId: item.debtLogId,
    transactionId: item.transactionId,
    transactionTitle: debtMetaById.get(item.debtLogId)?.transactionTitle ?? null,
    createdAt: debtMetaById.get(item.debtLogId)?.createdAt ?? new Date(0).toISOString(),
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
      type: { in: ['EXPENSE_DEBT', 'SETTLEMENT', 'EXPENSE_PREPAY_APPLY'] },
    },
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      amountCents: true,
      type: true,
      transactionId: true,
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
