export type DiningEventItemInput = {
  id: string
  name: string
  amountCents: number
  participantUserIds: string[]
  recordedByUserId?: string | null
  order: number
}

export type DiningEventUserSummary = {
  userId: string
  subtotalCents: number
  serviceChargeCents: number
  totalCents: number
  items: {
    itemId: string
    name: string
    amountCents: number
    shareCents: number
  }[]
}

export type DiningEventAllocation = {
  subtotalCents: number
  serviceChargeCents: number
  totalCents: number
  users: DiningEventUserSummary[]
}

function assertWholeYuanCents(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value % 100 !== 0) {
    throw new Error(`${label}必須為非負整數元`)
  }
}

function splitWholeYuanCents(params: {
  amountCents: number
  userIds: string[]
}): Map<string, number> {
  const { amountCents, userIds } = params
  assertWholeYuanCents(amountCents, '金額')
  if (userIds.length === 0) throw new Error('品項至少需要一位分攤對象')

  const uniqueUserIds = [...new Set(userIds)]
  if (uniqueUserIds.length !== userIds.length) {
    throw new Error('同一品項的分攤對象不可重複')
  }

  const amountYuan = amountCents / 100
  const baseYuan = Math.floor(amountYuan / userIds.length)
  let remainingYuan = amountYuan - baseYuan * userIds.length
  const shares = new Map<string, number>()

  for (const userId of [...userIds].sort()) {
    const bonusYuan = remainingYuan > 0 ? 1 : 0
    shares.set(userId, (baseYuan + bonusYuan) * 100)
    remainingYuan -= bonusYuan
  }

  return shares
}

function allocateByWeightCents(params: {
  amountCents: number
  weights: { userId: string; weightCents: number }[]
}): Map<string, number> {
  const { amountCents, weights } = params
  assertWholeYuanCents(amountCents, '服務費')
  if (amountCents === 0) return new Map(weights.map((weight) => [weight.userId, 0]))

  const totalWeightYuan = weights.reduce((sum, weight) => {
    assertWholeYuanCents(weight.weightCents, '分攤基礎')
    return sum + weight.weightCents / 100
  }, 0)
  if (totalWeightYuan <= 0) throw new Error('服務費分攤基礎必須大於 0')

  const amountYuan = amountCents / 100
  const rows = weights
    .map((weight) => {
      const weightYuan = weight.weightCents / 100
      const numerator = BigInt(amountYuan) * BigInt(weightYuan)
      return {
        userId: weight.userId,
        floorYuan: Number(numerator / BigInt(totalWeightYuan)),
        remainder: numerator % BigInt(totalWeightYuan),
      }
    })
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder < b.remainder ? 1 : -1
      return a.userId.localeCompare(b.userId)
    })

  const allocated = new Map<string, number>()
  let floorTotalYuan = 0
  for (const row of rows) {
    allocated.set(row.userId, row.floorYuan * 100)
    floorTotalYuan += row.floorYuan
  }

  let remainingYuan = amountYuan - floorTotalYuan
  for (const row of rows) {
    if (remainingYuan <= 0) break
    allocated.set(row.userId, (allocated.get(row.userId) ?? 0) + 100)
    remainingYuan -= 1
  }

  return allocated
}

export function computeDiningEventAllocation(params: {
  items: DiningEventItemInput[]
  serviceChargeEnabled: boolean
  serviceChargeRateBps: number
}): DiningEventAllocation {
  const { items, serviceChargeEnabled, serviceChargeRateBps } = params

  if (items.length === 0) throw new Error('活動至少需要一個品項')
  if (!Number.isInteger(serviceChargeRateBps) || serviceChargeRateBps < 0) {
    throw new Error('服務費比例必須為非負整數')
  }

  const summaryByUserId = new Map<string, DiningEventUserSummary>()
  let subtotalCents = 0

  for (const item of [...items].sort((a, b) => a.order - b.order)) {
    const name = item.name.trim()
    if (!name) throw new Error('品項名稱不可空白')
    assertWholeYuanCents(item.amountCents, '品項金額')
    if (item.amountCents <= 0) throw new Error('品項金額必須大於 0')

    subtotalCents += item.amountCents
    const shares = splitWholeYuanCents({
      amountCents: item.amountCents,
      userIds: item.participantUserIds,
    })

    for (const [userId, shareCents] of shares) {
      const summary =
        summaryByUserId.get(userId) ??
        {
          userId,
          subtotalCents: 0,
          serviceChargeCents: 0,
          totalCents: 0,
          items: [],
        }

      summary.subtotalCents += shareCents
      summary.items.push({
        itemId: item.id,
        name,
        amountCents: item.amountCents,
        shareCents,
      })
      summaryByUserId.set(userId, summary)
    }
  }

  const subtotalYuan = subtotalCents / 100
  const serviceChargeCents = serviceChargeEnabled
    ? Math.floor((subtotalYuan * serviceChargeRateBps + 5000) / 10000) * 100
    : 0

  const userSummaries = [...summaryByUserId.values()].sort((a, b) =>
    a.userId.localeCompare(b.userId),
  )
  const serviceShares = allocateByWeightCents({
    amountCents: serviceChargeCents,
    weights: userSummaries.map((summary) => ({
      userId: summary.userId,
      weightCents: summary.subtotalCents,
    })),
  })

  for (const summary of userSummaries) {
    summary.serviceChargeCents = serviceShares.get(summary.userId) ?? 0
    summary.totalCents = summary.subtotalCents + summary.serviceChargeCents
  }

  return {
    subtotalCents,
    serviceChargeCents,
    totalCents: subtotalCents + serviceChargeCents,
    users: userSummaries,
  }
}
