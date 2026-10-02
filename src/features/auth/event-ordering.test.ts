import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), create: vi.fn(),
  requireUser: vi.fn(), resolveUser: vi.fn(),
}))
vi.mock('#/lib/db/prisma', () => ({ prisma: {
  diningEvent: { findUnique: mocks.findUnique, updateMany: mocks.updateMany, create: mocks.create },
  user: { findMany: mocks.findMany },
} }))
vi.mock('#/features/auth/session', () => ({
  requireSessionUser: mocks.requireUser, resolveSessionUserId: mocks.resolveUser,
  createSession: vi.fn(), destroySession: vi.fn(), getOptionalSessionUser: vi.fn(),
}))
import { addDiningEventItem, createDiningEvent, getDiningEventDetail, setDiningEventOrdering, updateDiningEvent } from './auth.service'

const event = {
  id: 'event', title: '午餐', payerId: 'payer', status: 'DRAFT',
  updatedAt: new Date('2026-09-09T03:00:00Z'), items: [],
  orderDeadline: null, ordersClosedAt: null,
}
const version = event.updatedAt.toISOString()
const item = { name: '便當', amountCents: 10000, participantUserIds: ['participant'] }
const update = { eventId: 'event', expectedUpdatedAt: version, title: '午餐', payerId: 'payer', serviceChargeEnabled: false, serviceChargeRateBps: 0, items: [] }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findUnique.mockResolvedValue({ ...event })
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.findMany.mockImplementation(async ({ where }) => where.id.in.map((id: string) => ({ id })))
  mocks.requireUser.mockResolvedValue({ id: 'participant' })
  mocks.resolveUser.mockResolvedValue('participant')
})

