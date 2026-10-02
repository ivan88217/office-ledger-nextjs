import { MAX_EVENT_IMAGE_BYTES } from '#/features/ledger/domain/event-images'
import { EventImageError } from './event-images.service'

export const IMAGE_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
}

export async function handleImageRequest(work: () => Promise<Response>) {
  try {
    return await work()
  } catch (error) {
    const known = error instanceof EventImageError
    if (!known) console.error('活動圖片服務暫時無法使用')
    return Response.json(
      { message: known ? error.message : '圖片服務暫時無法使用，請稍後再試' },
      {
        status: known ? error.status : 503,
        headers: IMAGE_RESPONSE_HEADERS,
      },
    )
  }
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  try {
    if (
      origin &&
      new URL(origin).host === request.headers.get('host') &&
      ['http:', 'https:'].includes(new URL(origin).protocol)
    )
      return
  } catch {
    /* Invalid origins are rejected below. */
  }
  throw new EventImageError('請從活動頁面操作圖片', 403)
}

export async function readImageForm(request: Request) {
  const maxRequestBytes = MAX_EVENT_IMAGE_BYTES + 64 * 1024
  const length = Number(request.headers.get('content-length'))
  if (length > maxRequestBytes) throw new EventImageError('每張圖片不可超過 10 MB', 413)
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data;')) throw new EventImageError('請以圖片檔案上傳', 400)
  if (!request.body) throw new EventImageError('請選擇圖片', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxRequestBytes) {
        await reader.cancel()
        throw new EventImageError('每張圖片不可超過 10 MB', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { 'content-type': contentType },
    }).formData()
    const file = form.get('image')
    if (!file || typeof file === 'string' || form.getAll('image').length !== 1)
      throw new Error('missing image')
    return file
  } catch {
    throw new EventImageError('請選擇一張有效的圖片', 400)
  }
}
