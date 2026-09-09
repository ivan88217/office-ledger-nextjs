import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EventOrderingControls } from './event-ordering-controls'

const action = vi.hoisted(() => vi.fn())
vi.mock('#/features/auth/actions', () => ({ setDiningEventOrderingAction: action }))
const event = { id: 'event', payerId: 'payer', currentUserId: 'payer', status: 'DRAFT', orderDeadline: null, updatedAt: 'version' }
beforeEach(() => { action.mockReset(); action.mockResolvedValue({ ok: true }) })
afterEach(cleanup)

describe('收單控制', () => {
  it('參加者只能查看已結單與時區資訊', () => {
    render(<EventOrderingControls event={{ ...event, currentUserId: 'participant', orderDeadline: '2026-09-09T04:00:00Z' }} isClosed disabled={false} onChanged={() => {}} />)
    expect(screen.queryByRole('button', { name: '重新開放' })).toBeNull()
    expect(screen.getByText(/2026-09-09 12:00/).textContent).toContain('台北時間 UTC+8')
    expect(screen.getByText(/參加者不能新增/)).toBeTruthy()
  })
  it('持續開放清除期限並重新整理', async () => {
    const changed = vi.fn()
    render(<EventOrderingControls event={event} isClosed disabled={false} onChanged={changed} />)
    fireEvent.click(screen.getByRole('button', { name: '重新開放' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ eventId: 'event', expectedUpdatedAt: 'version', mode: 'open', orderDeadline: null }))
    expect(changed).toHaveBeenCalled()
  })
  it('限時重開使用台北時間，失敗顯示錯誤', async () => {
    action.mockResolvedValue({ ok: false, message: '活動已更新' })
    render(<EventOrderingControls event={event} isClosed disabled={false} onChanged={() => {}} />)
    fireEvent.change(screen.getByLabelText('開放方式'), { target: { value: 'limited' } })
    fireEvent.change(screen.getByLabelText('結單時間（台北時間 UTC+8）'), { target: { value: '2099-09-09T12:10' } })
    fireEvent.click(screen.getByRole('button', { name: '重新開放' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ orderDeadline: '2099-09-09T04:10:00.000Z' })))
    expect((await screen.findByRole('alert')).textContent).toBe('活動已更新')
  })
  it('付款人可立即結單，但已結算不顯示控制', async () => {
    const { rerender } = render(<EventOrderingControls event={event} isClosed={false} disabled={false} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '立即結單' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ mode: 'close' })))
    rerender(<EventOrderingControls event={{ ...event, status: 'FINALIZED' }} isClosed disabled={false} onChanged={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