describe('收單後端權限與更新', () => {
  it('建立活動保留多行說明並去除邊界空白', async () => {
    mocks.create.mockResolvedValue({ id: 'event' })
    await createDiningEvent({ title: '午餐', payerId: 'payer', description: '  請自備餐具\n12:30 領餐  ' })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ description: '請自備餐具\n12:30 領餐' }),
    }))
  })
  it.each([undefined, null, '  \n  '])('建立活動的空白說明 %s 儲存為空值', async (description) => {
    mocks.create.mockResolvedValue({ id: 'event' })
    await createDiningEvent({ title: '午餐', payerId: 'payer', description })
    expect(mocks.create.mock.calls[0][0].data.description).toBe(null)
  })
  it.each([
    ['  新說明\n第二行  ', '新說明\n第二行'],
    ['', null],
    [null, null],
  ])('更新說明 %s 可以替換或清空', async (description, expected) => {
    await updateDiningEvent({ ...update, description })
    expect(mocks.updateMany.mock.calls[0][0].data.description).toBe(expected)
  })
  it('未提供說明的舊呼叫端不會覆寫已有說明', async () => {
    mocks.findUnique.mockResolvedValue({ ...event, description: '原說明' })
    await updateDiningEvent(update)
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty('description')
  })
  it.each([undefined, null, '請自備餐具\n12:30 領餐'])('詳情讀回說明 %s，舊資料回傳空值', async (description) => {
    mocks.findUnique.mockResolvedValue({ ...event, description, createdAt: event.updatedAt, payer: { username: '付款人' } })
    const detail = await getDiningEventDetail({ eventId: 'event' })
    expect(detail.description).toBe(description ?? null)
  })
  it.each(['deadline', 'manual', 'finalized'])('%s 關閉時拒絕參加者新增與整批修改／刪除', async (kind) => {
    mocks.findUnique.mockResolvedValue({ ...event,
      orderDeadline: kind === 'deadline' ? new Date(0) : null,
      ordersClosedAt: kind === 'manual' ? new Date() : null,
      status: kind === 'finalized' ? 'FINALIZED' : 'DRAFT',
    })
    await expect(addDiningEventItem({ eventId: 'event', ...item })).rejects.toThrow('已結單或結算')
    await expect(updateDiningEvent(update)).rejects.toThrow('已結單或結算')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
  it('參加者不能透過更換付款人或重開取得例外', async () => {
    await expect(updateDiningEvent({ ...update, payerId: 'participant' })).rejects.toThrow('只有付款人')
    await expect(setDiningEventOrdering({ eventId: 'event', expectedUpdatedAt: version, mode: 'open' })).rejects.toThrow('只有付款人')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
  it('付款人結單後仍可調整品項，但不能修改已結算活動', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'payer' })
    mocks.findUnique.mockResolvedValue({ ...event, ordersClosedAt: new Date() })
    await updateDiningEvent(update)
    expect(mocks.updateMany.mock.calls[0][0].where).not.toHaveProperty('AND')
    mocks.findUnique.mockResolvedValue({ ...event, status: 'FINALIZED' })
    await expect(updateDiningEvent(update)).rejects.toThrow('已結單或結算')
    await expect(setDiningEventOrdering({ eventId: 'event', expectedUpdatedAt: version, mode: 'open' })).rejects.toThrow('已結算')
  })
  it('拒絕舊頁面整批更新', async () => {
    await expect(updateDiningEvent({ ...update, expectedUpdatedAt: 'old-version' })).rejects.toThrow('重新整理')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
  it('寫入原子條件包含當下付款人、版本、結算與截止條件，新增不覆寫品項', async () => {
    await addDiningEventItem({ eventId: 'event', ...item })
    const call = mocks.updateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ id: 'event', payerId: 'payer', status: 'DRAFT', updatedAt: event.updatedAt })
    expect(call.where.AND[0].OR).toContainEqual({ ordersClosedAt: { isSet: false } })
    expect(call.where.AND[1].OR).toContainEqual({ orderDeadline: { isSet: false } })
    expect(call.where.AND[1].OR[2].orderDeadline.gt).toBeInstanceOf(Date)
    expect(call.data.items.push).toMatchObject(item)
  })
  it('寫入前活動被結單或其他人更新時，回傳衝突而不宣稱成功', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await expect(addDiningEventItem({ eventId: 'event', ...item })).rejects.toThrow('重新整理')
    await expect(updateDiningEvent(update)).rejects.toThrow('重新整理')
  })
  it.each([null, '2099-09-09T12:10:00+08:00'])('付款人可重開至 %s 且不更動品項', async (deadline) => {
    mocks.requireUser.mockResolvedValue({ id: 'payer' })
    mocks.findUnique.mockResolvedValue({ ...event, ordersClosedAt: new Date(), orderDeadline: new Date(0) })
    await setDiningEventOrdering({ eventId: 'event', expectedUpdatedAt: version, mode: 'open', orderDeadline: deadline })
    const call = mocks.updateMany.mock.calls[0][0]
    expect(call.data.ordersClosedAt).toBe(null)
    expect(call.data.orderDeadline).toEqual(deadline ? new Date(deadline) : null)
    expect(call.data).not.toHaveProperty('items')
  })
  it('付款人可手動結單，過期與無效模式則拒絕', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'payer' })
    await setDiningEventOrdering({ eventId: 'event', expectedUpdatedAt: version, mode: 'close' })
    expect(mocks.updateMany.mock.calls[0][0].data.ordersClosedAt).toBeInstanceOf(Date)
    await expect(setDiningEventOrdering({ eventId: 'event', expectedUpdatedAt: version, mode: 'open', orderDeadline: new Date(0).toISOString() })).rejects.toThrow()
  })
  it('建立活動時不得替其他付款人設定截止時間', async () => {
    await expect(createDiningEvent({ title: '午餐', payerId: 'payer', orderDeadline: '2099-09-09T12:00:00Z' })).rejects.toThrow('只有付款人')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('付款人轉交後，舊付款人不能重開', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'payer' })
    mocks.findUnique.mockResolvedValue({ ...event, payerId: 'new-payer' })
    await expect(setDiningEventOrdering({ eventId: 'event', expectedUpdatedAt: version, mode: 'open' })).rejects.toThrow('只有付款人')
  })
})
