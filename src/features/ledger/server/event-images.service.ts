import { randomUUID } from 'node:crypto'
import type { DiningEventImage, Prisma } from '@prisma/client'
import sharp from 'sharp'
import { prisma } from '#/lib/db/prisma'
import { resolveSessionUserId } from '#/features/auth/session'
import {
  MAX_EVENT_IMAGE_BYTES,
  MAX_EVENT_IMAGES,
  validateImageSelection,
  type EventImage,
} from '#/features/ledger/domain/event-images'
import { readEventImage, removeEventImage, saveEventImage } from '#/lib/storage/gcs'

export class EventImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function validateId(id: string) {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new EventImageError('無效的活動或圖片識別碼', 400)
}

async function currentUserId() {
  const userId = await resolveSessionUserId()
  if (!userId) throw new EventImageError('請先登入', 401)
  return userId
}

export async function requireEventImageAccess(eventId: string, manage = false) {
  const userId = await currentUserId()
  validateId(eventId)
  const event = await prisma.diningEvent.findUnique({ where: { id: eventId }, select: { payerId: true } })
  if (!event) throw new EventImageError('找不到活動', 404)
  if (manage && event.payerId !== userId) throw new EventImageError('只有付款人可管理活動圖片', 403)
  return userId
}

function presentImage(image: DiningEventImage): EventImage {
  return {
    id: image.id,
    fileName: image.fileName,
    createdAt: image.createdAt.toISOString(),
    url: `/api/events/${image.eventId}/images/${image.id}`,
  }
}

// This writes the shared event document so image changes, payer changes and event
// deletion conflict inside MongoDB transactions, without advancing the item version.
async function mutateEvent<T>(
  eventId: string,
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  draftOnly = false,
): Promise<T> {
  validateId(eventId)
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const event = await tx.diningEvent.findUnique({
            where: { id: eventId },
            select: { id: true, payerId: true, status: true, updatedAt: true },
          })
          if (!event) throw new EventImageError('找不到活動', 404)
          if (event.payerId !== userId)
            throw new EventImageError(draftOnly ? '只有付款人可刪除活動' : '只有付款人可管理活動圖片', 403)
          if (draftOnly && event.status !== 'DRAFT') throw new EventImageError('已結算活動不能刪除', 409)
          const result = await tx.diningEvent.updateMany({
            where: { id: eventId, payerId: userId, updatedAt: event.updatedAt },
            data: { imageMutationToken: randomUUID(), updatedAt: event.updatedAt },
          })
          if (result.count !== 1) throw new EventImageError('活動已更新，請重新整理後再操作', 409)
          return work(tx)
        },
        { maxWait: 5000, timeout: 10000 },
      )
    } catch (error) {
      if (attempt < 2 && error instanceof Error && 'code' in error && error.code === 'P2034') continue
      throw error
    }
  }
}

async function cleanupImage(
  image: Pick<DiningEventImage, 'id' | 'objectName'> & { cleanupAfter?: Date | null },
) {
  // An event can be deleted while an upload is still writing its GCS object.
  // Keep its record until that writer finishes, or its lease expires.
  if (image.cleanupAfter && image.cleanupAfter > new Date()) return false
  try {
    await removeEventImage(image.objectName)
    await prisma.diningEventImage.deleteMany({ where: { id: image.id, status: 'DELETING' } })
    return true
  } catch {
    // Keep the durable DELETING record: the cleanup command can retry later.
    console.error('活動圖片清理待重試', { imageId: image.id })
    return false
  }
}

async function cleanupImages(images: DiningEventImage[]) {
  let cleaned = 0
  for (let offset = 0; offset < images.length; offset += 5) {
    const results = await Promise.all(images.slice(offset, offset + 5).map(cleanupImage))
    cleaned += results.filter(Boolean).length
  }
  return cleaned
}

