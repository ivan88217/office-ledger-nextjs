// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { MAX_EVENT_IMAGE_BYTES } from '#/features/ledger/domain/event-images'
import { handleImageRequest, readImageForm, requireSameOrigin } from './event-images.http'
import { EventImageError } from './event-images.service'

describe('圖片請求邊界', () => {
  it('拒絕跨來源、缺少來源及偽造來源的寫入', () => {
    for (const origin of [null, 'https://evil.test', 'null']) {
      const headers: Record<string, string> = { host: 'office.test' }
      if (origin) headers.origin = origin
      expect(() => requireSameOrigin(new Request('https://office.test/api', { headers }))).toThrow('活動頁面')
    }
    expect(() =>
      requireSameOrigin(
        new Request('https://office.test/api', {
          headers: { origin: 'https://office.test', host: 'office.test' },
        }),
      ),
    ).not.toThrow()
  })
  it('實際解析 multipart 圖片', async () => {
    const form = new FormData()
    form.append('image', new File(['bytes'], 'menu.png', { type: 'image/png' }))
    const result = await readImageForm(new Request('https://office.test/api', { method: 'POST', body: form }))
    expect(result.name).toBe('menu.png')
    expect(await result.text()).toBe('bytes')
  })
  it('不依賴 content-length，對串流本身設上限', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_EVENT_IMAGE_BYTES + 64 * 1024 + 1))
        controller.close()
      },
    })
    const request = new Request('https://office.test/api', {
      method: 'POST',
      body: stream,
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      duplex: 'half',
    } as RequestInit)
    await expect(readImageForm(request)).rejects.toMatchObject({ status: 413 })
  })
  it('保留已知錯誤狀態與私有快取設定', async () => {
    const result = await handleImageRequest(async () => {
      throw new EventImageError('請先登入', 401)
    })
    expect(result.status).toBe(401)
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(await result.json()).toEqual({ message: '請先登入' })
  })
  it('未知錯誤不回傳 credentials 或內部資料', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await handleImageRequest(async () => {
        throw new Error('private credential details')
      })
      expect(result.status).toBe(503)
      expect(await result.json()).toEqual({ message: '圖片服務暫時無法使用，請稍後再試' })
      expect(log).toHaveBeenCalledWith('活動圖片服務暫時無法使用')
    } finally {
      log.mockRestore()
    }
  })
})
