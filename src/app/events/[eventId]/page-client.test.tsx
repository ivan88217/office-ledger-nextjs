import React, { type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiningEventClient } from './page-client'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), update: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('#/features/auth/actions', () => ({
  addDiningEventItemAction: vi.fn(), deleteDiningEventAction: vi.fn(), finalizeDiningEventAction: vi.fn(),
  updateDiningEventAction: mocks.update, setDiningEventOrderingAction: vi.fn(),
}))
const event: ComponentProps<typeof DiningEventClient>['event'] = {
  id: 'event', title: '午餐', payerId: 'payer', payerUsername: '付款人',
  serviceChargeEnabled: false, serviceChargeRateBps: 0, status: 'DRAFT',
  finalizedTransactionId: null, finalizedTransactionTitle: null,
  createdAt: '2026-09-09T03:00:00.000Z', updatedAt: '2026-09-09T03:00:00.000Z',
  currentUserId: 'participant', orderDeadline: '2026-09-09T04:00:01.000Z', ordersClosedAt: null,
  serverNow: '2026-09-09T04:00:00.000Z', items: [],
  allocation: { subtotalCents: 0, serviceChargeCents: 0, totalCents: 0, users: [] },
}
const users = [{ id: 'payer', username: '付款人' }, { id: 'participant', username: '參加者' }]
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

describe('活動頁面結單保護', () => {
  it('已開啟表單到時鎖住輸入與送出，但仍可取消離開', () => {
    vi.useFakeTimers()
    render(<DiningEventClient event={event} users={users} />)
    fireEvent.click(screen.getByRole('button', { name: '新增品項' }))
    expect((screen.getByLabelText('品名') as HTMLInputElement).disabled).toBe(false)
    act(() => { vi.advanceTimersByTime(1500) })
    expect((screen.getByLabelText('品名') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '新增品項' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('品名')).toBeNull()
  })
  it('付款人在結單後仍能新增品項', () => {
    render(<DiningEventClient event={{ ...event, currentUserId: 'payer', ordersClosedAt: event.serverNow }} users={users} />)
    fireEvent.click(screen.getByRole('button', { name: '新增品項' }))
    expect((screen.getByLabelText('品名') as HTMLInputElement).disabled).toBe(false)
  })
  it('表單開啟後收到新版本，仍用原資料版本送出以避免覆蓋', async () => {
    mocks.update.mockResolvedValue({ ok: false, message: '活動已更新，請重新整理後再操作' })
    const withItem = { ...event, orderDeadline: null, items: [{ id: 'item', name: '便當', amountCents: 10000, participantUserIds: ['participant'], participantUsernames: ['參加者'], recordedByUserId: null, recordedByUsername: null, order: 0 }] }
    const { rerender } = render(<DiningEventClient event={withItem} users={users} />)
    fireEvent.click(screen.getByRole('button', { name: /便當/ }))
    rerender(<DiningEventClient event={{ ...withItem, updatedAt: '2026-09-09T04:00:00.000Z' }} users={users} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存修改' })) })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ expectedUpdatedAt: event.updatedAt }))
    expect(screen.getByText('活動已更新，請重新整理後再操作')).toBeTruthy()
  })
})
