export type ParticipantInput = {
  userId: string
  /** 原始分攤基礎金額（分） */
  originalCents: number
  /** 表單輸入順序，用於 tie-break */
  order: number
}

export type AllocationResult = {
  userId: string
  originalCents: number
  allocatedCents: number
}

/**
 * 比例分配 → 取整 → 依小數餘數由大到小補差額。
 * 以「元」為最小分配單位，確保分攤結果不會出現角分。
 * 餘數相同時依輸入順序（order 小者先拿補額）。
 */
export function computeAllocations(params: {
  finalCents: number
  participants: ParticipantInput[]
}): AllocationResult[] {
  const { finalCents, participants } = params

  if (participants.length === 0) {
    throw new Error('至少需要一位參與者')
  }
  if (!Number.isInteger(finalCents) || finalCents < 0) {
    throw new Error('實付總額無效')
  }
  if (finalCents % 100 !== 0) {
    throw new Error('實付總額必須為整數元')
  }

  const originalTotal = participants.reduce((s, p) => s + p.originalCents, 0)
  if (originalTotal <= 0) {
    throw new Error('原始金額總和必須大於 0')
  }
  if (originalTotal % 100 !== 0) {
    throw new Error('原始金額總和必須為整數元')
  }

  const ids = new Set(participants.map((p) => p.userId))
  if (ids.size !== participants.length) {
    throw new Error('參與者不可重複')
  }

  type Row = ParticipantInput & {
    floor: number
    remainderNumerator: bigint
  }

  const finalYuan = finalCents / 100
  const originalTotalYuan = originalTotal / 100

  const rows: Row[] = participants.map((p) => {
    if (!Number.isInteger(p.originalCents) || p.originalCents < 0) {
      throw new Error('原始金額必須為非負整數（分）')
    }
    if (p.originalCents % 100 !== 0) {
      throw new Error('原始金額必須為整數元')
    }

    const originalYuan = p.originalCents / 100
    const prod = BigInt(finalYuan) * BigInt(originalYuan)
    const floor = Number(prod / BigInt(originalTotalYuan))
    const remainderNumerator = prod % BigInt(originalTotalYuan)
    return { ...p, floor, remainderNumerator }
  })

  const sumFloor = rows.reduce((s, r) => s + r.floor, 0)
  let remaining = finalYuan - sumFloor
  if (remaining < 0) {
    throw new Error('內部分攤錯誤：取整加總超過實付金額')
  }

  const sortedForRemainder = [...rows].sort((a, b) => {
    if (a.remainderNumerator !== b.remainderNumerator) {
      return a.remainderNumerator < b.remainderNumerator ? 1 : -1
    }
    return a.order - b.order
  })

  const bonus = new Map<string, number>()
  for (const r of rows) {
    bonus.set(r.userId, 0)
  }
  for (let i = 0; i < remaining; i++) {
    const target = sortedForRemainder[i]
    if (!target) break
    bonus.set(target.userId, (bonus.get(target.userId) ?? 0) + 1)
  }

  return rows.map((r) => ({
    userId: r.userId,
    originalCents: r.originalCents,
    allocatedCents: (r.floor + (bonus.get(r.userId) ?? 0)) * 100,
  }))
}
