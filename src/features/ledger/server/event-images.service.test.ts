// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  transaction: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
}))
const eventId = '111111111111111111111111'
const payerId = '222222222222222222222222'
type RecordImage = {
  id: string
  eventId: string
  objectName: string
  fileName: string
  status: string
  createdAt: Date
  [key: string]: unknown
}
let event: {
  id: string
  payerId: string
  status: string
  updatedAt: Date
  imageMutationToken?: string
} | null
let records: RecordImage[]
const objects = new Map<string, Buffer>()
function matches(row: RecordImage, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Record<string, unknown>[]).some((branch) => matches(row, branch))
    if (value && typeof value === 'object' && 'in' in value) return (value.in as unknown[]).includes(row[key])
    if (value && typeof value === 'object' && 'lt' in value) return (row[key] as Date) < (value.lt as Date)
    if (value && typeof value === 'object' && 'lte' in value) return (row[key] as Date) <= (value.lte as Date)
    if (value && typeof value === 'object' && 'isSet' in value)
      return value.isSet === (row[key] !== undefined)
    return row[key] === value
  })
}
const db = {
  diningEvent: {
    findUnique: vi.fn(async ({ where }) => (event?.id === where.id ? { ...event } : null)),
    updateMany: vi.fn(async ({ where, data }) => {
      if (
        !event ||
        event.id !== where.id ||
        event.payerId !== where.payerId ||
        event.updatedAt.getTime() !== where.updatedAt.getTime()
      )
        return { count: 0 }
      event = { ...event, ...data, updatedAt: data.updatedAt ?? new Date() }
      return { count: 1 }
    }),
    delete: vi.fn(async () => {
      const old = event
      event = null
      return old
    }),
  },
  diningEventImage: {
    findMany: vi.fn(async ({ where, take }) => records.filter((row) => matches(row, where)).slice(0, take)),
    findFirst: vi.fn(async ({ where }) => records.find((row) => matches(row, where)) ?? null),
    count: vi.fn(async ({ where }) => records.filter((row) => matches(row, where)).length),
    create: vi.fn(async ({ data }) => {
      const row = {
        id: (records.length + 1).toString(16).padStart(24, '0'),
        ...data,
        status: 'PENDING',
        createdAt: new Date(),
      }
      records.push(row)
      return { ...row }
    }),
    upsert: vi.fn(async ({ where, create, update }) => {
      const row = records.find((record) => record.id === where.id)
      if (row) {
        Object.assign(row, update)
        return { ...row }
      }
      records.push(create)
      return { ...create }
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const rows = records.filter((row) => matches(row, where))
      for (const row of rows) Object.assign(row, data)
      return { count: rows.length }
    }),
    deleteMany: vi.fn(async ({ where }) => {
      const count = records.filter((row) => matches(row, where)).length
      records = records.filter((row) => !matches(row, where))
      return { count }
    }),
  },
  $transaction: mocks.transaction,
}
vi.mock('#/lib/db/prisma', () => ({
  get prisma() {
    return db
  },
}))
vi.mock('#/features/auth/session', () => ({ resolveSessionUserId: mocks.user }))
vi.mock('#/lib/storage/gcs', () => ({
  saveEventImage: mocks.save,
  readEventImage: mocks.read,
  removeEventImage: mocks.remove,
}))
import {
  cleanupPendingEventImages,
  deleteEventImage,
  deleteEventWithImages,
  getEventImage,
  listEventImages,
  uploadEventImage,
} from './event-images.service'

let png: Buffer
function file(bytes = png, type = 'image/png', name = 'menu.png') {
  return { name, type, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer }
}
beforeEach(async () => {
  vi.clearAllMocks()
  event = { id: eventId, payerId, status: 'DRAFT', updatedAt: new Date('2026-10-02T01:00:00Z') }
  records = []
  objects.clear()
  mocks.user.mockResolvedValue(payerId)
  mocks.transaction.mockImplementation(async (work) => {
    const before = structuredClone({ event, records })
    try {
      return await work(db)
    } catch (error) {
      event = before.event
      records = before.records
      throw error
    }
  })
  mocks.save.mockImplementation(async (key, bytes) => {
    objects.set(key, bytes)
  })
  mocks.read.mockImplementation(async (key) => objects.get(key))
  mocks.remove.mockImplementation(async (key) => {
    objects.delete(key)
  })
  png = await sharp({ create: { width: 24, height: 32, channels: 3, background: '#cbd9d7' } })
    .png()
    .toBuffer()
})

