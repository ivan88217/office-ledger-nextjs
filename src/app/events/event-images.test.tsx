import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventImages } from './event-images'
import type { EventImage } from '#/features/ledger/domain/event-images'

const eventId = '111111111111111111111111'
const menu: EventImage = {
  id: '222222222222222222222222',
  fileName: '菜單.png',
  createdAt: '2026-10-02T00:00:00Z',
  url: `/api/events/${eventId}/images/222222222222222222222222`,
}
let saved: EventImage[]
let nextId: number
const fetchMock = vi.fn()
beforeEach(() => {
  saved = [menu]
  nextId = 1
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const file = (init.body as FormData).get('image') as File
      const image = { ...menu, id: String(nextId++), fileName: file.name, url: `${menu.url}-${nextId}` }
      saved.push(image)
      return Response.json({ image }, { status: 201 })
    }
    if (init?.method === 'DELETE') {
      saved = []
      return Response.json({ ok: true })
    }
    return Response.json({ images: saved })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('活動圖片介面', () => {
  it('非付款人只能查看與放大', async () => {
    render(<EventImages eventId={eventId} isPayer={false} />)
    await screen.findByRole('button', { name: '放大 菜單.png' })
    expect(screen.queryByRole('button', { name: '上傳圖片' })).toBeNull()
    expect(screen.queryByRole('button', { name: '刪除 菜單.png' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '放大 菜單.png' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('link', { name: '開啟完整圖片' }).getAttribute('href')).toBe(menu.url)
  })
  it('多圖上傳保留既有圖片，並顯示成功結果', async () => {
    render(<EventImages eventId={eventId} isPayer />)
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '上傳圖片' }) as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.change(screen.getByLabelText('選擇活動圖片'), {
      target: {
        files: [
          new File(['x'], '收據.png', { type: 'image/png' }),
          new File(['y'], '飲料.jpg', { type: 'image/jpeg' }),
        ],
      },
    })
    await screen.findByText('已上傳 2 張圖片')
    expect(screen.getByRole('button', { name: '放大 菜單.png' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '放大 收據.png' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '放大 飲料.jpg' })).toBeTruthy()
    expect(saved).toHaveLength(3)
  })
  it('一張失敗不影響其他圖片，重試只補上失敗檔案', async () => {
    const standard = fetchMock.getMockImplementation()!
    let failedOnce = false
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === 'POST' && !failedOnce) {
        failedOnce = true
        return Response.json({ message: '暫時無法上傳' }, { status: 503 })
      }
      return standard(url, init)
    })
    render(<EventImages eventId={eventId} isPayer />)
    await screen.findByRole('button', { name: '放大 菜單.png' })
    fireEvent.change(screen.getByLabelText('選擇活動圖片'), {
      target: {
        files: [
          new File(['x'], '收據.png', { type: 'image/png' }),
          new File(['y'], '飲料.jpg', { type: 'image/jpeg' }),
        ],
      },
    })
    const retry = await screen.findByRole('button', { name: '重試失敗圖片' })
    expect(screen.getByRole('button', { name: '放大 飲料.jpg' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '放大 收據.png' })).toBeNull()
    fireEvent.click(retry)
    await screen.findByRole('button', { name: '放大 收據.png' })
    expect(saved.filter((image) => image.fileName === '飲料.jpg')).toHaveLength(1)
    expect(saved.filter((image) => image.fileName === '收據.png')).toHaveLength(1)
  })
  it('刪除需要確認，取消時保留圖片', async () => {
    render(<EventImages eventId={eventId} isPayer />)
    await screen.findByRole('button', { name: '刪除 菜單.png' })
    fireEvent.click(screen.getByRole('button', { name: '刪除 菜單.png' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(saved).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '刪除 菜單.png' }))
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))
    await screen.findByText('已刪除圖片')
    expect(screen.queryByRole('button', { name: '放大 菜單.png' })).toBeNull()
    expect(saved).toEqual([])
  })
  it('錯誤檔案明確提示，不送出上傳', async () => {
    render(<EventImages eventId={eventId} isPayer />)
    await screen.findByRole('button', { name: '放大 菜單.png' })
    fireEvent.change(screen.getByLabelText('選擇活動圖片'), {
      target: { files: [new File(['pdf'], '收據.pdf', { type: 'application/pdf' })] },
    })
    await screen.findByText(/收據.pdf：請選擇 JPEG/)
    expect(saved).toHaveLength(1)
  })
  it('上傳期間遲到的圖片列表不覆蓋新的圖片', async () => {
    const standard = fetchMock.getMockImplementation()!
    let resolveOld: (response: Response) => void = () => {}
    let lists = 0
    const intervalSpy = vi.spyOn(window, 'setInterval')
    fetchMock.mockImplementation(async (url, init) => {
      if (!init?.method && ++lists === 2)
        return new Promise<Response>((resolve) => {
          resolveOld = resolve
        })
      return standard(url, init)
    })
    render(<EventImages eventId={eventId} isPayer />)
    await screen.findByRole('button', { name: '放大 菜單.png' })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => {
      const poll = intervalSpy.mock.calls.find(([, interval]) => interval === 10000)?.[0]
      expect(typeof poll).toBe('function')
      if (typeof poll === 'function') poll()
    })
    expect(lists).toBe(2)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('選擇活動圖片'), {
        target: { files: [new File(['x'], '收據.png', { type: 'image/png' })] },
      })
    })
    await act(async () => {
      resolveOld(Response.json({ images: [menu] }))
    })
    expect(screen.getByRole('button', { name: '放大 收據.png' })).toBeTruthy()
  })
})
