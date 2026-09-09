import { describe, expect, it } from 'vitest'
import { canEditEventItems, isOrderingClosed, parseOrderDeadline, taipeiDeadlineInput, formatOrderDeadline } from './event-ordering'

const now = Date.parse('2026-09-09T04:00:00Z')
const event = { status: 'DRAFT', payerId: 'payer' }

describe('活動收單規則', () => {
  it('既有資料無截止欄位與空欄位都維持開放', () => {
    expect(isOrderingClosed(event, now)).toBe(false)
    expect(isOrderingClosed({ ...event, orderDeadline: null, ordersClosedAt: null }, now)).toBe(false)
  })
  it('截止前可登記，截止瞬間即鎖定', () => {
    const scheduled = { ...event, orderDeadline: new Date(now) }
    expect(isOrderingClosed(scheduled, now - 1)).toBe(false)
    expect(isOrderingClosed(scheduled, now)).toBe(true)
    expect(canEditEventItems(scheduled, 'participant', now)).toBe(false)
    expect(canEditEventItems(scheduled, 'payer', now)).toBe(true)
  })
  it('手動結單鎖住參加者，正式結算鎖住所有人', () => {
    expect(canEditEventItems({ ...event, ordersClosedAt: new Date(now) }, 'participant', now)).toBe(false)
    expect(canEditEventItems({ ...event, status: 'FINALIZED' }, 'payer', now)).toBe(false)
    expect(canEditEventItems(event, null, now)).toBe(false)
  })
  it('不限時重開移除舊期限，限時重開採新期限', () => {
    expect(isOrderingClosed({ ...event, orderDeadline: null, ordersClosedAt: null }, now)).toBe(false)
    expect(isOrderingClosed({ ...event, orderDeadline: new Date(now + 600000), ordersClosedAt: null }, now)).toBe(false)
  })
  it('拒絕過去、相同、無效及未提供時區的結單時間', () => {
    for (const value of ['2026-09-09T03:59:00Z', '2026-09-09T04:00:00Z', 'invalid', '2026-09-09T12:10']) {
      expect(() => parseOrderDeadline(value, now)).toThrow()
    }
    expect(parseOrderDeadline(null, now)).toBe(null)
    expect(parseOrderDeadline('2026-09-09T12:10:00+08:00', now)?.getTime()).toBe(now + 600000)
  })
  it('台北時間不受執行環境時區影響，並拒絕不存在的日期', () => {
    expect(taipeiDeadlineInput('2026-09-09T12:10')).toBe('2026-09-09T04:10:00.000Z')
    expect(formatOrderDeadline('2026-09-09T04:10:00Z')).toBe('2026-09-09 12:10（台北時間 UTC+8）')
    expect(() => taipeiDeadlineInput('2026-02-30T12:00')).toThrow()
  })
})
