import { describe, expect, it } from 'vitest'
import { computeDiningEventAllocation } from './dining-event'

describe('computeDiningEventAllocation', () => {
  it('splits personal, shared, set, and add-on items', () => {
    const result = computeDiningEventAllocation({
      serviceChargeEnabled: false,
      serviceChargeRateBps: 1000,
      items: [
        { id: 'a', name: 'A 餐', amountCents: 20000, participantUserIds: ['alice'], order: 0 },
        { id: 'set', name: '多人套餐', amountCents: 90000, participantUserIds: ['alice', 'bob', 'cara'], order: 1 },
        { id: 'addon', name: '加點炸物', amountCents: 9900, participantUserIds: ['bob', 'cara'], order: 2 },
      ],
    })

    const byId = Object.fromEntries(result.users.map((user) => [user.userId, user]))
    expect(byId.alice.totalCents).toBe(50000)
    expect(byId.bob.totalCents).toBe(35000)
    expect(byId.cara.totalCents).toBe(34900)
    expect(result.totalCents).toBe(119900)
  })

  it('adds default 10 percent service charge rounded to whole yuan', () => {
    const result = computeDiningEventAllocation({
      serviceChargeEnabled: true,
      serviceChargeRateBps: 1000,
      items: [
        { id: 'a', name: '主餐', amountCents: 33300, participantUserIds: ['a'], order: 0 },
        { id: 'b', name: '合點', amountCents: 10000, participantUserIds: ['a', 'b'], order: 1 },
      ],
    })

    const byId = Object.fromEntries(result.users.map((user) => [user.userId, user]))
    expect(result.serviceChargeCents).toBe(4300)
    expect(result.totalCents).toBe(47600)
    expect(byId.a.totalCents + byId.b.totalCents).toBe(47600)
  })

  it('supports custom service charge rates', () => {
    const result = computeDiningEventAllocation({
      serviceChargeEnabled: true,
      serviceChargeRateBps: 1250,
      items: [
        { id: 'a', name: 'A', amountCents: 10000, participantUserIds: ['a'], order: 0 },
        { id: 'b', name: 'B', amountCents: 30000, participantUserIds: ['b'], order: 1 },
      ],
    })

    const byId = Object.fromEntries(result.users.map((user) => [user.userId, user]))
    expect(result.serviceChargeCents).toBe(5000)
    expect(byId.a.serviceChargeCents).toBe(1300)
    expect(byId.b.serviceChargeCents).toBe(3700)
  })

  it('distributes indivisible yuan deterministically and keeps totals exact', () => {
    const result = computeDiningEventAllocation({
      serviceChargeEnabled: false,
      serviceChargeRateBps: 0,
      items: [
        { id: 'x', name: '合點', amountCents: 10000, participantUserIds: ['c', 'a', 'b'], order: 0 },
      ],
    })

    const byId = Object.fromEntries(result.users.map((user) => [user.userId, user.totalCents]))
    expect(byId.a).toBe(3400)
    expect(byId.b).toBe(3300)
    expect(byId.c).toBe(3300)
    expect(result.users.reduce((sum, user) => sum + user.totalCents, 0)).toBe(10000)
  })

  it('rejects invalid event data', () => {
    expect(() =>
      computeDiningEventAllocation({
        serviceChargeEnabled: true,
        serviceChargeRateBps: 1000,
        items: [],
      }),
    ).toThrow('至少需要一個品項')

    expect(() =>
      computeDiningEventAllocation({
        serviceChargeEnabled: true,
        serviceChargeRateBps: 1000,
        items: [{ id: 'x', name: '合點', amountCents: 10000, participantUserIds: [], order: 0 }],
      }),
    ).toThrow('至少需要一位分攤對象')

    expect(() =>
      computeDiningEventAllocation({
        serviceChargeEnabled: true,
        serviceChargeRateBps: 1000,
        items: [{ id: 'x', name: '合點', amountCents: 1050, participantUserIds: ['a'], order: 0 }],
      }),
    ).toThrow('非負整數元')
  })
})
