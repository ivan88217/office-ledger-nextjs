import type { PrismaClient } from '@prisma/client'
import { PaymentLogType } from '@prisma/client'
import { summarizePairLedger } from '#/features/ledger/domain/ledger-state'

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

async function listPairLogs(tx: Tx, userId: string, peerId: string) {
  return tx.paymentLog.findMany({
    where: {
      OR: [
        { fromUserId: userId, toUserId: peerId },
        { fromUserId: peerId, toUserId: userId },
      ],
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
}

/**
 * 建立一筆「B 應付給 A（墊款人）」的消費債務，先沖 B→A 的預付款，再記剩餘消費債務。
 * expense 語意（以 B 相對於 A）：負數表示 B 欠 A；正數表示 A 欠 B。
 */
export async function applyExpenseDebtForParticipant(
  tx: Tx,
  params: {
    debtorId: string
    creditorId: string
    debtCents: number
    transactionId: string
  },
): Promise<void> {
  const { debtorId, creditorId, debtCents, transactionId } = params
  if (debtCents <= 0) return

  const pairLogs = await listPairLogs(tx, debtorId, creditorId)
  const pairSummary = summarizePairLedger({
    userId: debtorId,
    peerId: creditorId,
    logs: pairLogs,
  })
  const prepayAvailable = pairSummary.myPrepaymentBalanceCents
  const applyPrepay = Math.min(prepayAvailable, debtCents)
  const debtRemain = debtCents - applyPrepay

  if (applyPrepay > 0) {
    await tx.paymentLog.create({
      data: {
        fromUserId: debtorId,
        toUserId: creditorId,
        amountCents: applyPrepay,
        type: PaymentLogType.EXPENSE_PREPAY_APPLY,
        transactionId,
        note: '沖抵預付款',
      },
    })
  }

  if (debtRemain > 0) {
    await tx.paymentLog.create({
      data: {
        fromUserId: debtorId,
        toUserId: creditorId,
        amountCents: debtRemain,
        type: PaymentLogType.EXPENSE_DEBT,
        transactionId,
      },
    })
  }
}

export async function applyPrepayment(
  tx: Tx,
  params: { fromUserId: string; toUserId: string; amountCents: number },
): Promise<void> {
  const { fromUserId, toUserId, amountCents } = params
  if (amountCents <= 0) return

  const pairLogs = await listPairLogs(tx, fromUserId, toUserId)
  const pairSummary = summarizePairLedger({
    userId: fromUserId,
    peerId: toUserId,
    logs: pairLogs,
  })
  const settlementCents = Math.min(amountCents, pairSummary.iOweCents)
  const remainingPrepaymentCents = amountCents - settlementCents

  if (settlementCents > 0) {
    await tx.paymentLog.create({
      data: {
        fromUserId,
        toUserId,
        amountCents: settlementCents,
        type: PaymentLogType.SETTLEMENT,
        note: '預付款沖抵消費欠款',
      },
    })
  }

  if (remainingPrepaymentCents > 0) {
    await tx.paymentLog.create({
      data: {
        fromUserId,
        toUserId,
        amountCents: remainingPrepaymentCents,
        type: PaymentLogType.PREPAYMENT,
        note: '預付款',
      },
    })
  }
}

/**
 * 返還預付款：fromUser 返還給 toUser，會減少「toUser 曾預付給 fromUser」的餘額。
 */
export async function applyPrepaymentRefund(
  tx: Tx,
  params: { fromUserId: string; toUserId: string; amountCents: number },
): Promise<void> {
  const { fromUserId, toUserId, amountCents } = params
  if (amountCents <= 0) return

  const pairLogs = await listPairLogs(tx, fromUserId, toUserId)
  const pairSummary = summarizePairLedger({
    userId: fromUserId,
    peerId: toUserId,
    logs: pairLogs,
  })
  const refundable = pairSummary.peerPrepaymentBalanceCents
  if (refundable < amountCents) {
    throw new Error('返還金額超過可返還的預付餘額')
  }

  await tx.paymentLog.create({
    data: {
      fromUserId,
      toUserId,
      amountCents,
      type: PaymentLogType.PREPAYMENT_REFUND,
      note: '返還預付款',
    },
  })
}

/** 還款：減少「我欠對方」的消費債務（fromUser 付給 toUser） */
export async function applySettlement(
  tx: Tx,
  params: {
    fromUserId: string
    toUserId: string
    amountCents: number
    transactionId?: string | null
  },
): Promise<void> {
  const { fromUserId, toUserId, amountCents, transactionId } = params
  if (amountCents <= 0) return

  const pairLogs = await listPairLogs(tx, fromUserId, toUserId)
  const pairSummary = summarizePairLedger({
    userId: fromUserId,
    peerId: toUserId,
    logs: pairLogs,
  })
  const owedByFrom = pairSummary.iOweCents
  if (owedByFrom < amountCents) {
    throw new Error('還款金額超過目前消費欠款，請調整金額')
  }

  await tx.paymentLog.create({
    data: {
      fromUserId,
      toUserId,
      amountCents,
      type: PaymentLogType.SETTLEMENT,
      note: '還款',
      transactionId,
    },
  })
}
