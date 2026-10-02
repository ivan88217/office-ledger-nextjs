import React, { type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiningEventClient } from './page-client'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), update: vi.fn(), writeText: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('#/app/events/event-images', () => ({ EventImages: () => null }))
vi.mock('#/features/auth/actions', () => ({
  addDiningEventItemAction: vi.fn(), deleteDiningEventAction: vi.fn(), finalizeDiningEventAction: vi.fn(),
  updateDiningEventAction: mocks.update, setDiningEventOrderingAction: vi.fn(),
}))
const event: ComponentProps<typeof DiningEventClient>['event'] = {
  id: 'event', title: '午餐', description: null, payerId: 'payer', payerUsername: '付款人',
  serviceChargeEnabled: false, serviceChargeRateBps: 0, status: 'DRAFT',
  finalizedTransactionId: null, finalizedTransactionTitle: null,
  createdAt: '2026-09-09T03:00:00.000Z', updatedAt: '2026-09-09T03:00:00.000Z',
  currentUserId: 'participant', orderDeadline: '2026-09-09T04:00:01.000Z', ordersClosedAt: null,
  serverNow: '2026-09-09T04:00:00.000Z', items: [],
  allocation: { subtotalCents: 0, serviceChargeCents: 0, totalCents: 0, users: [] },
}
const users = [{ id: 'payer', username: '付款人' }, { id: 'participant', username: '參加者' }]
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('活動頁面結單保護', () => {
  it('複製文案包含說明並保留換行', () => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00.000Z'))
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } })
    render(<DiningEventClient event={{ ...event, description: '請自備餐具\n12:30 領餐' }} users={users} />)
    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))
    expect(mocks.writeText).toHaveBeenCalledWith(`午餐\n請自備餐具\n12:30 領餐\n${window.location.href}\n12:00結單`)
  })
  it('編輯中的說明會帶入文案，清空後立即略過', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } })
    render(<DiningEventClient event={{ ...event, orderDeadline: null, description: '原說明' }} users={users} />)
    fireEvent.change(screen.getByLabelText('活動說明（選填）'), { target: { value: '新說明\n第二行' } })
    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))
    expect(mocks.writeText).toHaveBeenLastCalledWith(`午餐\n新說明\n第二行\n${window.location.href}`)
    fireEvent.change(screen.getByLabelText('活動說明（選填）'), { target: { value: '  \n  ' } })
    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))
    expect(mocks.writeText).toHaveBeenLastCalledWith(`午餐\n${window.location.href}`)
  })
  it('只編輯說明也會自動儲存，刷新不覆蓋待存內容', async () => {
    vi.useFakeTimers()
    mocks.update.mockResolvedValue({ ok: true, data: { updatedAt: '2026-09-09T05:00:00.000Z' } })
    const openEvent = { ...event, orderDeadline: null, description: '原說明' }
    const { rerender } = render(<DiningEventClient event={openEvent} users={users} />)
    fireEvent.change(screen.getByLabelText('活動說明（選填）'), { target: { value: '新說明\n第二行' } })
    rerender(<DiningEventClient event={{ ...openEvent, serverNow: '2026-09-09T04:00:01.000Z' }} users={users} />)
    expect((screen.getByLabelText('活動說明（選填）') as HTMLTextAreaElement).value).toBe('新說明\n第二行')
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      description: '新說明\n第二行', expectedUpdatedAt: event.updatedAt,
    }))
  })
  it('清空說明會自動儲存空字串', async () => {
    vi.useFakeTimers()
    mocks.update.mockResolvedValue({ ok: true, data: { updatedAt: '2026-09-09T05:00:00.000Z' } })
    render(<DiningEventClient event={{ ...event, orderDeadline: null, description: '原說明' }} users={users} />)
    fireEvent.change(screen.getByLabelText('活動說明（選填）'), { target: { value: '' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ description: '' }))
  })
  it('結單參加者可讀說明但不能編輯，付款人仍可編輯', () => {
    const closedEvent = { ...event, ordersClosedAt: event.serverNow, description: '請自備餐具\n12:30 領餐' }
    const { rerender } = render(<DiningEventClient event={closedEvent} users={users} />)
    expect((screen.getByLabelText('活動說明（選填）') as HTMLTextAreaElement).readOnly).toBe(true)
    rerender(<DiningEventClient event={{ ...closedEvent, currentUserId: 'payer' }} users={users} />)
    expect((screen.getByLabelText('活動說明（選填）') as HTMLTextAreaElement).readOnly).toBe(false)
  })
  it('已結算活動仍能閱讀與複製說明', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } })
    render(<DiningEventClient event={{ ...event, status: 'FINALIZED', orderDeadline: null, description: '請自備餐具\n12:30 領餐' }} users={users} />)
    const description = screen.getByLabelText('活動說明（選填）') as HTMLTextAreaElement
    expect(description.value).toBe('請自備餐具\n12:30 領餐')
    expect(description.readOnly).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))
    expect(mocks.writeText).toHaveBeenCalledWith(`午餐\n請自備餐具\n12:30 領餐\n${window.location.href}`)
  })
  it('複製含同日結單時間的活動文案', async () => {
    vi.setSystemTime(new Date('2026-09-09T01:00:00.000Z'))
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } })
    render(<DiningEventClient event={event} users={users} />)

    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))

    expect(mocks.writeText).toHaveBeenCalledWith(`午餐\n${window.location.href}\n12:00結單`)
  })

  it('跨日複製文案會補結單日期', () => {
    vi.setSystemTime(new Date('2026-09-08T01:00:00.000Z'))
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } })
    render(<DiningEventClient event={event} users={users} />)

    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))

    expect(mocks.writeText).toHaveBeenCalledWith(`午餐\n${window.location.href}\n9/9 12:00結單`)
  })

  it('未設定結單時間時不寫結單欄位', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } })
    render(<DiningEventClient event={{ ...event, orderDeadline: null }} users={users} />)

    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))

    expect(mocks.writeText).toHaveBeenCalledWith(`午餐\n${window.location.href}`)
  })

  it('活動名稱正在清空編輯時，仍複製已儲存的名稱', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } })
    render(<DiningEventClient event={{ ...event, orderDeadline: null }} users={users} />)
    fireEvent.change(screen.getByLabelText('活動名稱'), { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: '複製文案' }))

    expect(mocks.writeText).toHaveBeenCalledWith(`午餐\n${window.location.href}`)
  })

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
