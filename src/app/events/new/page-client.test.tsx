import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewDiningEventForm } from './page-client'

const mocks = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('#/features/auth/actions', () => ({ createDiningEventAction: mocks.create }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('建立活動說明', () => {
  it('建立活動送出名稱及多行說明', async () => {
    mocks.create.mockResolvedValue({ ok: true, data: { eventId: 'event' } })
    render(<NewDiningEventForm users={[{ id: 'payer', username: '付款人' }]} currentUserId="payer" />)
    fireEvent.change(screen.getByLabelText('活動名稱'), { target: { value: '午餐' } })
    fireEvent.change(screen.getByLabelText('活動說明（選填）'), { target: { value: '請自備餐具\n12:30 領餐' } })
    await act(async () => { fireEvent.submit(screen.getByLabelText('活動名稱').closest('form')!) })
    expect(mocks.create).toHaveBeenCalledWith({ title: '午餐', description: '請自備餐具\n12:30 領餐', payerId: 'payer', orderDeadline: null })
    expect(mocks.push).toHaveBeenCalledWith('/events/event')
  })
})
