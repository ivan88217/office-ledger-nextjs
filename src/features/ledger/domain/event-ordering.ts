export type OrderingEvent = {
  status: string
  payerId: string
  orderDeadline?: Date | string | null
  ordersClosedAt?: Date | string | null
}

export function isOrderingClosed(event: OrderingEvent, now = Date.now()) {
  return event.status === 'FINALIZED' || Boolean(event.ordersClosedAt) ||
    (event.orderDeadline != null && new Date(event.orderDeadline).getTime() <= now)
}

export function canEditEventItems(event: OrderingEvent, userId: string | null, now = Date.now()) {
  return Boolean(userId) && event.status === 'DRAFT' &&
    (event.payerId === userId || !isOrderingClosed(event, now))
}

export function parseOrderDeadline(value: string | null, now = Date.now()): Date | null {
  if (value === null) return null
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('請輸入包含時區的有效結單時間')
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now) {
    throw new Error('結單時間必須晚於現在')
  }
  return date
}

export function taipeiDeadlineInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('請輸入結單日期與時間')
  const date = new Date(`${value}:00+08:00`)
  if (!Number.isFinite(date.getTime()) || toTaipeiDateTimeInput(date.toISOString()) !== value) {
    throw new Error('請輸入有效的結單日期與時間')
  }
  return date.toISOString()
}

export function toTaipeiDateTimeInput(value: string) {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

export function formatOrderDeadline(value: string) {
  return `${toTaipeiDateTimeInput(value).replace('T', ' ')}（台北時間 UTC+8）`
}