export async function listEventImages(eventId: string) {
  await requireEventImageAccess(eventId)
  const images = await prisma.diningEventImage.findMany({
    where: { eventId, status: 'READY' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return images.map(presentImage)
}

export async function uploadEventImage(
  eventId: string,
  file: { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
) {
  const userId = await requireEventImageAccess(eventId, true)
  const invalid = validateImageSelection(file)
  if (invalid) throw new EventImageError(invalid, 400)
  const input = Buffer.from(await file.arrayBuffer())
  if (input.length !== file.size) throw new EventImageError('圖片檔案大小不正確', 400)
  let bytes: Buffer
  try {
    const decoder = sharp(input, { limitInputPixels: 40_000_000, animated: false })
    const metadata = await decoder.metadata()
    if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
      throw new Error('unsupported image')
    }
    bytes = await decoder
      .rotate()
      .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92 })
      .toBuffer()
  } catch {
    throw new EventImageError('圖片無法讀取，請使用有效的 JPEG、PNG 或 WebP 圖片', 400)
  }
  if (bytes.length > MAX_EVENT_IMAGE_BYTES)
    throw new EventImageError('處理後的圖片超過 10 MB，請縮小圖片後重試', 400)
  const objectName = `events/${eventId}/${randomUUID()}.webp`
  const fileName =
    file.name
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 200) || '圖片'
  const image = await mutateEvent(eventId, userId, async (tx) => {
    const count = await tx.diningEventImage.count({
      where: { eventId, status: { in: ['PENDING', 'READY'] } },
    })
    if (count >= MAX_EVENT_IMAGES) throw new EventImageError('每個活動最多可放 20 張圖片', 400)
    return tx.diningEventImage.create({
      data: {
        eventId,
        uploadedByUserId: userId,
        objectName,
        fileName,
        sizeBytes: bytes.length,
        cleanupAfter: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
  })
  try {
    await saveEventImage(objectName, bytes)
    await mutateEvent(eventId, userId, async (tx) => {
      const result = await tx.diningEventImage.updateMany({
        where: { id: image.id, eventId, status: 'PENDING' },
        data: { status: 'READY', cleanupAfter: null },
      })
      if (result.count !== 1) throw new EventImageError('活動圖片已更新，請重新整理後再操作', 409)
    })
    return presentImage(image)
  } catch (error) {
    // PENDING also retains the object key if marking or cleanup fails.
    try {
      await prisma.diningEventImage.upsert({
        where: { id: image.id },
        create: { ...image, status: 'DELETING', cleanupAfter: null },
        update: { status: 'DELETING', cleanupAfter: null },
      })
      await cleanupImage({ ...image, cleanupAfter: null })
    } catch {
      console.error('活動圖片上傳清理待重試', { imageId: image.id })
    }
    if (error instanceof EventImageError) throw error
    throw new EventImageError('圖片上傳失敗，請稍後再試', 503)
  }
}

export async function getEventImage(eventId: string, imageId: string) {
  await requireEventImageAccess(eventId)
  validateId(imageId)
  const image = await prisma.diningEventImage.findFirst({ where: { id: imageId, eventId, status: 'READY' } })
  if (!image) throw new EventImageError('找不到圖片', 404)
  return readEventImage(image.objectName)
}

export async function deleteEventImage(eventId: string, imageId: string) {
  const userId = await currentUserId()
  validateId(imageId)
  const image = await mutateEvent(eventId, userId, async (tx) => {
    const found = await tx.diningEventImage.findFirst({ where: { id: imageId, eventId, status: 'READY' } })
    if (!found) throw new EventImageError('找不到圖片', 404)
    await tx.diningEventImage.updateMany({
      where: { id: imageId, eventId, status: 'READY' },
      data: { status: 'DELETING' },
    })
    return found
  })
  await cleanupImage(image)
  return { ok: true as const }
}

export async function deleteEventWithImages(eventId: string, userId: string) {
  const images = await mutateEvent(
    eventId,
    userId,
    async (tx) => {
      await tx.diningEventImage.updateMany({ where: { eventId }, data: { status: 'DELETING' } })
      const pending = await tx.diningEventImage.findMany({ where: { eventId } })
      await tx.diningEvent.delete({ where: { id: eventId } })
      return pending
    },
    true,
  )
  await cleanupImages(images)
  return { ok: true as const }
}

export async function cleanupPendingEventImages() {
  await prisma.diningEventImage.updateMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
    data: { status: 'DELETING' },
  })
  const images = await prisma.diningEventImage.findMany({
    where: {
      status: 'DELETING',
      OR: [{ cleanupAfter: null }, { cleanupAfter: { isSet: false } }, { cleanupAfter: { lte: new Date() } }],
    },
    take: 100,
    orderBy: { createdAt: 'asc' },
  })
  const cleaned = await cleanupImages(images)
  return {
    attempted: images.length,
    cleaned,
    remaining: await prisma.diningEventImage.count({ where: { status: 'DELETING' } }),
  }
}
