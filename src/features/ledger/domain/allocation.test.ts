import { describe, expect, it } from 'vitest'
import { computeAllocations } from './allocation'

describe('computeAllocations', () => {
  it('allocates proportionally and sums to finalCents', () => {
    const res = computeAllocations({
      finalCents: 10000,
      participants: [
        { userId: 'a', originalCents: 3000, order: 0 },
        { userId: 'b', originalCents: 7000, order: 1 },
        { userId: 'p', originalCents: 0, order: 2 },
      ],
    })
    expect(res.reduce((s, r) => s + r.allocatedCents, 0)).toBe(10000)
    const byId = Object.fromEntries(res.map((r) => [r.userId, r.allocatedCents]))
    expect(byId.a + byId.b + byId.p).toBe(10000)
  })

  it('allocates by yuan and distributes remainder by fractional part', () => {
    const res = computeAllocations({
      finalCents: 50000,
      participants: [
        { userId: 'a', originalCents: 25000, order: 0 },
        { userId: 'b', originalCents: 20000, order: 1 },
        { userId: 'c', originalCents: 10000, order: 2 },
      ],
    })
    const byId = Object.fromEntries(res.map((r) => [r.userId, r.allocatedCents]))
    expect(byId.a).toBe(22700)
    expect(byId.b).toBe(18200)
    expect(byId.c).toBe(9100)
    expect(byId.a + byId.b + byId.c).toBe(50000)
  })

  it('throws on duplicate user ids', () => {
    expect(() =>
      computeAllocations({
        finalCents: 1000,
        participants: [
          { userId: 'a', originalCents: 500, order: 0 },
          { userId: 'a', originalCents: 500, order: 1 },
        ],
      }),
    ).toThrow('重複')
  })
})
