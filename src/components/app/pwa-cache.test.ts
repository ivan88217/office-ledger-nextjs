import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const workerSource = readFileSync('public/sw.js', 'utf8')
const scriptUrl = 'http://localhost:3000/_next/static/chunks/app/events/%5BeventId%5D/page.js'

function runWorker(cachedResponse: Response | undefined, networkResponse: Response) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const put = vi.fn()
  const remove = vi.fn().mockResolvedValue(true)
  const fetch = vi.fn().mockResolvedValue(networkResponse)
  runInNewContext(workerSource, {
    self: {
      location: { origin: 'http://localhost:3000' },
      addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler },
    },
    caches: {
      match: vi.fn().mockResolvedValue(cachedResponse),
      open: vi.fn().mockResolvedValue({ put, delete: remove }),
    },
    fetch,
    URL,
  })
  let response: Promise<Response> | undefined
  handlers.fetch({
    request: new Request(scriptUrl),
    respondWith: (result: Promise<Response>) => { response = result },
  })
  return { response: response!, fetch, put, remove }
}

describe('PWA 頁面腳本快取', () => {
  it.each(['no-store, must-revalidate', 'no-cache'])('不使用舊的 %s 腳本，載入含活動說明的新版本', async (policy) => {
    const oldScript = new Response('舊版活動頁面', { headers: { 'Cache-Control': policy } })
    const newScript = new Response('活動說明（選填）', { headers: { 'Cache-Control': policy } })
    const worker = runWorker(oldScript, newScript)

    expect(await (await worker.response).text()).toBe('活動說明（選填）')
    expect(worker.fetch).toHaveBeenCalledOnce()
    expect(worker.remove).toHaveBeenCalledWith(expect.objectContaining({ url: scriptUrl }))
    expect(worker.put).not.toHaveBeenCalled()
  })

  it.each(['no-store, must-revalidate', 'no-cache'])('首次取得的 %s 腳本不寫入快取', async (policy) => {
    const worker = runWorker(undefined, new Response('活動說明（選填）', { headers: { 'Cache-Control': policy } }))

    expect(await (await worker.response).text()).toBe('活動說明（選填）')
    expect(worker.put).not.toHaveBeenCalled()
  })

  it('正式版 immutable 腳本仍可直接從快取讀取', async () => {
    const script = new Response('正式版活動頁面', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })
    const worker = runWorker(script, new Response('網路版本'))

    expect(await (await worker.response).text()).toBe('正式版活動頁面')
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('首次取得的 immutable 腳本仍寫入快取', async () => {
    const worker = runWorker(undefined, new Response('正式版活動頁面', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }))

    expect(await (await worker.response).text()).toBe('正式版活動頁面')
    expect(worker.put).toHaveBeenCalledOnce()
  })
})