describe('活動圖片後端', () => {
  it('未登入不能列出或取得圖片', async () => {
    mocks.user.mockResolvedValue(null)
    await expect(listEventImages(eventId)).rejects.toMatchObject({ status: 401 })
    await expect(getEventImage(eventId, '333333333333333333333333')).rejects.toMatchObject({ status: 401 })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('非付款人可查看，但不能上傳或刪除', async () => {
    const image = await uploadEventImage(eventId, file())
    mocks.user.mockResolvedValue('444444444444444444444444')
    expect(await listEventImages(eventId)).toHaveLength(1)
    expect(await getEventImage(eventId, image.id)).toBeInstanceOf(Buffer)
    await expect(uploadEventImage(eventId, file())).rejects.toMatchObject({ status: 403 })
    await expect(deleteEventImage(eventId, image.id)).rejects.toMatchObject({ status: 403 })
    expect(records).toHaveLength(1)
    expect(objects.size).toBe(1)
  })
  it.each(['DRAFT', 'FINALIZED'])('%s 狀態允許補圖、刪除，且不改餐點版本', async (status) => {
    event!.status = status
    const before = event!.updatedAt.getTime()
    const image = await uploadEventImage(eventId, file(png, 'image/png', '../菜單.png'))
    expect(image.fileName).toBe('菜單.png')
    expect(image).not.toHaveProperty('objectName')
    expect(image.url).toBe(`/api/events/${eventId}/images/${image.id}`)
    expect(event!.updatedAt.getTime()).toBe(before)
    expect(event!.imageMutationToken).toBeTruthy()
    expect(event!.status).toBe(status)
    expect((await sharp(await getEventImage(eventId, image.id)).metadata()).format).toBe('webp')
    await deleteEventImage(eventId, image.id)
    expect(await listEventImages(eventId)).toEqual([])
    expect(objects.size).toBe(0)
    expect(event!.updatedAt.getTime()).toBe(before)
  })
  it.each(['png', 'jpeg', 'webp'] as const)('%s 菜單保留超過 4096 px 的解析度與每個像素', async (format) => {
    const width = 5001
    const height = 64
    const pixels = Buffer.alloc(width * height * 3, 255)
    // Thin, contrasting strokes expose both downsampling and lossy compression.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x % 11 < 2 && y % 13 < 9) {
          const offset = (y * width + x) * 3
          pixels[offset] = 23
          pixels[offset + 1] = 47
          pixels[offset + 2] = 71
        }
      }
    }
    const input = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .toFormat(format)
      .toBuffer()
    const image = await uploadEventImage(eventId, file(input, `image/${format}`, `menu.${format}`))
    const stored = await getEventImage(eventId, image.id)
    expect(await sharp(stored).metadata()).toMatchObject({ format: 'webp', width, height })
    const original = await sharp(input).raw().toBuffer({ resolveWithObject: true })
    const uploaded = await sharp(stored).raw().toBuffer({ resolveWithObject: true })
    expect(uploaded.info).toEqual(original.info)
    expect(uploaded.data.equals(original.data)).toBe(true)
    expect(records[0].sizeBytes).toBe(stored.length)
  })
  it('照片依 EXIF 方向轉正，保留轉正後的解析度與像素並移除 metadata', async () => {
    const input = await sharp(png).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const image = await uploadEventImage(eventId, file(input, 'image/jpeg', 'menu.jpg'))
    const stored = await getEventImage(eventId, image.id)
    const metadata = await sharp(stored).metadata()
    expect(metadata).toMatchObject({ format: 'webp', width: 32, height: 24 })
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
    const original = await sharp(input).rotate().raw().toBuffer()
    const uploaded = await sharp(stored).raw().toBuffer()
    expect(uploaded.equals(original)).toBe(true)
  })
  it('不能用其他活動的圖片識別碼存取', async () => {
    const image = await uploadEventImage(eventId, file())
    records[0].eventId = '555555555555555555555555'
    await expect(getEventImage(eventId, image.id)).rejects.toMatchObject({ status: 404 })
    await expect(deleteEventImage(eventId, image.id)).rejects.toMatchObject({ status: 404 })
    expect(objects.size).toBe(1)
  })
  it('偽裝成 PNG 的文字檔、SVG 及空檔案不會存入 GCS', async () => {
    await expect(uploadEventImage(eventId, file(Buffer.from('not a png')))).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      uploadEventImage(eventId, file(Buffer.from('<svg/>'), 'image/svg+xml')),
    ).rejects.toMatchObject({ status: 400 })
    await expect(uploadEventImage(eventId, file(Buffer.alloc(0)))).rejects.toMatchObject({ status: 400 })
    expect(mocks.save).not.toHaveBeenCalled()
    expect(records).toEqual([])
  })
  it('容量包含尚未完成的上傳，不會超過 20 張', async () => {
    records = Array.from({ length: 20 }, (_, i) => ({
      id: i.toString().padStart(24, '0'),
      eventId,
      objectName: `pending-${i}`,
      fileName: 'menu',
      status: i % 2 ? 'READY' : 'PENDING',
      createdAt: new Date(),
    }))
    await expect(uploadEventImage(eventId, file())).rejects.toThrow('20 張')
    expect(objects.size).toBe(0)
    expect(records).toHaveLength(20)
  })
  it('GCS 上傳失敗不留下可見圖片', async () => {
    mocks.save.mockRejectedValue(new Error('GCS unavailable'))
    await expect(uploadEventImage(eventId, file())).rejects.toMatchObject({ status: 503 })
    expect(await listEventImages(eventId)).toEqual([])
    expect(records).toEqual([])
  })
  it('上傳途中付款人更換時拒絕完成，並清理已上傳物件', async () => {
    mocks.save.mockImplementation(async (key, bytes) => {
      objects.set(key, bytes)
      event!.payerId = '444444444444444444444444'
    })
    await expect(uploadEventImage(eventId, file())).rejects.toMatchObject({ status: 403 })
    expect(records).toEqual([])
    expect(objects.size).toBe(0)
  })
  it('上傳途中活動刪除時清理上傳，不恢復活動', async () => {
    mocks.save.mockImplementation(async (key, bytes) => {
      objects.set(key, bytes)
      event = null
    })
    await expect(uploadEventImage(eventId, file())).rejects.toMatchObject({ status: 404 })
    expect(records).toEqual([])
    expect(objects.size).toBe(0)
    expect(event).toBeNull()
  })
  it('清理失敗保留可重試記錄，圖片立即不可取得', async () => {
    const image = await uploadEventImage(eventId, file())
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.remove.mockRejectedValueOnce(new Error('offline'))
    await deleteEventImage(eventId, image.id)
    expect(await listEventImages(eventId)).toEqual([])
    await expect(getEventImage(eventId, image.id)).rejects.toMatchObject({ status: 404 })
    expect(records[0].status).toBe('DELETING')
    expect(await cleanupPendingEventImages()).toEqual({ attempted: 1, cleaned: 1, remaining: 0 })
    expect(objects.size).toBe(0)
    consoleError.mockRestore()
  })
  it('活動刪除會同時隱藏所有圖片並清理物件', async () => {
    await uploadEventImage(eventId, file())
    await uploadEventImage(eventId, file())
    await deleteEventWithImages(eventId, payerId)
    expect(event).toBeNull()
    expect(records).toEqual([])
    expect(objects.size).toBe(0)
  })
  it('活動刪除不遺失仍在上傳的清理資訊，延後完成的物件可重試清理', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.save.mockImplementation(async (key, bytes) => {
      await deleteEventWithImages(eventId, payerId)
      expect(records).toHaveLength(1)
      expect(records[0].status).toBe('DELETING')
      objects.set(key, bytes)
      mocks.remove.mockRejectedValueOnce(new Error('temporarily offline'))
    })
    await expect(uploadEventImage(eventId, file())).rejects.toMatchObject({ status: 404 })
    expect(records).toHaveLength(1)
    expect(objects.size).toBe(1)
    expect(await cleanupPendingEventImages()).toEqual({ attempted: 1, cleaned: 1, remaining: 0 })
    expect(objects.size).toBe(0)
    consoleError.mockRestore()
  })
  it('已結算活動仍然不能整個刪除', async () => {
    event!.status = 'FINALIZED'
    await expect(deleteEventWithImages(eventId, payerId)).rejects.toMatchObject({ status: 409 })
    expect(event).not.toBeNull()
  })
  it('清理只處理過期的 PENDING，不動正在上傳與 READY', async () => {
    const image = await uploadEventImage(eventId, file())
    records.push({ ...records[0], id: '444444444444444444444444', status: 'PENDING', createdAt: new Date() })
    records.push({
      ...records[0],
      id: '555555555555555555555555',
      objectName: 'stale',
      status: 'PENDING',
      createdAt: new Date(0),
    })
    expect(await cleanupPendingEventImages()).toEqual({ attempted: 1, cleaned: 1, remaining: 0 })
    expect(records.map((row) => row.id)).toEqual([image.id, '444444444444444444444444'])
    expect(objects.size).toBe(1)
  })
})
